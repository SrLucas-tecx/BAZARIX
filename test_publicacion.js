// Publicación (sprint 6): PWA, aviso de privacidad, respaldo de la hoja, archivos de hosting:  node test_publicacion.js
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");
const t = (n) => console.log(`  ✓ ${n}`);
const EXTERNO_OK = new Set(["BAZARIX-svg.svg"]);   // el icono no viaja en los paquetes de cambios

// ── 1. index.html: todo lo que referencia existe y no falta ningún js ──
const html = read("index.html");
const locales = [...html.matchAll(/(?:src|href)="((?:js\/)?[\w.\-]+\.(?:js|css|webmanifest|svg))"/g)].map((m) => m[1]);
locales.filter((f) => !EXTERNO_OK.has(f)).forEach((f) => assert.ok(fs.existsSync(f), `index.html referencia ${f} pero no existe`));
const jsEnDisco = fs.readdirSync("js").filter((f) => f.endsWith(".js")).map((f) => `js/${f}`);
jsEnDisco.forEach((f) => assert.ok(locales.includes(f), `${f} existe pero index.html no lo carga`));
assert.ok(html.includes('rel="manifest"') && html.includes("serviceWorker.register") && html.includes('id="modal-privacidad"') && html.includes("openPrivacidad()"));
t("index.html carga todos los js/css, el manifest, el service worker y el aviso de privacidad");

