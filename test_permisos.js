// Botones según el rol:  node test_permisos.js
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");

const ls = {};
const classes = new Set();
const badge = { hidden: true, textContent: "" };
const ctx = vm.createContext({
  console, Date, Math, JSON, setTimeout, clearTimeout, Promise, navigator: { onLine: true },
  localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
  document: { body: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) } }, getElementById: (id) => (id === "role-badge" ? badge : null) },
  showToast() {}, appConfirm: async () => true,
});
["storage.js", "team_core.js", "state.js", "permisos.js"].forEach((f) => vm.runInContext(read(`js/${f}`), ctx, { filename: f }));
const run = (c) => vm.runInContext(c, ctx);
const t = (n) => console.log(`  ✓ ${n}`);
const denied = () => [...classes].filter((c) => c.startsWith("deny-")).map((c) => c.slice(5)).sort();
const AREAS = vm.runInContext("Object.keys(GATE_AREAS)", ctx);

run(`AppState.bazaars["bazaar-1"] = { id: "bazaar-1", name: "B", expositores: [], floors: [], tareas: [], compras: [], invitados: [], minuteByMinute: [], costsConfig: emptyCostsConfig(), evento: emptyEvento(), mesasMigradas: true }; AppState.currentBazaarId = "bazaar-1";`);
const setMe = (me) => { ctx.__m = me; run("TeamAdapter.me = __m; applyRoleGate()"); };
const me = (rol, extra = {}) => ({ user: { id: "u", nombre: "X", owner: false }, creditos: 0, roles: [],
  memberships: [{ bazarId: "bazaar-1", rol: rol.rol, rolNombre: rol.rolNombre, rank: 0, todo: Boolean(rol.todo), permisos: rol.permisos || [] }], catalogo: { permisos: [], plantillas: [] }, ...extra });

// Modo Local: nada se oculta
run("applyRoleGate()");
assert.deepEqual(denied(), []);
t("modo Local: no se oculta nada");

ls.BAZARIX_STORAGE_MODE = "team";
setMe(me({ rol: "vista", rolNombre: "Vista" }));
assert.equal(denied().length, AREAS.length, "Vista: todo bloqueado");
assert.deepEqual([badge.hidden, badge.textContent], [false, "👁️ Vista (solo lectura)"]);
t("Vista: todo en solo lectura y con su insignia");

setMe(me({ rol: "admin", rolNombre: "Administrador", todo: true }));
assert.deepEqual(denied(), []);
assert.equal(badge.textContent, "🛡️ Admin");
t("Administrador: sin restricciones");

setMe({ user: { id: "owner", nombre: "D", owner: true }, creditos: 0, roles: [], memberships: [], catalogo: { permisos: [], plantillas: [] } });
assert.deepEqual(denied(), []);
assert.equal(badge.textContent, "👑 Dueño");
t("Dueño: sin restricciones");

setMe(me({ rol: "rol-1", rolNombre: "Cajero", permisos: ["payments:set", "caja:edit", "attendance:set"] }));
const d = denied();
for (const ok of ["pay", "caja", "asist", "invtoggle"]) assert.ok(!d.includes(ok), `Cajero puede: ${ok}`);
for (const no of ["exp", "plano", "costos", "extras", "staff", "tareas", "compras", "act", "ficha", "admin", "catalogos", "check", "inv"]) assert.ok(d.includes(no), `Cajero NO puede: ${no}`);
assert.equal(badge.textContent, "🎭 Cajero");
t("Cajero: solo pagos, caja y asistencia");

setMe(me({ rol: "rol-2", rolNombre: "Registro", permisos: ["expositores:edit"] }));
const d2 = denied();
assert.ok(!d2.includes("exp") && !d2.includes("pay") && !d2.includes("check"), "editar expositores incluye marcar pago y pendientes (igual que el servidor)");
assert.ok(d2.includes("plano") && d2.includes("costos"));
t("quien edita expositores también puede marcar pagos y pendientes (como valida el servidor)");

setMe(me({ rol: "rol-3", rolNombre: "Plano", permisos: ["plano:edit"] }));
assert.ok(!denied().includes("asist"), "editar el plano permite marcar asistencia");
t("quien edita el plano también marca asistencia");

setMe(null); run("applyRoleGate()");
assert.deepEqual(denied(), [], "sin datos de rol no se bloquea nada (el servidor decide)");
t("sin datos de rol aún, no se bloquea nada");
console.log("\nTODO OK");
