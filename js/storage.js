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
const TEAM_ME_KEY = "BAZARIX_TEAM_ME";
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
  return Boolean(c) && (c.type === "demo" || (c.type === "sheets" && SHEETS_URL_RE.test(c.url || "") && Boolean(c.key || c.token)));
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
        body: JSON.stringify({ op, ...(cfg.key ? { key: cfg.key } : { token: cfg.token }), user: cfg.nombre || "", ...extra }),
      });
      const data = await res.json();
      if (!data.ok) {
        const err = new Error(data.error || data.code || "Error del servidor");
        err.code = data.code;
        err.fatal = ["UNAUTHORIZED", "BAD_CHANGE", "BAD_REQUEST"].includes(data.code);
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
    call,
    ping: () => call("ping"),
    pull: (sinceRev, knownBazaars) => call("pull", { sinceRev, knownBazaars }),
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
    const store = makeMemoryStore_(db.props, db.rows, db.tables);
    const res = bzxHandle_(store, JSON.parse(JSON.stringify({ op, key: "demo", ...extra })));
    localStorage.setItem(DEMO_DB_KEY, JSON.stringify({ props: store.props, rows: store.rows, tables: store.tables }));
    if (!res.ok) { const err = new Error(res.error); err.code = res.code; err.fatal = true; throw err; }
    return res;
  },
  call(op, extra) { return this._call(op, extra); },
  ping() { return this._call("ping"); },
  pull(sinceRev, knownBazaars) { return this._call("pull", { sinceRev, knownBazaars }); },
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
  lastActivity: Date.now(),   // última vez que hubo movimiento (mío o ajeno): define qué tan seguido se consulta
  _pollTimer: null,
  _polling: false,
  _deferred: false,           // hay cambios ajenos esperando a que dejes de escribir para dibujarse
  _deferredAt: 0,
  _deferredFull: false,
  _stale: false,              // otras pantallas quedaron desactualizadas: se redibujan al entrar a ellas

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
    this.lastActivity = Date.now();
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
          const { adopted, rejected } = await this.pushDiff();
          this.retries = 0;
          const left = this.minSavingMs - (Date.now() - t0);
          if (left > 0) await sleep(left);
          if (rejected.length && typeof showToast === "function") {
            showToast(`🔒 ${rejected[0]}. Se deshicieron ${rejected.length} cambio(s).`, "error");
          }
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
    const rejected = [];
    for (let i = 0; i < changes.length; i += this.batchSize) {
      const res = await this.tx().push(changes.slice(i, i + this.batchSize));
      for (const a of res.applied) {
        if (a.deleted) delete meta.base[a.key];
        else { const r = rows.get(a.key); meta.base[a.key] = { v: a.version, h: RowSync.hash(r.json), b: r.bazarId }; }
      }
      conflicts.push(...res.conflicts);
      rejected.push(...(res.rejected || []));
      if (res.prevRev === meta.rev) meta.rev = res.rev;   // si nadie más escribió en medio, ya estamos al día
      this.saveMeta();
    }
    // En un choque gana lo que ya estaba en el servidor. Si tu rol no permite el cambio, se deshace con lo vigente.
    if (conflicts.length || rejected.length) this.applyRemote([...conflicts, ...rejected.map((r) => r.row)]);
    return { adopted: conflicts.length, rejected: rejected.map((r) => r.reason) };
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
    this.refreshUI(rows.some((r) => FULL_REFRESH.has(r.coleccion)));
  },

  /** Baja lo nuevo del servidor. Lo que tengas sin subir NO se pisa (se resuelve al subir). */
  async pull(quiet) {
    const meta = this.meta();
    if (!quiet) Sync.set("syncing");
    const res = await this.tx().pull(meta.rev, this.knownBazaars());
    this.normalize();
    const pending = new Set(RowSync.diff(RowSync.stateToRows(AppState), meta.base).map((c) => c.key));
    const rows = (res.rows || []).filter((r) => !pending.has(r.key));
    if (rows.length) this.applyRemote(rows);
    this.pruneBazaars(res.access);
    meta.rev = Math.max(meta.rev, res.rev);
    const memChanged = res.memRev !== undefined && (Number(res.memRev) || 0) !== (Number(meta.memRev) || 0);
    meta.memRev = Number(res.memRev) || 0;
    this.saveMeta();
    if (memChanged && this.me) {                  // cambió quién eres o qué puedes hacer: se recarga tu acceso
      try { await this.loadMe(); this.refreshUI(true); } catch { /* se reintenta en la siguiente consulta */ }
    }
    if (pending.size || RowSync.diff(RowSync.stateToRows(AppState), meta.base).length) {
      this.dirty = true;
      Sync.set("pending");
      this.schedule(this.debounceMs);
    } else if (!quiet || Sync.status === "error" || Sync.status === "offline") {
      Sync.set("saved");
    }
  },

  // ── Sincronización en vivo ──
  // Cada pocos segundos se pregunta SOLO "¿hay algo nuevo?" (consulta barata); si sí, se baja. El ritmo se adapta:
  // 4 s con movimiento reciente, 10 s después de 1 min tranquilo, 20 s después de 5 min, y 60 s con la pestaña oculta.
  pollInterval() {
    if (typeof document !== "undefined" && document.hidden) return 60000;
    const idle = Date.now() - this.lastActivity;
    return idle < 60000 ? 4000 : idle < 300000 ? 10000 : 20000;
  },
  startPolling() { if (this._polling) return; this._polling = true; this.schedulePoll(); },
  stopPolling() { this._polling = false; clearTimeout(this._pollTimer); },
  schedulePoll() {
    clearTimeout(this._pollTimer);
    if (this._polling) this._pollTimer = setTimeout(() => this.tick(), this.pollInterval());
  },
  /** Una vuelta de consulta. Con cambios tuyos sin subir o sin red no hace nada (ya se encarga flush). */
  async tick() {
    try {
      this.runDeferred();
      if (navigator.onLine === false || this.inflight || this.dirty) return;
      const meta = this.meta();
      const r = await this.tx().call("rev");
      if (r.rev > meta.rev || (Number(r.memRev) || 0) !== (Number(meta.memRev) || 0)) {
        this.lastActivity = Date.now();
        await this.pull(true);
      }
    } catch (err) {
      if (err.fatal) { this.stopPolling(); this.fail(err); }
      else console.warn("Consulta:", err.message);
    } finally {
      this.schedulePoll();
    }
  },

  /** Bazares que este dispositivo ya conoce (el servidor manda completos los que no). */
  knownBazaars() { return Object.keys(this.meta().base).filter((k) => k.startsWith("bazares:")).map((k) => k.slice(8)); },

  /** Si ya no eres miembro de un bazar, se quita de este dispositivo. access = ids vigentes (null = dueño, no se poda). */
  pruneBazaars(access) {
    if (!Array.isArray(access)) return 0;
    const meta = this.meta(), keep = new Set(access);
    let n = 0;
    Object.keys(meta.base).filter((k) => k.startsWith("bazares:")).forEach((k) => {
      const id = k.slice(8);
      if (keep.has(id)) return;
      delete AppState.bazaars[id];
      Object.keys(meta.base).forEach((b) => { if (meta.base[b].b === id) delete meta.base[b]; });
      n++;
    });
    if (n) {
      this.normalize();
      this.persistCache();
      this.saveMeta();
      this.refreshUI(true);
      if (typeof showToast === "function") showToast(`Ya no tienes acceso a ${n} bazar(es); se quitaron de este dispositivo`, "error");
    }
    return n;
  },

  me: null,
  async loadMe() {
    const res = await this.tx().call("me");
    this.me = res.me;
    try { localStorage.setItem(TEAM_ME_KEY, JSON.stringify(res.me)); } catch { /* sin espacio */ }
    if (typeof applyRoleGate === "function") applyRoleGate();
    return res.me;
  },

  /** Primero baja (para mezclar), luego sube lo que sea nuevo en este dispositivo. */
  async sync() {
    try {
      await this.loadMe();
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
    try { await this.sync(); this.startPolling(); }
    catch (err) { if (!err.fatal) this.startPolling(); /* sin red: ya se avisó y se reintenta; la consulta sigue */ }
  },

  syncNow() { this.retries = 0; return this.sync(); },

  /** Completa valores por defecto (igual que al cargar la app) para que todos los dispositivos suban filas idénticas. */
  normalize() {
    const q = AppState.searchQuery;            // migrateState vacía la búsqueda: se respeta lo que la persona escribió
    migrateState(AppState);
    AppState.searchQuery = q;
  },

  /**
   * Redibuja tras recibir cambios ajenos, SIN interrumpirte: si estás escribiendo o arrastrando en el plano, espera.
   * full = cambió algo estructural (bazares, pisos, catálogos, staff…): se redibuja todo; si no, solo la pantalla visible.
   */
  refreshUI(full) {
    if (userIsEditing() || canvasBusy()) {
      this._deferred = true;
      this._deferredAt = this._deferredAt || Date.now();
      this._deferredFull = this._deferredFull || Boolean(full);
      return;
    }
    this._deferred = false; this._deferredAt = 0; this._deferredFull = false;
    this.doRefresh(Boolean(full));
  },
  runDeferred() {
    if (!this._deferred || canvasBusy()) return;
    if (userIsEditing() && Date.now() - this._deferredAt < 30000) return;   // tras 30 s se dibuja de todos modos
    const full = this._deferredFull;
    this._deferred = false; this._deferredAt = 0; this._deferredFull = false;
    this.doRefresh(full);
  },
  doRefresh(full) {
    if (typeof renderAll !== "function") return;
    const tab = typeof document !== "undefined" ? document.body?.dataset?.tab : "";
    const fns = TAB_RENDERS[tab];
    if (full || !fns) {
      renderAll();
      this._stale = false;
      if (typeof syncCanvasWithState === "function" && typeof bazaarCanvas !== "undefined" && bazaarCanvas?.ctx) syncCanvasWithState();
    } else {
      fns.forEach((name) => { if (typeof globalThis[name] === "function") globalThis[name](); });
      if (tab === "mapa" && typeof bazaarCanvas !== "undefined" && bazaarCanvas?.ctx) { bazaarCanvas.loadZones(); bazaarCanvas.render(); }
      if (typeof updateAlertBadge === "function") updateAlertBadge();
      this._stale = true;                          // las demás pantallas se actualizan al entrar a ellas
    }
    if (typeof document !== "undefined" && document.getElementById("modal-caja")?.classList.contains("open") && typeof renderCaja === "function") {
      try { renderCaja(); } catch { /* la caja ya no existe */ }
    }
  },
};

