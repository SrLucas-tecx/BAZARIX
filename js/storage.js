/**
 * BAZARIX — storage.js (Sprint 1)
 * Capa de almacenamiento. state.js ya no toca localStorage: le pide todo a StorageAdapter.
 *
 *  - Modo "local":  un solo usuario, todo en este navegador (igual que antes, misma clave).
 *  - Modo "team":   para equipos. Offline-first: guarda siempre en un caché local y sube los cambios
 *                   a un TRANSPORTE (hoy un demo simulado; en el sprint 2, Google Apps Script).
 *
 * Los dos modos usan claves distintas: no se mezclan datos.
 * Estados de sincronización (Sync): saved · pending · saving · offline · error
 * Cargar ANTES de state.js.
 */

const STORAGE_KEY = "EXPOSITORES_APP_STATE";
const STORAGE_MODE_KEY = "BAZARIX_STORAGE_MODE";
const TEAM_CACHE_KEY = "EXPOSITORES_APP_STATE__team";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==========================================
// ESTADO DE SINCRONIZACIÓN (lo escucha el indicador del menú)
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
// TRANSPORTES (a dónde se sube en modo Equipo)
// Contrato: push(jsonString) -> Promise (rechaza si falla)
// El sprint 2 agrega SheetsTransport con la URL del Apps Script.
// ==========================================
const DemoTransport = {
  name: "demo",
  latency: () => 600 + Math.random() * 600,
  async push(json) {
    await sleep(this.latency());
    if (localStorage.getItem("BAZARIX_DEMO_FAIL") === "1") throw new Error("Fallo simulado");
    localStorage.setItem("BAZARIX_DEMO_REMOTE", json);   // "la nube" del demo
  },
};

// ==========================================
// MODO EQUIPO (offline-first)
// ==========================================
const TeamAdapter = {
  name: "team",
  transport: DemoTransport,
  debounceMs: 1500,       // junta varios cambios seguidos en un solo envío
  minSavingMs: 900,       // "Guardando…" se ve al menos este tiempo (para que se note que pasó algo)
  dirty: false,
  inflight: false,
  retries: 0,
  latest: null,
  _timer: null,

  load() { return localStorage.getItem(TEAM_CACHE_KEY); },

  save(state) {
    try {
      localStorage.setItem(TEAM_CACHE_KEY, JSON.stringify(state));   // primero local: nunca se pierde nada
    } catch (err) {
      console.error("Caché local llena:", err);
      Sync.set("error");
      return false;
    }
    this.latest = state;
    this.dirty = true;
    Sync.set(navigator.onLine === false ? "offline" : "pending");
    this.schedule(this.debounceMs);
    return true;
  },

  schedule(ms) {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), ms);
  },

  /** Envía lo pendiente. Si llegan cambios mientras envía, repite hasta quedar al día. */
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
          await this.transport.push(JSON.stringify(this.latest));
          this.retries = 0;
          const left = this.minSavingMs - (Date.now() - t0);
          if (left > 0) await sleep(left);
        } catch (err) {
          console.warn("No se pudo subir:", err.message);
          this.dirty = true;
          this.retries++;
          Sync.set("error");
          this.schedule(Math.min(30000, 2000 * 2 ** (this.retries - 1)));   // 2 s, 4 s, 8 s… máx 30 s
          return;
        }
      }
      Sync.set("saved");
    } finally {
      this.inflight = false;
    }
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
  const label = mode === "team" ? "Equipo (demo)" : "Local";
  if (!await appConfirm(`Vas a cambiar al modo ${label}. Cada modo guarda sus datos por separado; no se pierde nada del otro.`, "Cambiar modo", "Cambiar")) return;
  if (mode === "team" && !localStorage.getItem(TEAM_CACHE_KEY) && localStorage.getItem(STORAGE_KEY)) {
    if (await appConfirm("¿Quieres empezar el modo Equipo con una copia de tus datos locales actuales?", "Copiar datos locales", "Copiar")) {
      localStorage.setItem(TEAM_CACHE_KEY, localStorage.getItem(STORAGE_KEY));
    }
  }
  localStorage.setItem(STORAGE_MODE_KEY, mode);
  location.reload();
}

// ==========================================
// INDICADOR DE GUARDADO (#save-indicator, en el menú)
// ==========================================
const SYNC_LABELS = {
  saved:   "Guardado",
  pending: "Cambios por guardar…",
  saving:  "Guardando cambios…",
  offline: "Sin conexión · se guardará al volver",
  error:   "No se pudo guardar · reintentando",
};

function bindSaveIndicator() {
  const el = document.getElementById("save-indicator");
  if (!el) return;
  let hideTimer = null;
  Sync.on((s) => {
    el.dataset.status = s.status;
    el.innerHTML = `<span class="sync-dot" aria-hidden="true"></span><span>${SYNC_LABELS[s.status]}</span>`;
    clearTimeout(hideTimer);
    if (s.lastSavedAt === null && s.status === "saved") { el.classList.remove("show"); return; }   // arranque: sin avisos
    el.classList.add("show");
    if (s.status === "saved") hideTimer = setTimeout(() => el.classList.remove("show"), 2500);
  });
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("online", () => { if (TeamAdapter.dirty) TeamAdapter.flush(); });
  window.addEventListener("offline", () => { if (TeamAdapter.dirty) Sync.set("offline"); });
  window.addEventListener("beforeunload", (e) => {
    if (StorageAdapter.mode() === "team" && Sync.hasPending()) { e.preventDefault(); e.returnValue = ""; }
  });
  document.addEventListener("DOMContentLoaded", bindSaveIndicator);
}

if (typeof module !== "undefined") module.exports = { Sync, LocalAdapter, TeamAdapter, DemoTransport, StorageAdapter, STORAGE_KEY, TEAM_CACHE_KEY };
