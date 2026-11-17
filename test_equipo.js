// Humo de la ventana Miembros y roles y del modo Demo:  node test_equipo.js
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");

const ls = {};
const els = {};
const el = (id) => (els[id] = els[id] || { id, innerHTML: "", value: "", checked: false, hidden: false, classList: { add() {}, remove() {} } });
const toasts = [];
const ctx = vm.createContext({
  console, Date, Math, JSON, setTimeout, clearTimeout, Promise, navigator: { onLine: true },
  localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
  document: { getElementById: el, querySelectorAll: () => [] }, showToast: (m) => toasts.push(m), appConfirm: async () => true, openModal() {}, closeModal() {},
});
ls.BAZARIX_STORAGE_MODE = "team";
["storage.js", "team_core.js", "state.js", "utils.js", "sync_rows.js", "equipo.js"].forEach((f) => vm.runInContext(read(`js/${f}`), ctx, { filename: f }));
const run = (c) => vm.runInContext(c, ctx);
const t = (n) => console.log(`  ✓ ${n}`);
const setMe = (m) => { ctx.__m = m; run("TeamAdapter.me = __m"); };

(async () => {
  // ── Modo Demo con el servidor nuevo ──
  run("DemoTransport.latency = () => 0");
  const info = await run("DemoTransport.ping()");
  assert.deepEqual([info.ok, info.auth, info.owner], [true, true, true]);
  const me = (await run("DemoTransport.call('me')")).me;
  assert.equal(me.user.owner, true);
  const code = (await run("DemoTransport.call('ownerCode', { usos: 2 })")).code;
  assert.match(code, /^BZX-/);
  const pushed = await run(`DemoTransport.push([{ key: "bazares:bazaar-1", coleccion: "bazares", bazarId: "bazaar-1", baseVersion: 0, json: '{"id":"bazaar-1","name":"Demo"}' }])`);
  assert.equal(pushed.applied.length, 1);
  const pulled = await run("DemoTransport.pull(0, [])");
  assert.equal(pulled.rows.length, 1);
  assert.ok(JSON.parse(ls.BAZARIX_DEMO_DB).tables.Codigos.length === 1, "la demo conserva sus tablas de acceso");
  t("modo Demo: dueño, códigos, push y pull con el servidor nuevo");

  // ── Ventana de miembros ──
  run(`AppState.bazaars["bazaar-1"] = { id: "bazaar-1", name: "Bazar <Uno>", expositores: [], floors: [], tareas: [], compras: [], invitados: [], minuteByMinute: [], costsConfig: emptyCostsConfig(), evento: emptyEvento(), mesasMigradas: true }; AppState.currentBazaarId = "bazaar-1";`);
  const cat = { permisos: JSON.parse(JSON.stringify(vm.runInContext("BZX_PERMS_", ctx))), plantillas: JSON.parse(JSON.stringify(vm.runInContext("BZX_PRESETS_", ctx))) };
  const base = (extra) => ({ user: { id: "u1", nombre: "Ana <b>", owner: false }, creditos: 0, roles: [{ id: "rol-1", bazarId: "bazaar-1", nombre: "Cajero", color: "#f59e0b", rank: 20, permisos: ["caja:edit"] }], catalogo: cat, ...extra });

  run(`_eq.bazarId = "bazaar-1"; _eq.members = [{ userId: "u2", nombre: "Beto", rol: "rol-1", rolNombre: "Cajero", rank: 20, desde: "2026-11-01T00:00:00Z", visto: new Date().toISOString(), activo: true },
    { userId: "u3", nombre: "Cata <script>", rol: "vista", rolNombre: "Vista", rank: 0, desde: "2026-11-02T00:00:00Z", visto: "", activo: false }];
    _eq.codes = [{ id: "h1", tipo: "unirse", bazarId: "bazaar-1", rol: "vista", usos: 3, expira: "2026-12-01T00:00:00Z", nota: "Equipo", estado: "activo" }]; _eq.ownerCodes = [];`);
  setMe(base({ memberships: [{ bazarId: "bazaar-1", rol: "admin", rolNombre: "Administrador", rank: 100, todo: true, permisos: [] }] }));
  run("renderEquipo()");
  let html = els["equipo-body"].innerHTML;
  for (const s of ["Miembros", "Beto", "🟢", "activo ahora", "Invitar con un código", "Códigos activos", "Roles personalizados", "Cajero", "＋ Nuevo rol"]) assert.ok(html.includes(s), `admin debe ver: ${s}`);
  assert.ok(!html.includes("Códigos para crear bazares"), "un admin no es el dueño");
  assert.ok(!html.includes("<script>") && html.includes("&lt;script&gt;"), "los nombres se escapan (sin inyección de HTML)");
  assert.ok(html.includes("Ana &lt;b&gt;") && html.includes("Bazar &lt;Uno&gt;"));
  t("admin: ve miembros, invitaciones, códigos y roles; todo escapado");

  setMe(base({ memberships: [{ bazarId: "bazaar-1", rol: "vista", rolNombre: "Vista", rank: 0, todo: false, permisos: [] }] }));
  run("renderEquipo()");
  html = els["equipo-body"].innerHTML;
  assert.ok(html.includes("Solo los administradores") && !html.includes("Invitar con un código") && !html.includes("Roles personalizados"));
  t("Vista: solo ve su rol y un aviso, nada de administración");

  setMe(base({ user: { id: "owner", nombre: "Dueño", owner: true }, memberships: [] }));
  run(`_eq.ownerCodes = [{ id: "c1", tipo: "crear", usos: 2, expira: "2026-12-01T00:00:00Z", nota: "Mesa directiva", estado: "activo" }]`);
  run("renderEquipo()");
  html = els["equipo-body"].innerHTML;
  assert.ok(html.includes("Códigos para crear bazares") && html.includes("Mesa directiva") && html.includes("Invitar con un código"));
  t("dueño: administra todo y además genera códigos para crear bazares");

  run(`equipoEditRole("")`);
  els["eq-role-form"] = { innerHTML: "" };
  run(`equipoPreset(0)`);
  assert.ok(els["eq-role-form"].innerHTML.includes("Guardar rol") && els["eq-role-form"].innerHTML.includes("Marcar pagos"));
  assert.ok(els["eq-role-form"].innerHTML.includes("checked"), "la plantilla marca sus permisos");
  t("el formulario de roles muestra los permisos agrupados y precarga plantillas");
  console.log("\nTODO OK");
})().catch((e) => { console.error("\nFALLA:", e); process.exit(1); });