// ── Redibujado con cuidado ──
/** Pantalla visible → qué funciones la dibujan (el resto se redibuja al entrar a ella). */
const TAB_RENDERS = {
  expositores: ["renderExpositores"], ficha: ["renderFicha"], tareas: ["renderTareas"], compras: ["renderCompras"],
  "minuto-a-minuto": ["renderMinuteByMinute"], extras: ["renderExtras"], invitados: ["renderInvitados"],
  finanzas: ["renderFinanzasTable", "renderFinanzasStats"], costos: ["renderCostosUI"], mapa: ["renderChecklist"],
  "dia-evento": ["renderPanelDiaEvento"], estadisticas: ["updateCharts", "renderMetricasFinancieras"], alertas: ["renderAlertas"],
};
/** Colecciones que afectan a muchas pantallas: si llegan, se redibuja todo. */
const FULL_REFRESH = new Set(["bazares", "pisos", "categorias", "caracteristicas", "plantillas", "roles", "responsables", "costos"]);

/** ¿La persona está escribiendo en algo que se volvería a dibujar? (barras de filtros y ventanas no cuentan). */
function userIsEditing() {
  if (typeof document === "undefined") return false;
  const a = document.activeElement;
  if (!a || a === document.body || !a.tagName) return false;
  const tag = a.tagName;
  const typing = tag === "TEXTAREA" || tag === "SELECT" ||
    (tag === "INPUT" && !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(a.type));
  return typing && Boolean(a.closest?.(".page-section")) && !a.closest(".filter-bar, .section-header, .search-bar");
}
/** ¿Se está arrastrando algo en el plano? */
function canvasBusy() {
  if (typeof bazaarCanvas === "undefined" || !bazaarCanvas) return false;
  return Boolean(bazaarCanvas.isDraggingTable || bazaarCanvas.isDraggingElement || bazaarCanvas.isDraggingZone ||
    bazaarCanvas.imgDragging || bazaarCanvas.imgResizing || bazaarCanvas.imgRotating || bazaarCanvas.draggingZonePoint);
}
/** Al cambiar de pantalla: si quedaron desactualizadas por cambios ajenos, se redibuja todo una vez. */
function teamFlushStale() {
  if (TeamAdapter._stale && typeof renderAll === "function") { TeamAdapter._stale = false; renderAll(); }
}

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