// ── 2. manifest ──
const man = JSON.parse(read("manifest.webmanifest"));
assert.ok(man.name && man.short_name && man.start_url && man.display === "standalone" && man.icons.length >= 1 && /^#[0-9a-f]{6}$/i.test(man.theme_color));
t("manifest válido (instalable)");

// ── 3. service worker ──
const swSrc = read("sw.js");
const store = {}, handlers = {}, origin = "https://grupo.github.io";
const key = (x) => new URL(typeof x === "string" ? x : x.url, origin + "/").href;
class Resp { constructor(body, o = {}) { this.body = body; this.ok = o.ok !== false; this.type = o.type || "basic"; } clone() { return new Resp(this.body, this); } static error() { const r = new Resp("", { ok: false }); r.type = "error"; return r; } }
const cachesFake = {
  open: async () => ({ put: async (r, v) => { store[key(r)] = v; }, add: async (u) => { if (u === "BAZARIX-svg.svg") throw new Error("404"); store[key(u)] = new Resp("shell:" + u); } }),
  match: async (r) => store[key(r)],
  keys: async () => ["bazarix-v0", "otra-app", "bazarix-v6-4"],
  delete: async (k) => { deleted.push(k); },
};
const deleted = []; let online = true; const netCalls = [];
const sw = vm.createContext({ URL, Response: Resp, caches: cachesFake, Promise, console,
  self: { addEventListener: (n, fn) => { handlers[n] = fn; }, location: { origin }, skipWaiting() {}, clients: { claim() {} } },
  fetch: async (req) => { netCalls.push(req.url); if (!online) throw new Error("offline"); return new Resp("net:" + req.url); } });
vm.runInContext(swSrc, sw);
const shell = vm.runInContext("SHELL", sw);
shell.filter((u) => !EXTERNO_OK.has(u) && u !== "./").forEach((u) => assert.ok(fs.existsSync(u), `SHELL lista ${u} pero no existe`));
locales.filter((f) => !EXTERNO_OK.has(f)).forEach((f) => assert.ok(shell.includes(f), `${f} no está en el caché sin conexión`));
const ev = async (type, arg) => { let p; handlers[type](Object.assign(arg || {}, { waitUntil: (x) => { p = x; }, respondWith: (x) => { p = x; } })); return p; };
(async () => {
  await ev("install");
  assert.ok(store[key("js/init.js")] && store[key("index.html")], "precachea la app");
  assert.ok(!store[key("BAZARIX-svg.svg")], "un archivo ausente no tumba la instalación");
  await ev("activate");
  assert.deepEqual([...deleted], ["bazarix-v0"], "borra solo cachés viejos de BAZARIX");
  t("SW: instala aunque falte un archivo y limpia solo sus cachés viejos");

  const get = (url, extra = {}) => ({ request: { method: "GET", url, mode: "no-cors", ...extra } });
  const post = { request: { method: "POST", url: "https://script.google.com/macros/s/x/exec" } };
  let r = handlers.fetch(Object.assign({}, post, { respondWith() { throw new Error("no debe interceptar POST"); } }));
  handlers.fetch(Object.assign(get("https://script.google.com/macros/s/x/exec"), { respondWith() { throw new Error("no debe interceptar Apps Script"); } }));
  handlers.fetch(Object.assign(get("https://script.googleusercontent.com/macros/echo?x=1"), { respondWith() { throw new Error("tampoco la redirección"); } }));
  handlers.fetch(Object.assign(get("https://ejemplo.com/x.js"), { respondWith() { throw new Error("ni terceros desconocidos"); } }));
  t("SW: nunca toca la sincronización (POST ni Apps Script) ni dominios ajenos");

  online = true;
  assert.equal((await ev("fetch", get(origin + "/js/ui.js"))).body, "net:" + origin + "/js/ui.js", "con red, siempre lo más nuevo");
  online = false;
  assert.equal((await ev("fetch", get(origin + "/js/ui.js"))).body, "net:" + origin + "/js/ui.js", "sin red, sirve la copia guardada");
  assert.equal((await ev("fetch", get(origin + "/otra-ruta", { mode: "navigate" }))).body, "shell:index.html", "navegar sin red abre la app");
  assert.equal((await ev("fetch", get(origin + "/nunca-visto.png"))).ok, false);
  assert.ok((await ev("fetch", get("https://cdn.jsdelivr.net/npm/chart.js"))).ok === false, "CDN no visto y sin red: error limpio");
  t("SW: red primero, caché sin conexión y la app abre al navegar sin internet");

  // ── 4. Respaldo de la hoja (Sheet.gs con Drive/Triggers simulados) ──
  const trashed = [], created = [], triggers = []; let nTrig = 0;
  const days = (n) => Date.UTC(2026, 10, 30) - n * 86400000;
  const folderFiles = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ id: "f" + i, name: "Hoja — respaldo " + i, created: days(i) }))
    .concat([{ id: "ajeno", name: "Otro archivo", created: days(50) }]);
  const fileObj = (f) => ({ getId: () => f.id, getName: () => f.name, getDateCreated: () => new Date(f.created), setTrashed: (v) => { if (v) trashed.push(f.id); } });
  const folder = { getFiles: () => { const l = folderFiles.map(fileObj); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; } };
  const g = vm.createContext({ console, Date, Math, JSON,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getName: () => "Hoja", getId: () => "SSID" }), getUi: () => ({ alert() {}, ButtonSet: { OK: 1 } }) },
    Session: { getScriptTimeZone: () => "America/Mexico_City" }, Utilities: { formatDate: () => "2026-11-30_0300" },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: (n) => { created.push(n); return folder; },
      getFileById: (id) => id === "SSID" ? { makeCopy: (name, f) => { assert.equal(f, folder); const o = { id: "nuevo", name, created: days(-1) }; folderFiles.push(o); return fileObj(o); } } : fileObj(folderFiles.find((f) => f.id === id)) },
    ScriptApp: { WeekDay: { MONDAY: "MON" }, getProjectTriggers: () => triggers.slice(), deleteTrigger: (x) => { triggers.splice(triggers.indexOf(x), 1); },
      newTrigger: (fn) => { const tr = { fn, getHandlerFunction: () => fn }; const b = { timeBased: () => b, onWeekDay: () => b, atHour: () => b, create: () => { triggers.push(tr); return tr; } }; return b; } } });
  vm.runInContext(read("server/Core.gs") + "\n" + read("server/Sheet.gs"), g);
  const prune = JSON.parse(vm.runInContext(`JSON.stringify(bzxRespaldosAPodar_(${JSON.stringify(folderFiles.slice(0, 10))}, "Hoja — respaldo ", 8))`, g));
  assert.deepEqual(prune, ["f8", "f9"], "poda los más viejos que pasen de 8");
  const r2 = JSON.parse(vm.runInContext("JSON.stringify(bzxHacerRespaldo_())", g));
  assert.equal(r2.nombre, "Hoja — respaldo 2026-11-30_0300");
  assert.deepEqual(created, ["BAZARIX respaldos"], "crea la carpeta si no existe");
  assert.deepEqual([...trashed].sort(), ["f7", "f8", "f9"], "con la copia nueva son 11 respaldos: se van a la papelera los 3 más viejos");
  assert.ok(!trashed.includes("ajeno"), "nunca toca archivos que no son respaldos de esta hoja");
  assert.ok(!trashed.includes("nuevo"), "la copia recién hecha se conserva");
  assert.equal(r2.podadas, trashed.length);
  assert.equal(folderFiles.filter((f) => f.name.startsWith("Hoja — respaldo ") && !trashed.includes(f.id)).length, 8, "quedan 8 respaldos");
  vm.runInContext("activarRespaldoSemanal(); activarRespaldoSemanal();", g);
  assert.equal(triggers.length, 1, "activarlo dos veces no duplica el activador");
  assert.equal(triggers[0].fn, "respaldoAutomatico");
  vm.runInContext("desactivarRespaldoSemanal()", g);
  assert.equal(triggers.length, 0);
  t("respaldo: copia a la carpeta, poda solo respaldos viejos de esta hoja y el activador semanal no se duplica");

  // ── 5. Aviso de privacidad ──
  const ls = {}; const opened = [];
  const pv = vm.createContext({ console, localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); } },
    StorageAdapter: { mode: () => ls.BAZARIX_STORAGE_MODE || "local" }, openModal: (id) => opened.push("open:" + id), closeModal: (id) => opened.push("close:" + id) });
  vm.runInContext(read("js/privacidad.js"), pv);
  vm.runInContext("maybeShowPrivacidad()", pv);
  assert.deepEqual(opened, [], "modo Local: no molesta");
  ls.BAZARIX_STORAGE_MODE = "team";
  vm.runInContext("maybeShowPrivacidad()", pv);
  assert.deepEqual(opened, ["open:modal-privacidad"]);
  vm.runInContext("acceptPrivacidad()", pv);
  vm.runInContext("maybeShowPrivacidad()", pv);
  assert.equal(opened.filter((x) => x === "open:modal-privacidad").length, 1, "tras aceptar no vuelve a aparecer");
  vm.runInContext("openPrivacidad()", pv);
  assert.equal(opened.filter((x) => x === "open:modal-privacidad").length, 2, "pero se puede reabrir desde el pie de página");
  t("privacidad: solo en modo Equipo, una vez por dispositivo, reabrible");

  // ── 6. Hosting ──
  const h = read("_headers");
  assert.ok(h.includes("Content-Security-Policy-Report-Only") && !/\nContent-Security-Policy:/.test(h), "la CSP va en modo Report-Only (no puede romper la app)");
  assert.ok(h.includes("script.google.com") && h.includes("script.googleusercontent.com") && h.includes("cdn.jsdelivr.net") && h.includes("cdnjs.cloudflare.com"));
  assert.ok(/\/sw\.js\s+Cache-Control: no-cache/.test(h));
  t("_headers: cabeceras de seguridad, CSP en modo reporte y sw.js sin caché");

  console.log("\nTODO OK");
})().catch((e) => { console.error("\nFALLA:", e); process.exit(1); });
