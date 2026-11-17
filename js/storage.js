/**
 * BAZARIX — storage.js (Sprint 1 + 2)
 * Capa de almacenamiento. state.js ya no toca localStorage: le pide todo a StorageAdapter.
 *
 *  - Modo "local":  un solo usuario, todo en este navegador.
 *  - Modo "team":   para equipos. Offline-first: guarda SIEMPRE primero en un caché local y luego
 *                   sube solo lo que cambió (por filas, con versiones) a un transporte:
 *                     · SheetsTransport  -> Google Apps Script (la hoja del grupo)
 *                     · DemoTransport    -> servidor simulado dentro del navegador (para probar)
 *
 * Los dos modos usan claves distintas: no se mezclan datos.
 * Estados (Sync): saved · pending · saving · syncing · offline · error
 * Cargar ANTES de state.js (y después team_core.js, que usa el demo).
 */

const STORAGE_KEY = "EXPOSITORES_APP_STATE";
const STORAGE_MODE_KEY = "BAZARIX_STORAGE_MODE";
const TEAM_CACHE_KEY = "EXPOSITORES_APP_STATE__team";
const TEAM_CONFIG_KEY = "BAZARIX_TEAM_CONFIG";
const TEAM_META_KEY = "BAZARIX_SYNC_META__team";
const DEMO_DB_KEY = "BAZARIX_DEMO_DB";
const SHEETS_URL_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==========================================
// ESTADO DE SINCRONIZACIÓN (lo escucha el indicador)
// ==========================================
const Sync = {
  status: "saved",
  lastSavedAt: null,
  _listeners: [],
  on(fn) { this._listeners.push(fn); fn(this); },
  set(status) {
    this.status = status;
    if (status === "saved") this.lastSavedAt = Date.now();
    this._listeners.forEach((fn) => { try { fn(this); } catch (e) { console.error(e); } });
  },
  hasPending() { return ["pending", "saving", "offline", "error"].includes(this.status); },
};

// ==========================================
// MODO LOCAL
// ==========================================
const LocalAdapter = {
  name: "local",
  load() { return localStorage.getItem(STORAGE_KEY); },
  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      Sync.set("saved");
      return true;
    } catch (err) {
      console.error("Error al guardar datos:", err);
      Sync.set("error");
      return false;
    }
  },
};

// ==========================================
// CONFIGURACIÓN DEL EQUIPO + TRANSPORTES
// Contrato de un transporte:  ping() · pull(sinceRev) -> {rev, rows} · push(changes) -> {prevRev, rev, applied, conflicts}
// Si falla lanza Error (con .fatal = true si no tiene sentido reintentar, p. ej. clave incorrecta).
// ==========================================
function teamConfig() {
  try { return JSON.parse(localStorage.getItem(TEAM_CONFIG_KEY)) || null; } catch { return null; }
}
function teamConfigured() {
  const c = teamConfig();
  return Boolean(c) && (c.type === "demo" || (c.type === "sheets" && SHEETS_URL_RE.test(c.url || "") && Boolean(c.key)));
}

function makeSheetsTransport(cfg) {
  const call = async (op, extra) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 30000);
    try {
      // text/plain evita el "preflight" CORS que Apps Script no contesta
      const res = await fetch(cfg.url, {
        method: "POST", redirect: "follow", signal: ctl.signal,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ op, key: cfg.key, user: cfg.user || "", ...extra }),
      });
      const data = await res.json();
      if (!data.ok) {
        const err = new Error(data.error || data.code || "Error del servidor");
        err.code = data.code;
        err.fatal = data.code === "UNAUTHORIZED" || data.code === "BAD_CHANGE" || data.code === "BAD_REQUEST";
        throw err;
      }
      return data;
    } catch (err) {
      if (err.name === "AbortError") throw new Error("Tiempo de espera agotado");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    name: "sheets",
    ping: () => call("ping"),
    pull: (sinceRev) => call("pull", { sinceRev }),
    push: (changes) => call("push", { changes }),
  };
}