// ── Quién soy y qué puedo hacer (el servidor lo vuelve a validar siempre) ──
function teamMe() {
  if (TeamAdapter.me) return TeamAdapter.me;
  try { TeamAdapter.me = JSON.parse(localStorage.getItem(TEAM_ME_KEY)); } catch { TeamAdapter.me = null; }
  return TeamAdapter.me;
}
function teamIsOwner() { return Boolean(teamMe()?.user?.owner); }
function teamRoleFor(bazarId) {
  const me = teamMe();
  if (!me) return null;
  if (me.user?.owner) return { rol: "owner", rolNombre: "Dueño de la hoja", todo: true, permisos: [], rank: 1000 };
  return (me.memberships || []).find((m) => m.bazarId === bazarId) || null;
}
function teamIsAdmin(bazarId) { const r = teamRoleFor(bazarId); return Boolean(r && (r.todo || r.rol === "admin")); }
function teamCan(perm, bazarId) { const r = teamRoleFor(bazarId); return Boolean(r && (r.todo || (r.permisos || []).includes(perm))); }

/**
 * Antes de crear un bazar en modo Equipo: el dueño pasa directo; los demás necesitan un código de creación
 * (un bazar por crédito) y quedan registrados como ADMIN de ese bazar. Devuelve false si no se puede.
 */
