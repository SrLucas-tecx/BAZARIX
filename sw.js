/* BAZARIX — sw.js (Sprint 6): la app abre sin conexión.
   Red primero, caché de respaldo: así una versión nueva siempre se ve de inmediato si hay internet.
   NO toca las peticiones a Google Apps Script (la sincronización va directo, sin caché). */
const VERSION = "bazarix-v6-1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "BAZARIX-svg.svg",
  "Styles.css", "plano.css", "responsive.css", "permisos.css", "admin.css",
  "js/storage.js", "js/team_core.js", "js/state.js", "js/sync_rows.js", "js/utils.js", "js/dialogs.js", "js/bazaars.js",
  "js/responsables.js", "js/eventos.js", "js/expositores.js", "js/categorias.js", "js/finanzas.js", "js/costos.js", "js/mesas.js",
  "js/modales.js", "js/checklist.js", "js/plantillas.js", "js/invitados.js", "js/asistencia.js", "js/alertas.js", "js/metricas.js",
  "js/pdf.js", "js/canvas.js", "js/canvas_helpers.js", "js/charts.js", "js/ui.js", "js/historial.js", "js/evento_dia.js",
  "js/evento_ficha.js", "js/tareas.js", "js/compras.js", "js/extras.js", "js/equipo.js", "js/permisos.js", "js/admin.js",
  "js/privacidad.js", "js/export_excel.js", "js/backup.js", "js/emojis.js", "js/init.js"
];
const CDN_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION)
    .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))   // un archivo ausente no tumba la instalación
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bazarix-") && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === "navigate") { const home = (await caches.match("index.html")) || (await caches.match("./")); if (home) return home; }
    return Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                                   // la sincronización es POST: nunca se cachea
  const url = new URL(req.url);
  if (/(^|\.)script\.google\.com$|(^|\.)googleusercontent\.com$/.test(url.hostname)) return;
  if (url.origin !== self.location.origin && !CDN_HOSTS.includes(url.hostname)) return;
  e.respondWith(networkFirst(req));
});
