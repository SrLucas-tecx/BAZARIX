// Pantalla Administración (DOM simulado):  node test_admin.js
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");

const ls = {}, els = {}, classes = new Set(), toasts = [];
const el = (id) => (els[id] = els[id] || { id, innerHTML: "", value: "", hidden: false, style: {}, textContent: "", classList: { add() {}, remove() {} } });
const ctx = vm.createContext({
  console, Date, Math, JSON, setTimeout, clearTimeout, Promise, navigator: { onLine: true },
  localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
  document: { getElementById: el, querySelectorAll: () => [], body: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) } } },
  showToast: (m) => toasts.push(m), appConfirm: async () => true, openModal() {}, closeModal() {},
});
ls.BAZARIX_STORAGE_MODE = "team";
["storage.js", "team_core.js", "state.js", "utils.js", "sync_rows.js", "permisos.js", "admin.js"].forEach((f) => vm.runInContext(read(`js/${f}`), ctx, { filename: f }));
const run = (c) => vm.runInContext(c, ctx);
const t = (n) => console.log(`  ✓ ${n}`);
const setMe = (m) => { ctx.__m = m; run("TeamAdapter.me = __m"); };
const perms = JSON.parse(JSON.stringify({ permisos: vm.runInContext("BZX_PERMS_", ctx), plantillas: vm.runInContext("BZX_PRESETS_", ctx) }));
const me = (user, memberships) => ({ user, creditos: 0, memberships, roles: [{ id: "rol-1", bazarId: "bazaar-1", nombre: "Cajero", color: "#f59e0b", rank: 20, permisos: ["caja:edit"] }], catalogo: perms });
const ADMIN = me({ id: "u1", nombre: "Ana <b>", owner: false }, [{ bazarId: "bazaar-1", rol: "admin", rolNombre: "Administrador", rank: 100, todo: true, permisos: [] }]);

run(`AppState.bazaars["bazaar-1"] = { id: "bazaar-1", name: "Bazar <Uno>", expositores: [], floors: [], tareas: [], compras: [], invitados: [], minuteByMinute: [], costsConfig: emptyCostsConfig(), evento: emptyEvento(), mesasMigradas: true }; AppState.currentBazaarId = "bazaar-1";`);
const now = Date.now(), iso = (ms) => new Date(now - ms).toISOString();
run(`_ad.bazarId = "bazaar-1"; _ad.tab = "miembros"; _ad.loaded = true; _ad.members = [
  { userId: "u2", nombre: "Beto", rol: "rol-1", rolNombre: "Cajero", rank: 20, desde: "${iso(86400000)}", visto: "${iso(1000)}", activo: true, cuenta: "activo", sinVolver: false },
  { userId: "u3", nombre: "Cata <script>", rol: "vista", rolNombre: "Vista", rank: 0, desde: "${iso(86400000)}", visto: "${iso(86400000)}", activo: false, cuenta: "activo", sinVolver: true },
  { userId: "u4", nombre: "Dani", rol: "vista", rolNombre: "Vista", rank: 0, desde: "${iso(86400000)}", visto: "${iso(7200000)}", activo: false, cuenta: "activo", sinVolver: false },
  { userId: "u5", nombre: "Éric", rol: "admin", rolNombre: "Administrador", rank: 100, desde: "${iso(86400000)}", visto: "${iso(5000)}", activo: true, cuenta: "suspendido", sinVolver: false }];
  _ad.codes = [{ id: "h1", tipo: "unirse", bazarId: "bazaar-1", rol: "vista", usos: 3, expira: "${iso(-86400000)}", nota: "Equipo", estado: "activo", creadoPorNombre: "Ana" }];
  _ad.activity = [{ key: "tareas:bazaar-1:t1", coleccion: "tareas", version: 2, updatedAt: "${iso(60000)}", updatedBy: "Beto", deleted: false, etiqueta: "Colada <x>" }];`);

setMe(ADMIN);
run("updateAdminNav()");
assert.equal(els["nav-admin"].hidden, false, "admin ve el botón de Administración");
setMe(me({ id: "u9", nombre: "V", owner: false }, [{ bazarId: "bazaar-1", rol: "vista", rolNombre: "Vista", rank: 0, todo: false, permisos: [] }]));
run("updateAdminNav()");
assert.equal(els["nav-admin"].hidden, true, "un Vista no ve el botón");
run("drawAdmin()");
assert.ok(els["admin-body"].innerHTML.includes("Solo los administradores"));
setMe(ADMIN);
t("el botón y la pantalla solo existen para admins");

run("drawAdmin()");
let html = els["admin-body"].innerHTML;
for (const s of ["👥 Miembros", "🕘 Actividad", "🔑 Códigos", "Activos ahora", "Solo canjearon el código", "Cuentas suspendidas", "🟢 Activo ahora", "🕓 Solo canjeó el código", "⚪ Visto hace 2 h", "⛔ Cuenta suspendida", "Exportar CSV"]) assert.ok(html.includes(s), `falta: ${s}`);
assert.ok(!html.includes("Todos los bazares"), "un admin no ve la pestaña del dueño");
assert.ok(!html.includes("<script>") && html.includes("Cata &lt;script&gt;") && html.includes("Ana &lt;b&gt;") && html.includes("Bazar &lt;Uno&gt;"), "todo escapado");
t("miembros: conteos, estados (activo, visto hace…, solo canjeó, suspendido) y escape de HTML");