/** Servidor simulado: usa el MISMO Core.gs que Apps Script, guardando en localStorage. */
const DemoTransport = {
  name: "demo",
  latency: () => 400 + Math.random() * 500,
  async _call(op, extra) {
    await sleep(this.latency());
    if (localStorage.getItem("BAZARIX_DEMO_FAIL") === "1") throw new Error("Fallo simulado");
    let db;
    try { db = JSON.parse(localStorage.getItem(DEMO_DB_KEY)); } catch { db = null; }
    db = db || { props: { API_KEY: "demo", REV: "0", TEAM_NAME: "Demo" }, rows: [] };
    const store = makeMemoryStore_(db.props, db.rows);
    const res = bzxHandle_(store, JSON.parse(JSON.stringify({ op, key: "demo", ...extra })));
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify({ props: store.props, rows: store.rows }));
    if (!res.ok) { const err = new Error(res.error); err.code = res.code; err.fatal = true; throw err; }
    return res;
  },
  ping() { return this._call("ping"); },
  pull(sinceRev) { return this._call("pull", { sinceRev }); },
  push(changes) { return this._call("push", { changes }); },
};

function makeTransport() {
  const cfg = teamConfig();
  return cfg && cfg.type === "sheets" ? makeSheetsTransport(cfg) : DemoTransport;
}