async function teamBeforeCreateBazaar(id) {
  if (StorageAdapter.mode() !== "team") return true;
  try {
    const me = teamMe() || await TeamAdapter.loadMe();
    if (me.user.owner) return true;
    const tx = TeamAdapter.tx();
    if ((me.creditos || 0) < 1) {
      const code = await appPrompt("Para crear un bazar necesitas un código de creación que te dé el dueño de la hoja.", "", "Código para crear bazares");
      if (!code) return false;
      const redeemed = await tx.call("redeem", { code });   // el transporte agrega tu token
      TeamAdapter.me = redeemed.me;
    }
    const claimed = await tx.call("claimBazaar", { bazarId: id });
    TeamAdapter.me = claimed.me;
    try { localStorage.setItem(TEAM_ME_KEY, JSON.stringify(claimed.me)); } catch { /* sin espacio */ }
    return true;
  } catch (err) {
    showToast(`❌ ${err.code === "BAD_CODE" ? "Código inválido o vencido" : err.message || "No se pudo crear el bazar (¿hay conexión?)"}`, "error");
    return false;
  }
}

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
const _el = (id) => document.getElementById(id);

function openTeamConfig() {
  const cfg = teamConfig();
  const mode = !cfg ? "member" : cfg.type === "demo" ? "demo" : cfg.key ? "owner" : "member";
  _el("team-type").value = mode;
  _el("team-url").value = cfg?.url || "";
  _el("team-key").value = cfg?.key || "";
  _el("team-code").value = "";
  _el("team-nombre").value = cfg?.nombre || "";
  _el("team-test-result").textContent = "";
  const note = _el("team-member-note");
  note.hidden = !(cfg && cfg.token);
  note.textContent = cfg && cfg.token ? `Ya estás conectado${cfg.nombre ? ` como ${cfg.nombre}` : ""}. Escribe otro código solo si quieres unirte a otro bazar.` : "";
  updateTeamConfigFields();
  document.getElementById("settings-menu")?.classList.remove("open");
  openModal("modal-team");
}

function updateTeamConfigFields() {
  const mode = _el("team-type").value;
  _el("team-sheets-fields").hidden = mode === "demo";
  _el("team-owner-fields").hidden = mode !== "owner";
  _el("team-member-fields").hidden = mode !== "member";
  _el("team-demo-note").hidden = mode !== "demo";
}

function readTeamForm() {
  return { mode: _el("team-type").value, url: _el("team-url").value.trim(), key: _el("team-key").value.trim(),
    code: _el("team-code").value.trim(), nombre: _el("team-nombre").value.trim() };
}

function validateTeamForm(f) {
  if (f.mode === "demo") return "";
  if (!SHEETS_URL_RE.test(f.url)) return "La URL debe ser la de la aplicación web (termina en /exec).";
  if (f.mode === "owner") return f.key.length >= 8 ? "" : "Falta la clave del dueño.";
  const old = teamConfig();
  const alreadyIn = Boolean(old && old.token && old.url === f.url);
  if (!alreadyIn && !f.code) return "Escribe tu código de invitación.";
  if (!alreadyIn && !f.nombre) return "Escribe tu nombre.";
  return "";
}