const conteo = JSON.parse(run("JSON.stringify(_adConteos(_ad.members))"));
assert.deepEqual([conteo.total, conteo.activos, conteo.sinVolver, conteo.suspendidos], [4, 1, 1, 1], "el suspendido no cuenta como activo");
assert.deepEqual(JSON.parse(run("JSON.stringify(_adMiembrosFiltrados().map(m => m.nombre))")), ["Beto", "Dani", "Cata <script>", "Éric"], "orden: activos, inactivos, sin volver, suspendidos");
t("conteos y orden");

const nombres = () => JSON.parse(run("JSON.stringify(_adMiembrosFiltrados().map(m => m.nombre))"));
run(`_ad.estado = "sinvolver"`); assert.deepEqual(nombres(), ["Cata <script>"]);
run(`_ad.estado = "all"; _ad.rol = "vista"`); assert.deepEqual(nombres(), ["Dani", "Cata <script>"]);
run(`_ad.rol = "all"; _ad.q = "ERIC"`); assert.deepEqual(nombres(), ["Éric"], "búsqueda sin acentos ni mayúsculas");
run(`_ad.q = ""`);
els["ad-q"] = { value: "dan" }; els["ad-rol"] = { value: "all" }; els["ad-estado"] = { value: "all" };
run("adFilterChanged()");
assert.ok(els["ad-miembros-tabla"].innerHTML.includes("Dani") && !els["ad-miembros-tabla"].innerHTML.includes("Beto") && els["ad-miembros-tabla"].innerHTML.includes("Mostrando 1 de 4"));
t("filtros por estado, rol y búsqueda (solo se redibuja la tabla)");

const csv = run("adCSV()");
assert.ok(csv.startsWith("\ufeff\"Nombre\";\"Rol\"") && csv.split("\n").length === 2, "el CSV respeta el filtro actual");
run(`_ad.q = ""`);
assert.equal(run("adCSV()").split("\n").length, 5);
assert.ok(run("adCSV()").includes("Solo canjeó el código"));
t("CSV de miembros");

run(`_ad.tab = "actividad"; drawAdmin()`);
html = els["admin-body"].innerHTML;
assert.ok(html.includes("editó · Tarea") && html.includes("Colada &lt;x&gt;") && html.includes("<strong>Beto</strong>"));
run(`_ad.tab = "codigos"; drawAdmin()`);
html = els["admin-body"].innerHTML;
assert.ok(html.includes("Invitar con un código") && html.includes("Usos restantes") && html.includes("Revocar") && html.includes("Ana"));
t("pestañas Actividad y Códigos");

// Dueño: resumen de bazares y cuentas
setMe(me({ id: "owner", nombre: "Dueño", owner: true }, []));
run(`_ad.tab = "dueno"; _ad.overview = { bazares: [{ bazarId: "bazaar-1", nombre: "Bazar <Uno>", filas: 12, ultimo: "${iso(60000)}", ultimoPor: "Beto", miembros: 3, admins: ["Ana"] }, { bazarId: "bazaar-9", nombre: "Otro", filas: 0, ultimo: "", ultimoPor: "", miembros: 1, admins: [] }],
  cuentas: [{ id: "u1", nombre: "Ana", estado: "activo", visto: "${iso(1000)}", creditos: 0, activo: true, sinVolver: false, bazares: 1 }, { id: "u3", nombre: "Cata", estado: "suspendido", visto: "", creditos: 1, activo: false, sinVolver: true, bazares: 1 }] };
  _ad.ownerCodes = [{ id: "c1", tipo: "crear", usos: 2, expira: "${iso(-86400000)}", nota: "Mesa directiva", estado: "activo", creadoPorNombre: "Dueño" }]; drawAdmin()`);
html = els["admin-body"].innerHTML;
for (const s of ["Todos los bazares", "Administrar", "Reactivar", "Suspender", "Mesa directiva", "Códigos para crear bazares", "Activas ahora"]) assert.ok(html.includes(s), `dueño debe ver: ${s}`);
assert.equal(html.split("adOpenBazar").length - 1, 1, "solo ofrece administrar los bazares que tiene en este dispositivo");
t("dueño: ve todos los bazares, cuentas, y puede suspender/reactivar");

// Acciones: llaman al servidor correcto
const calls = [];
ctx.__calls = calls;
run(`TeamAdapter.transport = { call: async (op, e) => { __calls.push([op, e]); if (op === "me") return { me: TeamAdapter.me }; return { members: [], codes: [], items: [], bazares: [], cuentas: [], ok: true }; } }; TeamAdapter.loadMe = async () => TeamAdapter.me;`);
(async () => {
  await run(`adSetUserStatus("u3")`);
  assert.equal(JSON.stringify(calls.find((c) => c[0] === "setUserStatus")[1]), JSON.stringify({ userId: "u3", estado: "activo" }), "u3 estaba suspendida: la reactiva");
  setMe(me({ id: "owner", nombre: "Dueño", owner: true }, []));
  run(`_ad.overview = { bazares: [], cuentas: [{ id: "u1", nombre: "Ana", estado: "activo", visto: "", creditos: 0, activo: true, sinVolver: false, bazares: 1 }] }`);
  await run(`adSetUserStatus("u1")`);
  assert.equal(calls.filter((c) => c[0] === "setUserStatus")[1][1].estado, "suspendido");
  setMe(ADMIN);
  await run(`adSetRol("u2", "admin")`);
  assert.equal(JSON.stringify(calls.find((c) => c[0] === "setRole")[1]), JSON.stringify({ bazarId: "bazaar-1", userId: "u2", rol: "admin" }));
  assert.ok(calls.some((c) => c[0] === "activity" && c[1].bazarId === "bazaar-1"), "tras actuar se vuelve a cargar todo");
  t("las acciones llaman al servidor y recargan");
  console.log("\nTODO OK");
})().catch((e) => { console.error("\nFALLA:", e); process.exit(1); });