// ==========================================
// MODO EQUIPO (offline-first, por filas)
// ==========================================
const TeamAdapter = {
  name: "team",
  transport: null,        // se crea al usarlo (las pruebas pueden poner el suyo)
  debounceMs: 1500,       // junta varios cambios seguidos en un solo envío
  minSavingMs: 900,       // "Guardando…" se ve al menos este tiempo
  batchSize: 100,
  dirty: false,
  inflight: false,
  retries: 0,
  started: false,
  _timer: null,
  _meta: null,

  tx() { return this.transport || (this.transport = makeTransport()); },

  // meta = { rev: última revisión del servidor que conocemos, base: { key: { v, h, b } } }
  meta() {
    if (!this._meta) {
      try { this._meta = JSON.parse(localStorage.getItem(TEAM_META_KEY)); } catch { this._meta = null; }
      if (!this._meta || typeof this._meta !== "object") this._meta = { rev: 0, base: {} };
    }
    return this._meta;
  },
  saveMeta() { try { localStorage.setItem(TEAM_META_KEY, JSON.stringify(this._meta)); } catch (e) { console.warn("meta:", e.message); } },
  resetMeta() { this._meta = { rev: 0, base: {} }; this.saveMeta(); },
  persistCache() { try { localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(AppState)); } catch (e) { console.warn("caché:", e.message); } },

  load() { return localStorage.getItem(TEAM_CACHE_KEY); },

  save(state) {
    try {
      localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(state));   // primero local: nunca se pierde nada
    } catch (err) {
      console.error("Caché local llena:", err);
      Sync.set("error");
      return false;
    }
    this.dirty = true;
    Sync.set(navigator.onLine === false ? "offline" : "pending");
    this.schedule(this.debounceMs);
    return true;
  },

  schedule(ms, fn) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => (fn ? fn() : this.flush()), ms);
  },

  backoff() { return Math.min(30000, 2000 * 2 ** Math.max(0, this.retries - 1)); },   // 2 s, 4 s, 8 s… máx 30 s

  fail(err, retryFn) {
    console.warn("Sincronización:", err.message);
    this.retries++;
    Sync.set("error");
    if (err.fatal) {
      this.dirty = this.dirty || false;
      if (typeof showToast === "function") showToast(`❌ ${err.message}`, "error");
      return;
    }
    this.schedule(this.backoff(), retryFn);
  },

  /** Sube lo que cambió. Si llegan cambios mientras sube, repite hasta quedar al día. */
  async flush() {
    if (this.inflight) return;
    this.inflight = true;
    try {
      while (this.dirty) {
        if (navigator.onLine === false) { Sync.set("offline"); return; }
        this.dirty = false;
        Sync.set("saving");
        const t0 = Date.now();
        try {
          const adopted = await this.pushDiff();
          this.retries = 0;
          const left = this.minSavingMs - (Date.now() - t0);
          if (left > 0) await sleep(left);
          if (adopted > 0 && typeof showToast === "function") {
            showToast(`⚠️ ${adopted} cambio(s) tuyos fueron reemplazados por una versión más reciente de otra persona`, "error");
          }
        } catch (err) {
          this.dirty = true;
          this.fail(err);
          return;
        }
      }
      Sync.set("saved");
    } finally {
      this.inflight = false;
    }
  },

  /** Calcula qué cambió respecto a lo que el servidor tiene y lo sube por tandas. Devuelve cuántos conflictos se resolvieron. */
  async pushDiff() {
    const meta = this.meta();
    this.normalize();
    const rows = RowSync.stateToRows(AppState);
    const changes = RowSync.diff(rows, meta.base);
    const conflicts = [];
    for (let i = 0; i < changes.length; i += this.batchSize) {
      const res = await this.tx().push(changes.slice(i, i + this.batchSize));
      for (const a of res.applied) {
        if (a.deleted) delete meta.base[a.key];
        else { const r = rows.get(a.key); meta.base[a.key] = { v: a.version, h: RowSync.hash(r.json), b: r.bazarId }; }
      }
      conflicts.push(...res.conflicts);
      if (res.prevRev === meta.rev) meta.rev = res.rev;   // si nadie más escribió en medio, ya estamos al día
      this.saveMeta();
    }
    if (conflicts.length) this.applyRemote(conflicts);    // en un choque gana lo que ya estaba en el servidor
    return conflicts.length;
  },

  /** Mezcla filas del servidor en el estado y deja la "base" alineada con lo que quedó localmente. */
  applyRemote(rows) {
    const meta = this.meta();
    RowSync.apply(AppState, rows);
    this.normalize();
    const now = RowSync.stateToRows(AppState);
    rows.forEach((r) => {
      if (r.deleted) delete meta.base[r.key];
      else if (now.has(r.key)) meta.base[r.key] = { v: r.version, h: RowSync.hash(now.get(r.key).json), b: r.bazarId };
    });
    this.persistCache();
    this.saveMeta();
    this.refreshUI();
  },

  /** Baja lo nuevo del servidor. Lo que tengas sin subir NO se pisa (se resuelve al subir). */
  async pull() {
    const meta = this.meta();
    Sync.set("syncing");
    const res = await this.tx().pull(meta.rev);
    this.normalize();
    const pending = new Set(RowSync.diff(RowSync.stateToRows(AppState), meta.base).map((c) => c.key));
    const rows = (res.rows || []).filter((r) => !pending.has(r.key));
    if (rows.length) this.applyRemote(rows);
    meta.rev = Math.max(meta.rev, res.rev);
    this.saveMeta();
    if (pending.size || RowSync.diff(RowSync.stateToRows(AppState), meta.base).length) {
      this.dirty = true;
      Sync.set("pending");
      this.schedule(this.debounceMs);
    } else {
      Sync.set("saved");
    }
  },

  /** Primero baja (para mezclar), luego sube lo que sea nuevo en este dispositivo. */
  async sync() {
    try {
      await this.pull();
      this.dirty = true;
      await this.flush();
    } catch (err) {
      this.fail(err, () => this.sync());
      throw err;
    }
  },

  async start() {
    if (this.started || !teamConfigured()) return;
    this.started = true;
    try { await this.sync(); } catch { /* ya se avisó y se reintenta */ }
  },

  syncNow() { this.retries = 0; return this.sync(); },

  /** Completa valores por defecto (igual que al cargar la app) para que todos los dispositivos suban filas idénticas. */
  normalize() {
    const q = AppState.searchQuery;            // migrateState vacía la búsqueda: se respeta lo que la persona escribió
    migrateState(AppState);
    AppState.searchQuery = q;
  },

  refreshUI() {
    if (typeof renderAll === "function") renderAll();
    if (typeof syncCanvasWithState === "function" && typeof bazaarCanvas !== "undefined" && bazaarCanvas?.ctx) syncCanvasWithState();
  },
};