async function testTeamConnection() {
  const out = _el("team-test-result");
  const f = readTeamForm();
  const problem = f.mode === "member" ? (SHEETS_URL_RE.test(f.url) ? "" : "La URL debe ser la de la aplicación web (termina en /exec).") : validateTeamForm(f);
  if (problem) { out.textContent = `⚠️ ${problem}`; return; }
  out.textContent = "Probando…";
  try {
    const tx = f.mode === "demo" ? DemoTransport : makeSheetsTransport(f.mode === "owner" ? { url: f.url, key: f.key } : { url: f.url, token: "" });
    const info = await tx.ping();
    out.textContent = `✅ ${info.auth ? `Conectado${info.owner ? " como dueño" : ""}` : "El servidor responde"}${info.equipo ? ` · «${info.equipo}»` : ""}`;
  } catch (err) {
    out.textContent = `❌ ${err.code === "UNAUTHORIZED" ? "Clave incorrecta." : `No se pudo conectar: ${err.message}`}`;
  }
}

async function saveTeamConfig() {
  const out = _el("team-test-result");
  const f = readTeamForm();
  const problem = validateTeamForm(f);
  if (problem) { out.textContent = `⚠️ ${problem}`; return; }
  const old = teamConfig();
  let cfg;
  if (f.mode === "demo") cfg = { type: "demo" };
  else if (f.mode === "owner") cfg = { type: "sheets", url: f.url, key: f.key, nombre: f.nombre || "" };
  else {
    let token = old && old.url === f.url ? old.token || "" : "";
    let nombre = f.nombre || (old && old.url === f.url ? old.nombre : "") || "";
    if (f.code) {
      out.textContent = "Uniéndome…";
      try {
        const res = await makeSheetsTransport({ url: f.url, token, nombre }).call("redeem", { code: f.code, nombre });
        token = res.token || token;
      } catch (err) {
        out.textContent = `❌ ${err.code === "BAD_CODE" ? "Código inválido o vencido." : err.code === "TOO_MANY" ? "Demasiados intentos. Espera unos minutos." : err.code === "ALREADY_MEMBER" ? "Ya eres miembro de ese bazar." : `No se pudo unir: ${err.message}`}`;
        return;
      }
    }
    cfg = { type: "sheets", url: f.url, token, nombre };
  }
  const sameIdentity = old && old.type === cfg.type && old.url === cfg.url && Boolean(old.key) === Boolean(cfg.key) && (!old.token || !cfg.token || old.token === cfg.token);
  if (old && !sameIdentity && localStorage.getItem(TEAM_CACHE_KEY)) {
    if (!await appConfirm("Vas a conectar OTRO equipo o cuenta. Se borrará el caché local del modo Equipo (el modo Local no se toca).", "Cambiar de equipo", "Cambiar")) return;
  }
  if (old && !sameIdentity) {
    localStorage.removeItem(TEAM_CACHE_KEY);
    localStorage.removeItem(TEAM_META_KEY);
    localStorage.removeItem(TEAM_ME_KEY);
  }
  localStorage.setItem(TEAM_CONFIG_KEY, JSON.stringify(cfg));
  if (StorageAdapter.mode() !== "team" && !localStorage.getItem(TEAM_CACHE_KEY) && localStorage.getItem(STORAGE_KEY) && cfg.key) {
    if (await appConfirm("¿Quieres empezar con una copia de tus datos locales? (Se subirán al equipo como dueño.)", "Copiar datos locales", "Copiar")) {
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
  window.addEventListener("online", () => { if (TeamAdapter.dirty) TeamAdapter.flush(); else if (TeamAdapter._polling) { TeamAdapter.lastActivity = Date.now(); TeamAdapter.tick(); } });
  document.addEventListener("visibilitychange", () => {      // al volver a la pestaña: se pone al día de inmediato
    if (!document.hidden && TeamAdapter._polling) { TeamAdapter.lastActivity = Date.now(); clearTimeout(TeamAdapter._pollTimer); TeamAdapter.tick(); }
  });
  document.addEventListener("focusout", () => setTimeout(() => TeamAdapter.runDeferred(), 400));   // al dejar de escribir se dibuja lo pendiente
  window.addEventListener("offline", () => { if (TeamAdapter.dirty) Sync.set("offline"); });
  window.addEventListener("beforeunload", (e) => {
    if (StorageAdapter.mode() === "team" && Sync.hasPending()) { e.preventDefault(); e.returnValue = ""; }
  });
  document.addEventListener("DOMContentLoaded", bindSaveIndicator);
  window.addEventListener("load", () => { if (StorageAdapter.mode() === "team") TeamAdapter.start(); });
}

if (typeof module !== "undefined") module.exports = { Sync, LocalAdapter, TeamAdapter, DemoTransport, StorageAdapter, teamBeforeCreateBazaar };
