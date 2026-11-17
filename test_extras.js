// Pruebas de Actividades extra y caja:  node test_extras.js
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");

const ls = {};
const ctx = vm.createContext({
  console, Date, Math, JSON, setTimeout, clearTimeout, Promise, navigator: { onLine: true },
  localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
  window: { addEventListener() {} }, showToast() {}, appConfirm: async () => true,
});
["storage.js", "team_core.js", "state.js", "utils.js", "responsables.js", "evento_ficha.js", "eventos.js", "extras.js", "backup.js"]
  .forEach((f) => vm.runInContext(read(`js/${f}`), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);
const json = (expr) => JSON.parse(run(`JSON.stringify(${expr})`));
const t = (name) => console.log(`  ✓ ${name}`);

run(`
  var bz = { id: "b1", name: "Bazar", expositores: [], floors: [], tareas: [], compras: [], invitados: [], minuteByMinute: [],
    costsConfig: emptyCostsConfig(), evento: emptyEvento(), mesasMigradas: true };
  AppState.bazaars.b1 = bz; AppState.currentBazaarId = "b1"; migrateState(AppState); bz = AppState.bazaars.b1;
  bz.roles = [{ id: "rol-1", nombre: "Logística", color: "#000000" }];
  bz.responsables = [{ id: "resp-1", nombre: "Ana", rolId: "rol-1", tel: "", email: "" }];
  bz.extras.push({ id: "x1", nombre: "Taller de pulseras", genera: true, fondoInicial: 200, precioUnit: 50, estado: "planeada",
    horaInicio: "11:00", horaFin: "12:00", lugar: "Patio", responsableId: "resp-1", descripcion: "Pulseras", tipo: "Taller",
    conteo: { denoms: {}, at: "", nota: "" } });
  bz.extras.push({ id: "x2", nombre: "Baile", genera: false, estado: "planeada", conteo: { denoms: {}, at: "", nota: "" } });
  bz.extras.push({ id: "x3", nombre: "Rifa cancelada", genera: true, estado: "cancelada", fondoInicial: 0, conteo: { denoms: {}, at: "", nota: "" } });
`);

// ── Caja ──
assert.ok(json(`extraAddMov(bz, "x1", { tipo: "ingreso", concepto: "Cobro", monto: 500 })`));
assert.ok(json(`extraAddMov(bz, "x1", { tipo: "ingreso", concepto: "Cobro", monto: "300" })`));
assert.ok(json(`extraAddMov(bz, "x1", { tipo: "egreso", concepto: "Hilo", monto: 150 })`));
let st = json(`extraCajaStats(bz, getExtra(bz, "x1"))`);
assert.deepEqual([st.fondo, st.ingresos, st.egresos, st.esperado, st.neto, st.movs], [200, 800, 150, 850, 650, 3]);
assert.equal(st.hayConteo, false); assert.equal(st.diferencia, null);
t("caja: esperado = fondo + ingresos − egresos; remuneración neta sin contar el fondo");

for (const bad of [0, -5, "abc", NaN, "", null]) assert.equal(json(`extraAddMov(bz, "x1", { tipo: "ingreso", monto: ${JSON.stringify(bad) ?? "NaN"} })`), null, `monto ${bad}`);
assert.equal(json(`extraAddMov(bz, "nope", { tipo: "ingreso", monto: 10 })`), null);
assert.equal(json(`bz.cajaMovs.length`), 3);
t("movimientos inválidos se rechazan");

run(`getExtra(bz, "x1").conteo = { denoms: { 500: 1, 200: 1, 100: 1, 50: 1 }, at: "2026-11-04T20:00:00Z", nota: "" }`);
st = json(`extraCajaStats(bz, getExtra(bz, "x1"))`);
assert.deepEqual([st.contado, st.diferencia], [850, 0]);
run(`getExtra(bz, "x1").conteo.denoms = { 500: 1, 200: 1, 100: 1, 20: 1, 10: 1 }`);   // 830
assert.equal(json(`extraCajaStats(bz, getExtra(bz, "x1")).diferencia`), -20, "faltante");
run(`getExtra(bz, "x1").conteo.denoms = { 1000: 1, 0.5: 3 }`);                          // 1001.5
assert.equal(json(`extraCajaStats(bz, getExtra(bz, "x1")).contado`), 1001.5, "monedas de 50 centavos");
assert.equal(json(`extraCajaStats(bz, getExtra(bz, "x1")).diferencia`), 151.5, "sobrante");
t("conteo de efectivo por denominaciones: cuadra, faltante y sobrante");

const r = json(`getExtrasResumen(bz)`);
assert.deepEqual([r.total, r.generan, r.neto], [3, 2, 650], "la actividad cancelada no suma");
assert.equal(r.cajasAbiertas, 1);
t("resumen del bazar (excluye canceladas)");

// ── Minuto a Minuto ──
let row = json(`extraLinkMinuto(bz, getExtra(bz, "x1"))`);
assert.deepEqual([row.extraId, row.activity, row.time, row.horaFin, row.lugar, row.responsableId, row.area], ["x1", "Taller de pulseras", "11:00", "12:00", "Patio", "resp-1", "Logística"]);
assert.equal(json(`bz.minuteByMinute.length`), 1);
run(`getExtra(bz, "x1").horaInicio = "13:30"; getExtra(bz, "x1").nombre = "Taller XL"; extraLinkMinuto(bz, getExtra(bz, "x1"))`);
row = json(`bz.minuteByMinute[0]`);
assert.deepEqual([json(`bz.minuteByMinute.length`), row.time, row.activity], [1, "13:30", "Taller XL"]);
t("agregar al Minuto a Minuto crea la fila y al repetirlo la actualiza (sin duplicar)");

run(`bz.minuteByMinute.push({ id: "m-otra", time: "09:00", horaFin: "", activity: "Apertura", lugar: "", responsableId: "", areaRolId: "", area: "", notes: "", dia: "", extraId: "" })`);
assert.equal(json(`extraUnlinkMinuto(bz, getExtra(bz, "x1"))`), 1);
assert.deepEqual(json(`bz.minuteByMinute.map(r => r.id)`), ["m-otra"]);
t("quitar del Minuto a Minuto no toca las demás actividades");

run(`extraLinkMinuto(bz, getExtra(bz, "x1"))`);
run(`extraRemove(bz, "x1")`);
assert.deepEqual([json(`bz.extras.map(x => x.id)`), json(`bz.cajaMovs.length`), json(`bz.minuteByMinute.map(r => r.id)`)], [["x2", "x3"], 0, ["m-otra"]]);
t("eliminar una actividad borra sus movimientos y su fila del Minuto a Minuto");

// ── Normalización ──
run(`bz.extras.push({ nombre: 5, estado: "rara", genera: 1, fondoInicial: "abc", conteo: null }); bz.cajaMovs.push({ tipo: "x", monto: -3 });
     bz.minuteByMinute.push({ id: "viejo", time: "10:00", activity: "Sin campo" }); migrateState(AppState); bz = AppState.bazaars.b1;`);
const n = json(`bz.extras[bz.extras.length - 1]`);
assert.deepEqual([n.nombre, n.estado, n.genera, n.fondoInicial, n.tipo, typeof n.id], ["", "planeada", true, 0, "Otro", "string"]);
assert.deepEqual(json(`bz.cajaMovs[0]`).tipo, "ingreso");
assert.equal(json(`bz.cajaMovs[0].monto`), 0);
assert.equal(json(`bz.minuteByMinute.find(r => r.id === "viejo").extraId`), "");
t("datos viejos o incompletos se normalizan al cargar");

// ── Respaldo ──
const norm = json(`backupNormalizar("extras", { extras: [{ id: "e1", nombre: " Rifa ", genera: "sí", precioUnit: "50" }], cajaMovs: [{ extraId: "e1", tipo: "egreso", monto: "12.5" }] })`);
assert.deepEqual([norm.extras[0].nombre, norm.extras[0].genera, norm.extras[0].precioUnit, norm.cajaMovs[0].monto, norm.cajaMovs[0].tipo], ["Rifa", true, 50, 12.5, "egreso"]);
assert.ok(norm.cajaMovs[0].id, "movimiento sin id recibe uno");
assert.equal(run(`backupSectionValid("extras", { extras: [] })`), true);
assert.equal(run(`backupSectionValid("extras", [])`), false);
run(`var dest = { extras: [{ id: "a", nombre: "A" }], cajaMovs: [] }; _bkApplySection(dest, "extras", { extras: [{ id: "b", nombre: "B" }], cajaMovs: [{ id: "m1" }] }, "combinar", false)`);
assert.deepEqual(json(`dest.extras.map(x => x.id)`), ["a", "b"]);
run(`_bkApplySection(dest, "extras", { extras: [{ id: "c", nombre: "C" }], cajaMovs: [] }, "reemplazar", false)`);
assert.deepEqual(json(`dest.extras.map(x => x.id)`), ["c"]);
assert.deepEqual(json(`backupExtraerSecciones(bz).extras.extras.length`), 3);
t("respaldo: exportar, normalizar y combinar/reemplazar");

console.log("\nTODO OK");