// ==========================================
// PUNTO DE ENTRADA PARA EL RESTO DE LA APP
// ==========================================
const StorageAdapter = {
  mode() {
    try { return localStorage.getItem(STORAGE_MODE_KEY) === "team" ? "team" : "local"; } catch { return "local"; }
  },
  impl() { return this.mode() === "team" ? TeamAdapter : LocalAdapter; },
  load() { return this.impl().load(); },
  save(state) { return this.impl().save(state); },
};

/** Cambia de modo (recarga la página para cargar el otro conjunto de datos). */
async function setStorageMode(mode) {
  mode = mode === "team" ? "team" : "local";
  if (mode === StorageAdapter.mode()) return;
  if (Sync.hasPending()) {
    showToast("Espera a que termine de guardar antes de cambiar de modo", "error");
    return;
  }
  if (mode === "team" && !teamConfigured()) { openTeamConfig(); return; }   // primero hay que conectar un equipo
  const label = mode === "team" ? "Equipo" : "Local";
  if (!await appConfirm(`Vas a cambiar al modo ${label}. Cada modo guarda sus datos por separado; no se pierde nada del otro.`, "Cambiar modo", "Cambiar")) return;
  if (mode === "team" && !localStorage.getItem(TEAM_CACHE_KEY) && localStorage.getItem(STORAGE_KEY)) {
    if (await appConfirm("¿Quieres empezar el modo Equipo con una copia de tus datos locales actuales? (Se subirán al equipo.)", "Copiar datos locales", "Copiar")) {
      localStorage.setItem(TEAM_CACHE_KEY, localStorage.getItem(STORAGE_KEY));
    }
  }
  localStorage.setItem(STORAGE_MODE_KEY, mode);
  location.reload();
}

// ── Ventana "Conexión del equipo" ──
function openTeamConfig() {
  const cfg = teamConfig() || { type: "sheets", url: "", key: "" };
  document.getElementById("team-type").value = cfg.type === "demo" ? "demo" : "sheets";
  document.getElementById("team-url").value = cfg.url || "";
  document.getElementById("team-key").value = cfg.key || "";
  document.getElementById("team-test-result").textContent = "";
  updateTeamConfigFields();
  document.getElementById("settings-menu")?.classList.remove("open");
  openModal("modal-team");
}

function updateTeamConfigFields() {
  const demo = document.getElementById("team-type").value === "demo";
  document.getElementById("team-sheets-fields").hidden = demo;
  document.getElementById("team-demo-note").hidden = !demo;
}

function readTeamForm() {
  const type = document.getElementById("team-type").value === "demo" ? "demo" : "sheets";
  if (type === "demo") return { type };
  return { type, url: document.getElementById("team-url").value.trim(), key: document.getElementById("team-key").value.trim() };
}

function validateTeamForm(cfg) {
  if (cfg.type === "demo") return "";
  if (!SHEETS_URL_RE.test(cfg.url)) return "La URL debe ser la de la aplicación web (termina en /exec).";
  if (cfg.key.length < 8) return "Falta la clave del equipo.";
  return "";
}

async function testTeamConnection() {
  const out = document.getElementById("team-test-result");
  const cfg = readTeamForm();
  const problem = validateTeamForm(cfg);
  if (problem) { out.textContent = `⚠️ ${problem}`; return; }
  out.textContent = "Probando…";
  try {
    const tx = cfg.type === "demo" ? DemoTransport : makeSheetsTransport(cfg);
    const info = await tx.ping();
    out.textContent = `✅ Conectado${info.equipo ? ` a «${info.equipo}»` : ""} · revisión ${info.rev}`;
  } catch (err) {
    out.textContent = `❌ ${err.code === "UNAUTHORIZED" ? "Clave incorrecta." : `No se pudo conectar: ${err.message}`}`;
  }
}

async function saveTeamConfig() {
  const cfg = readTeamForm();
  const problem = validateTeamForm(cfg);
  if (problem) { document.getElementById("team-test-result").textContent = `⚠️ ${problem}`; return; }
  const old = teamConfig();
  const changedTeam = old && (old.type !== cfg.type || old.url !== cfg.url);
  if (changedTeam && localStorage.getItem(TEAM_CACHE_KEY)) {
    if (!await appConfirm("Vas a conectar OTRO equipo. Se borrará el caché local del modo Equipo (el modo Local no se toca).", "Cambiar de equipo", "Cambiar")) return;
    localStorage.removeItem(TEAM_CACHE_KEY);
    localStorage.removeItem(TEAM_META_KEY);
  }
  localStorage.setItem(TEAM_CONFIG_KEY, JSON.stringify(cfg));
  if (StorageAdapter.mode() !== "team" && !localStorage.getItem(TEAM_CACHE_KEY) && localStorage.getItem(STORAGE_KEY)) {
    if (await appConfirm("¿Quieres empezar con una copia de tus datos locales? (Se subirán al equipo.)", "Copiar datos locales", "Copiar")) {
      localStorage.setItem(TEAM_CACHE_KEY, localStorage.getItem(STORAGE_KEY));
    }
  }
  localStorage.setItem(STORAGE_MODE_KEY, "team");
  location.reload();
}

async function syncNowTeam() {
  try {
    showToast("Sincronizando…");
    await TeamAdapter.syncNow();
    showToast("✅ Sincronizado");
  } catch (err) {
    showToast(`❌ ${err.message}`, "error");
  }
}

// ==========================================
// INDICADOR DE GUARDADO (.save-indicator: menú y encabezado)
// ==========================================
const SYNC_LABELS = {
  saved:   "Guardado",
  pending: "Cambios por guardar…",
  saving:  "Guardando cambios…",
  syncing: "Sincronizando…",
  offline: "Sin conexión · se guardará al volver",
  error:   "No se pudo guardar · reintentando",
};

function bindSaveIndicator() {
  const els = [...document.querySelectorAll(".save-indicator")];
  if (!els.length) return;
  let hideTimer = null;
  Sync.on((s) => {
    els.forEach((el) => {
      el.dataset.status = s.status;
      el.innerHTML = `<span class="sync-dot" aria-hidden="true"></span><span>${SYNC_LABELS[s.status]}</span>`;
    });
    clearTimeout(hideTimer);
    if (s.lastSavedAt === null && s.status === "saved") { els.forEach((el) => el.classList.remove("show")); return; }   // arranque: sin avisos
    els.forEach((el) => el.classList.add("show"));
    if (s.status === "saved") hideTimer = setTimeout(() => els.forEach((el) => el.classList.remove("show")), 2500);
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("online", () => { if (TeamAdapter.dirty) TeamAdapter.flush(); });
  window.addEventListener("offline", () => { if (TeamAdapter.dirty) Sync.set("offline"); });
  window.addEventListener("beforeunload", (e) => {
    if (StorageAdapter.mode() === "team" && Sync.hasPending()) { e.preventDefault(); e.returnValue = ""; }
  });
  document.addEventListener("DOMContentLoaded", bindSaveIndicator);
  window.addEventListener("load", () => { if (StorageAdapter.mode() === "team") TeamAdapter.start(); });
}

if (typeof module !== "undefined") module.exports = { Sync, LocalAdapter, TeamAdapter, DemoTransport, StorageAdapter };
