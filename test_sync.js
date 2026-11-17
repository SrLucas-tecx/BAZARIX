// Pruebas del sprint 2 (sin navegador ni Google):  node test_sync.js
// Dos "dispositivos" (A y B) con su propio localStorage sincronizan contra el MISMO servidor (Core.gs),
// primero con almacén en memoria y luego con una hoja de Google simulada (Sheet.gs).
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");

assert.equal(read("server/Core.gs"), read("js/team_core.js"), "js/team_core.js debe ser copia exacta de server/Core.gs");

// ── Hoja de Google simulada ──
function fakeGoogle() {
  const sheets = {};
  const props = { API_KEY: "k" };
  const mk = (name, headers) => {
    const grid = [headers.slice()];
    sheets[name] = {
      grid, getLastRow: () => grid.length, deleteRow: (n) => { grid.splice(n - 1, 1); }, setFrozenRows() {},
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (grid[r - 1 + i] ? grid[r - 1 + i][c - 1 + j] ?? "" : ""))),
        setValues: (v) => v.forEach((row, i) => { grid[r - 1 + i] = grid[r - 1 + i] || []; row.forEach((x, j) => { grid[r - 1 + i][c - 1 + j] = x; }); }),
        setNumberFormat() { return this; }, setFontWeight() { return this; },
      }),
    };
  };
  mk("Datos", ["key", "coleccion", "bazarId", "version", "rev", "updatedAt", "updatedBy", "deleted", "d1", "d2", "d3", "d4", "rank"]);
  let locks = 0;
  return {
    mk, sheets, props, grid: sheets.Datos.grid, locks: () => locks,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null }) },
    LockService: { getScriptLock: () => ({ waitLock() { locks++; }, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    Utilities: { getUuid: () => require("node:crypto").randomUUID() },
  };
}

function makeServer(kind) {
  const ctx = vm.createContext({ console, Date, Math, JSON });
  vm.runInContext(read("server/Core.gs"), ctx);
  let store, google = null;
  if (kind === "memory") store = vm.runInContext("makeMemoryStore_({API_KEY:'k'})", ctx);
  else {
    google = fakeGoogle();
    const schemas = vm.runInContext("BZX_SCHEMAS_", ctx);
    Object.keys(schemas).forEach((n) => google.mk(n, schemas[n].map((c) => c[0])));
    Object.assign(ctx, { SpreadsheetApp: google.SpreadsheetApp, LockService: google.LockService, PropertiesService: google.PropertiesService, Utilities: google.Utilities, ContentService: {} });
    vm.runInContext(read("server/Sheet.gs"), ctx);
    store = vm.runInContext("makeSheetStore_()", ctx);
  }
  const call = (body) => JSON.parse(JSON.stringify(ctx.bzxHandle_(store, JSON.parse(JSON.stringify(body)))));   // como por HTTP
  return { call, google, ctx, store };
}

// ── Dispositivo (navegador simulado) ──
function makeDevice(server, { failing = false, auth = { key: "k" }, prompt = null } = {}) {
  const ls = { BAZARIX_STORAGE_MODE: "team" };
  const ctx = vm.createContext({
    console, Date, Math, JSON, setTimeout, clearTimeout, Promise, navigator: { onLine: true }, __toasts: [], __pushes: 0, __fail: failing,
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } },
    showToast: (m) => ctx.__toasts.push(m), appConfirm: async () => true, appPrompt: async () => (prompt ? prompt() : null),
  });
  ctx.__auth = auth;
  ctx.__call = async (op, extra) => {
    if (ctx.__fail) throw new Error("sin red");
    const res = server.call({ op, ...extra, ...ctx.__auth });
    if (!res.ok) { const e = new Error(res.error); e.code = res.code; e.fatal = res.code === "UNAUTHORIZED"; throw e; }
    return res;
  };
  ["js/storage.js", "js/team_core.js", "js/state.js", "js/sync_rows.js"].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
  vm.runInContext(`
    TeamAdapter.minSavingMs = 0; TeamAdapter.debounceMs = 5;
    TeamAdapter.transport = {
      call: (op, e) => __call(op, e),
      pull: (r, k) => __call("pull", { sinceRev: r, knownBazaars: k }),
      push: (c) => { __pushes++; return __call("push", { changes: c }); },
    };`, ctx);
  const run = (code) => vm.runInContext(code, ctx);
  const json = (expr) => JSON.parse(run(`JSON.stringify(${expr})`));
  return { ctx, ls, run, json, call: (op, e) => ctx.__call(op, e), sync: () => run("TeamAdapter.sync()"), flush: () => run("TeamAdapter.flush()"), pull: () => run("TeamAdapter.pull()") };
}

const rowsOf = (dev) => dev.json("[...RowSync.stateToRows(AppState).entries()].map(([k,r]) => [k, r.json]).sort((a, b) => (a[0] < b[0] ? -1 : 1))");   // el orden de llegada puede variar entre dispositivos; el contenido no

function seed(dev) {   // un bazar con expositor (con foto), mesa, tarea, compra y gasto
  dev.run(`
    const id = "bazaar-1000";
    AppState.bazaars[id] = { id, name: "Bazar A", createdAt: 1000, color: "", mesasMigradas: true, bgImage: null, logoImage: "data:image/png;base64,LOGO",
      mapConfig: defaultMapConfig(), expositores: [], tables: [], costsConfig: emptyCostsConfig(), invitados: [], customMetrics: [],
      evento: emptyEvento(), tareas: [], compras: [], minuteByMinute: [],
      floors: [createFloor(id + "-floor-1", "Planta baja")], activeFloorId: id + "-floor-1" };
    migrateState(AppState);
    const bz = AppState.bazaars[id];
    bz.expositores.push({ id: "exp-1", nombre: "Ana", negocio: "Joyas", categoria: "cat-1", foto: "data:image/png;base64,AAA", notas: "hola", costo: 100, pagado: false, checklist: defaultChecklistItems() });
    bz.floors[0].bgImage = "data:image/png;base64,BG";
    bz.floors[0].tables.push({ id: "t-1", name: "A-01", x: 10, y: 10, w: 90, h: 50, rotation: 0, exhibitorId: "exp-1", exhibitorId2: "", shared: false, attended: false, absent: false, attended2: false, absent2: false });
    bz.tareas.push({ id: "tarea-1", fase: "previo", actividad: "Apartar lugar", descripcion: "", fecha: "", avance: "", hecho: false, responsableId: "", areaRolId: "" });
    bz.costsConfig.extraCosts.unshift({ id: "cost-1730000000001-a", name: "Sonido", comment: "", unit: 100, qty: 1, cost: 100, ivaIncluido: false });
    bz.costsConfig.extraCosts.unshift({ id: "cost-1730000000002-b", name: "Lonas", comment: "", unit: 50, qty: 1, cost: 50, ivaIncluido: false });
    saveState();`);
}

async function scenario(kind) {
  const server = makeServer(kind);
  const A = makeDevice(server), B = makeDevice(server);
  const t = (name) => console.log(`  ✓ ${kind}: ${name}`);

  // 1. A crea datos y los sube
  seed(A);
  await A.sync();
  assert.equal(A.run("Sync.status"), "saved");
  const ping = server.call({ op: "ping", key: "k" });
  assert.ok(ping.rev >= 1);
  const pulled = server.call({ op: "pull", key: "k", sinceRev: 0 });
  const cols = new Set(pulled.rows.map((r) => r.coleccion));
  for (const c of ["categorias", "caracteristicas", "bazares", "expositores", "pisos", "mesas", "tareas", "gastos", "roles"]) assert.ok(cols.has(c), `falta colección ${c}`);
  assert.ok(!pulled.rows.some((r) => r.json.includes("base64")), "las fotos NO deben subirse");
  t("A sube sus datos por filas, sin fotos");

  // 2. B arranca vacío y baja todo
  await B.sync();
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].name"), "Bazar A");
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].expositores[0].negocio"), "Joyas");
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].expositores[0].foto"), "", "B no recibe la foto");
  assert.equal(A.json("AppState.bazaars['bazaar-1000'].expositores[0].foto"), "data:image/png;base64,AAA", "A conserva su foto");
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].floors[0].tables[0].name"), "A-01");
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].expositores[0].ubicacion"), "A-01", "campo derivado recalculado");
  assert.deepEqual(B.json("AppState.bazaars['bazaar-1000'].costsConfig.extraCosts.map(g => g.name)"), ["Lonas", "Sonido"], "gastos: el más nuevo arriba");
  assert.deepEqual(rowsOf(A), rowsOf(B), "A y B quedan idénticos");
  t("B baja todo, sin fotos y convergiendo con A");

  // 3. Sin ping-pong: tras sincronizar, nadie tiene nada que subir
  const before = A.ctx.__pushes + B.ctx.__pushes;
  await A.sync(); await B.sync();
  assert.equal(A.ctx.__pushes + B.ctx.__pushes, before, "no debe haber subidas vacías");
  t("sin subidas innecesarias (no hay ping-pong)");

  // 4. B marca asistencia (cambia solo la fila de la mesa) y A lo ve
  B.run("AppState.bazaars['bazaar-1000'].floors[0].tables[0].attended = true; saveState();");
  await B.flush();
  const last = server.call({ op: "pull", key: "k", sinceRev: ping.rev });
  assert.deepEqual(last.rows.map((r) => r.key), ["mesas:bazaar-1000:t-1"], "solo se subió la mesa");
  await A.pull();
  assert.equal(A.json("AppState.bazaars['bazaar-1000'].floors[0].tables[0].attended"), true);
  assert.equal(A.json("AppState.bazaars['bazaar-1000'].expositores[0].foto"), "data:image/png;base64,AAA", "la foto local sobrevive al pull");
  assert.equal(A.json("AppState.bazaars['bazaar-1000'].logoImage"), "data:image/png;base64,LOGO");
  assert.equal(A.json("AppState.bazaars['bazaar-1000'].floors[0].bgImage"), "data:image/png;base64,BG");
  t("la asistencia viaja como UNA fila y las fotos locales se conservan");

  // 5. Conflicto: los dos editan lo mismo desde la misma versión
  A.run("AppState.bazaars['bazaar-1000'].expositores[0].notas = 'nota de A'; saveState();");
  B.run("AppState.bazaars['bazaar-1000'].expositores[0].notas = 'nota de B'; saveState();");
  await A.flush();
  await B.flush();
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].expositores[0].notas"), "nota de A", "gana lo que ya estaba en el servidor");
  assert.ok(B.ctx.__toasts.some((m) => /reemplazados/.test(m)), "se avisa a B");
  await A.pull();
  assert.deepEqual(rowsOf(A), rowsOf(B));
  t("choque de ediciones: se resuelve y se avisa");

  // 6. Edición de campos distintos en filas distintas: no hay choque
  A.run("AppState.bazaars['bazaar-1000'].tareas[0].hecho = true; saveState();");
  B.run("AppState.bazaars['bazaar-1000'].compras.push({ id:'compra-1', articulo:'Dulces', descripcion:'', fecha:'', cantidad:1, costoTotal:10, costoUnit:10, ivaIncluido:true, comprado:false, presupuestoId:'', responsableId:'', areaRolId:'' }); saveState();");
  await Promise.all([A.flush(), B.flush()]);
  await A.sync(); await B.sync();
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].tareas[0].hecho"), true);
  assert.equal(A.json("AppState.bazaars['bazaar-1000'].compras.length"), 1);
  assert.deepEqual(rowsOf(A), rowsOf(B));
  t("ediciones en filas distintas se combinan sin perder nada");

  // 7. Borrado
  A.run("AppState.bazaars['bazaar-1000'].compras = []; saveState();");
  await A.flush();
  await B.pull();
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].compras.length"), 0);
  A.run("AppState.bazaars['bazaar-1000'].floors[0].tables = []; saveState();");
  await A.flush(); await B.pull();
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].floors[0].tables.length"), 0);
  t("los borrados se propagan");

  // 8. Offline-first: sin red nada se pierde y al volver se sube
  A.ctx.__fail = true;
  A.run("AppState.bazaars['bazaar-1000'].tareas[0].actividad = 'Hecho sin red'; saveState();");
  await A.flush();
  assert.equal(A.run("Sync.status"), "error");
  assert.equal(A.run("TeamAdapter.dirty"), true);
  assert.ok(JSON.parse(A.ls.EXPOSITORES_APP_STATE__team).bazaars["bazaar-1000"].tareas[0].actividad === "Hecho sin red", "caché local intacto");
  A.ctx.__fail = false;
  await A.flush();
  assert.equal(A.run("Sync.status"), "saved");
  await B.pull();
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].tareas[0].actividad"), "Hecho sin red");
  t("sin conexión se guarda en local y se sube al volver");

  // 9. Un pull no pisa cambios locales sin subir
  A.run("AppState.bazaars['bazaar-1000'].tareas[0].descripcion = 'v-A'; saveState();");
  B.run("AppState.bazaars['bazaar-1000'].tareas[0].descripcion = 'v-B'; saveState();");
  await B.flush();
  await A.pull();                           // A aún no subió su edición
  assert.equal(A.json("AppState.bazaars['bazaar-1000'].tareas[0].descripcion"), "v-A", "el pull respeta lo pendiente");
  await A.flush();                          // al subir hay choque y gana el servidor (B)
  assert.equal(A.json("AppState.bazaars['bazaar-1000'].tareas[0].descripcion"), "v-B");
  t("un pull no pisa lo que aún no subiste");

  // 10. Persistencia: un dispositivo que se reinicia no sube todo otra vez
  const B2 = makeDevice(server);
  B2.ls.EXPOSITORES_APP_STATE__team = B.ls.EXPOSITORES_APP_STATE__team;
  B2.ls.BAZARIX_SYNC_META__team = B.ls.BAZARIX_SYNC_META__team;
  B2.run("AppState = migrateState(JSON.parse(localStorage.getItem('EXPOSITORES_APP_STATE__team')))");
  await B2.sync();
  assert.equal(B2.ctx.__pushes, 0, "tras reiniciar no hay nada que subir");
  t("tras reiniciar solo se sincroniza lo nuevo");

  // 11. Bazar duplicado: mismos ids internos, no chocan
  A.run(`const c = JSON.parse(JSON.stringify(AppState.bazaars['bazaar-1000'])); c.id = 'bazaar-2000'; c.name = 'Copia';
         c.floors.forEach((f, i) => { f.id = 'bazaar-2000-floor-' + (i + 1); }); c.activeFloorId = c.floors[0].id;
         AppState.bazaars['bazaar-2000'] = c; saveState();`);
  await A.flush(); await B.pull();
  assert.equal(B.json("Object.keys(AppState.bazaars).length"), 2);
  assert.equal(B.json("AppState.bazaars['bazaar-2000'].expositores[0].id"), "exp-1");
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].expositores[0].id"), "exp-1");
  t("un bazar duplicado convive con el original (ids por bazar)");
  A.run("delete AppState.bazaars['bazaar-2000']; saveState();");
  await A.flush(); await B.pull();
  assert.equal(B.json("Object.keys(AppState.bazaars).length"), 1);
  t("borrar un bazar borra todas sus filas");

  // 12. Actividades extra: dos cajeros cobrando a la vez no se pisan (cada movimiento es una fila)
  A.run(`{ const bz = AppState.bazaars['bazaar-1000'];
    bz.extras.push({ id: 'extra-1', nombre: 'Taller', genera: true, fondoInicial: 100 });
    bz.minuteByMinute.push({ id: 'minute-x1', extraId: 'extra-1', time: '11:00', horaFin: '', activity: 'Taller', lugar: '', responsableId: '', areaRolId: '', area: '', notes: '', dia: '' });
    saveState(); }`);
  await A.flush(); await B.pull();
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].extras[0].nombre"), "Taller");
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].minuteByMinute.find(r => r.id === 'minute-x1').extraId"), "extra-1");
  const toastsBefore = A.ctx.__toasts.length + B.ctx.__toasts.length;
  A.run("AppState.bazaars['bazaar-1000'].cajaMovs.push({ id: 'mov-a1', extraId: 'extra-1', ts: '2026-11-04T18:00:00.000Z', tipo: 'ingreso', concepto: 'Cobro', monto: 50 }); saveState();");
  B.run("AppState.bazaars['bazaar-1000'].cajaMovs.push({ id: 'mov-b1', extraId: 'extra-1', ts: '2026-11-04T18:00:01.000Z', tipo: 'ingreso', concepto: 'Cobro', monto: 70 }); saveState();");
  await Promise.all([A.flush(), B.flush()]);
  await A.sync(); await B.sync();
  assert.deepEqual(A.json("AppState.bazaars['bazaar-1000'].cajaMovs.map(m => m.id).sort()"), ["mov-a1", "mov-b1"]);
  assert.deepEqual(B.json("AppState.bazaars['bazaar-1000'].cajaMovs.map(m => m.id).sort()"), ["mov-a1", "mov-b1"]);
  assert.equal(A.ctx.__toasts.length + B.ctx.__toasts.length, toastsBefore, "sin avisos de conflicto");
  assert.deepEqual(rowsOf(A), rowsOf(B));
  t("dos cajeros cobran a la vez y no se pierde ningún movimiento");
  A.run("{ const bz = AppState.bazaars['bazaar-1000']; bz.extras = []; bz.cajaMovs = []; bz.minuteByMinute = bz.minuteByMinute.filter(r => r.extraId !== 'extra-1'); saveState(); }");
  await A.flush(); await B.pull();
  assert.equal(B.json("AppState.bazaars['bazaar-1000'].cajaMovs.length + AppState.bazaars['bazaar-1000'].extras.length"), 0);
  t("al borrar una actividad extra desaparecen su caja y su fila del Minuto a Minuto en todos");

  return server;
}

// ── Equipo: dueño, Vista, Cajero y quien crea su propio bazar con código ──
const BZ = "bazaar-1000";
const newBazaar = (dev, id, name) => dev.run(`{
  AppState.bazaars['${id}'] = { id: '${id}', name: '${name}', createdAt: 5000, color: '', mesasMigradas: true, bgImage: null, logoImage: null,
    mapConfig: defaultMapConfig(), expositores: [], tables: [], costsConfig: emptyCostsConfig(), invitados: [], customMetrics: [], evento: emptyEvento(),
    tareas: [], compras: [], minuteByMinute: [], floors: [createFloor('${id}-floor-1', 'Planta baja')], activeFloorId: '${id}-floor-1' };
  migrateState(AppState); saveState(); }`);

async function teamScenario(kind) {
  const server = makeServer(kind);
  const t = (name) => console.log(`  ✓ ${kind}: ${name}`);
  const O = makeDevice(server);                                   // dueño de la hoja (clave)
  seed(O); await O.sync();

  // Beto entra con un código de invitación → VISTA
  const inv = server.call({ op: "invite", key: "k", bazarId: BZ, rol: "vista", usos: 5 });
  const beto = server.call({ op: "redeem", code: inv.code, nombre: "Beto" });
  const M = makeDevice(server, { auth: { token: beto.token } });
  await M.sync();
  assert.equal(M.json(`AppState.bazaars['${BZ}'].name`), "Bazar A");
  assert.equal(M.run(`teamRoleFor('${BZ}').rol`), "vista");
  assert.equal(M.run(`teamCan('expositores:edit', '${BZ}')`), false);
  assert.equal(O.run("teamIsOwner()"), true);
  t("quien entra con código ve el bazar completo y su rol es Vista");

  // Vista intenta editar: el servidor lo rechaza y la app deshace el cambio
  M.run(`AppState.bazaars['${BZ}'].expositores[0].nombre = 'HACK'; AppState.bazaars['${BZ}'].tareas.push({ id: 'tarea-m', fase: 'previo', actividad: 'Colada', descripcion: '', fecha: '', avance: '', hecho: false, responsableId: '', areaRolId: '' }); saveState();`);
  await M.flush();
  assert.equal(M.json(`AppState.bazaars['${BZ}'].expositores[0].nombre`), "Ana", "el nombre vuelve a lo vigente");
  assert.ok(!M.json(`AppState.bazaars['${BZ}'].tareas.some(x => x.id === 'tarea-m')`), "lo nuevo rechazado desaparece");
  assert.ok(M.ctx.__toasts.some((m) => /🔒/.test(m)), "se le avisa");
  const pushes = M.ctx.__pushes;
  M.run("TeamAdapter.dirty = true"); await M.flush();
  assert.equal(M.ctx.__pushes, pushes, "tras deshacer no queda nada por subir (sin bucles)");
  await O.pull();
  assert.equal(O.json(`AppState.bazaars['${BZ}'].expositores[0].nombre`), "Ana");
  t("las escrituras de un Vista se rechazan y se deshacen sin bucles");

  // El admin (dueño) le da el rol Cajero
  const role = server.call({ op: "saveRole", key: "k", bazarId: BZ, nombre: "Cajero", rank: 20, permisos: ["payments:set", "caja:edit"] });
  server.call({ op: "setRole", key: "k", bazarId: BZ, userId: beto.me.user.id, rol: role.role.id });
  await M.run("TeamAdapter.loadMe()");
  assert.equal(M.run(`teamCan('payments:set', '${BZ}')`), true);
  assert.equal(M.run(`teamCan('expositores:edit', '${BZ}')`), false);
  M.run(`{ const e = AppState.bazaars['${BZ}'].expositores[0]; e.pagado = true; e.historial = [{ id: 'h1', texto: 'Marcado como pagado', ts: '2026-11-05' }]; saveState(); }`);
  await M.flush();
  await O.pull();
  assert.equal(O.json(`AppState.bazaars['${BZ}'].expositores[0].pagado`), true, "el Cajero marcó el pago");
  M.run(`{ const e = AppState.bazaars['${BZ}'].expositores[0]; e.nombre = 'Otro'; saveState(); }`);
  await M.flush();
  assert.equal(M.json(`AppState.bazaars['${BZ}'].expositores[0].nombre`), "Ana", "pero no puede renombrar");
  assert.equal(M.json(`AppState.bazaars['${BZ}'].expositores[0].pagado`), true, "y el pago se conserva");
  M.run(`AppState.bazaars['${BZ}'].cajaMovs.push({ id: 'mov-m1', extraId: 'x', ts: '2026-11-05T10:00:00Z', tipo: 'ingreso', concepto: 'Cobro', monto: 50 }); saveState();`);
  await M.flush(); await O.pull();
  assert.equal(O.json(`AppState.bazaars['${BZ}'].cajaMovs.length`), 1, "el Cajero cobra");
  t("un rol personalizado (Cajero) hace solo lo que su rol permite");

  // Nora recibe un código de creación y crea SU bazar → es admin y nadie más lo ve
  const nj = server.call({ op: "redeem", code: server.call({ op: "ownerCode", key: "k" }).code, nombre: "Nora" });
  const N = makeDevice(server, { auth: { token: nj.token } });
  await N.sync();
  assert.equal(N.run("teamMe().creditos"), 1);
  assert.equal(await N.run("teamBeforeCreateBazaar('bazaar-3000')"), true);
  newBazaar(N, "bazaar-3000", "Bazar de Nora");
  await N.flush();
  assert.equal(N.run("teamIsAdmin('bazaar-3000')"), true);
  assert.equal(N.run("teamMe().creditos"), 0);
  await O.pull(); await M.pull();
  assert.equal(O.json("!!AppState.bazaars['bazaar-3000']"), true, "el dueño lo ve");
  assert.equal(M.json("!!AppState.bazaars['bazaar-3000']"), false, "Beto no");
  assert.equal(N.json(`!!AppState.bazaars['${BZ}']`), false, "Nora no ve el de Ana");
  t("crear un bazar con código te hace admin de ese bazar y queda aislado");

  // Sin crédito: pide otro código; sin código no se crea
  N.ctx.appPrompt = async () => null;
  assert.equal(await N.run("teamBeforeCreateBazaar('bazaar-3001')"), false, "sin código no crea");
  const cc2 = server.call({ op: "ownerCode", key: "k" }).code;
  N.ctx.appPrompt = async () => cc2;
  assert.equal(await N.run("teamBeforeCreateBazaar('bazaar-3001')"), true, "con otro código sí");
  M.ctx.appPrompt = async () => null;
  assert.equal(await M.run("teamBeforeCreateBazaar('bazaar-3002')"), false, "un Vista tampoco crea bazares");
  t("cada bazar nuevo cuesta un código de creación");

  // Quitan a Beto: el bazar desaparece de su dispositivo
  server.call({ op: "removeMember", key: "k", bazarId: BZ, userId: beto.me.user.id });
  await M.pull();
  assert.equal(M.json(`!!AppState.bazaars['${BZ}']`), false);
  assert.ok(M.ctx.__toasts.some((m) => /Ya no tienes acceso/.test(m)));
  assert.equal(M.json(`Object.keys(JSON.parse(localStorage.getItem('BAZARIX_SYNC_META__team')).base).some(k => k.includes('${BZ}'))`), false, "tampoco quedan filas suyas en la base");
  t("al quitar a un miembro, el bazar se retira de su dispositivo");
}

async function serverTests(kind) {
  const server = makeServer(kind);
  const c = server.call;
  const t = (name) => console.log(`  ✓ ${kind}: ${name}`);
  const ch = (key, json, extra = {}) => ({ key, coleccion: key.split(":")[0], bazarId: "bazaar-b", baseVersion: 0, json: json ?? '{"a":1}', ...extra });

  assert.equal(c({ op: "ping", key: "mala" }).code, "UNAUTHORIZED");
  assert.deepEqual([c({ op: "ping" }).ok, c({ op: "ping" }).auth], [true, false], "ping sin credenciales solo dice que el servidor existe");
  assert.equal(c({ op: "pull" }).code, "UNAUTHORIZED");
  assert.equal(c({ op: "ping", key: "k" }).ok, true);
  assert.equal(c({ op: "nada", key: "k" }).code, "BAD_OP");
  t("clave y operaciones");

  for (const bad of [ch("hack:1"), ch("tareas:x y"), ch("tareas:bazaar-b:1", "no es json"), ch("tareas:bazaar-b:1", '"texto"'), ch("tareas:bazaar-b:1", "{}", { baseVersion: -1 }),
    ch("tareas:bazaar-b:1", "{}", { baseVersion: 1.5 }), ch("tareas:bazaar-b:1", "{}", { coleccion: "roles" }), ch("tareas:bazaar-b:1", "{}", { bazarId: "<x>" })]) {
    assert.equal(c({ op: "push", key: "k", changes: [bad] }).code, "BAD_CHANGE", JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(c({ op: "push", key: "k", changes: [ch("tareas:bazaar-b:1"), ch("tareas:bazaar-b:1")] }).code, "BAD_CHANGE", "claves repetidas");
  assert.equal(c({ op: "push", key: "k", changes: [] }).code, "BAD_REQUEST");
  assert.equal(c({ op: "push", key: "k", changes: Array.from({ length: 201 }, (_, i) => ch(`tareas:bazaar-b:${i}`)) }).code, "BAD_REQUEST");
  t("validación de cambios");

  const r1 = c({ op: "push", key: "k", changes: [ch("tareas:bazaar-b:1", '{"v":1}')] });
  assert.deepEqual([r1.prevRev, r1.rev, r1.applied[0].version], [0, 1, 1]);
  const r2 = c({ op: "push", key: "k", changes: [ch("tareas:bazaar-b:1", '{"v":2}', { baseVersion: 1 })] });
  assert.equal(r2.applied[0].version, 2);
  const r3 = c({ op: "push", key: "k", changes: [ch("tareas:bazaar-b:1", '{"v":3}', { baseVersion: 1 })] });
  assert.equal(r3.applied.length, 0); assert.equal(r3.conflicts[0].json, '{"v":2}'); assert.equal(r3.rev, r3.prevRev);
  t("versiones: la edición con versión vieja es un conflicto y devuelve lo vigente");

  const d = c({ op: "push", key: "k", changes: [{ key: "tareas:bazaar-b:1", coleccion: "tareas", bazarId: "bazaar-b", baseVersion: 2, deleted: true }] });
  assert.equal(d.applied[0].deleted, true);
  const p = c({ op: "pull", key: "k", sinceRev: 0 });
  const row = p.rows.find((r) => r.key === "tareas:bazaar-b:1");
  assert.equal(row.deleted, true); assert.equal(row.json, ""); assert.equal(row.version, 3);
  const re = c({ op: "push", key: "k", changes: [ch("tareas:bazaar-b:1", '{"v":9}')] });
  assert.equal(re.applied[0].version, 4, "se puede volver a crear sobre un borrado");
  assert.equal(c({ op: "push", key: "k", changes: [{ key: "tareas:bazaar-b:zzz", coleccion: "tareas", bazarId: "bazaar-b", baseVersion: 0, deleted: true }] }).applied[0].version, 0, "borrar algo inexistente no falla");
  t("borrados (tombstones) y recreación");

  const big = JSON.stringify({ texto: "x".repeat(100000) });
  const rb = c({ op: "push", key: "k", changes: [ch("expositores:bazaar-b:grande", big)] });
  assert.equal(rb.ok, true);
  assert.equal(c({ op: "pull", key: "k", sinceRev: 0 }).rows.find((r) => r.key === "expositores:bazaar-b:grande").json, big);
  assert.equal(c({ op: "push", key: "k", changes: [ch("expositores:bazaar-b:enorme", JSON.stringify({ t: "x".repeat(200000) }))] }).code, "BAD_CHANGE", "más de 4 celdas se rechaza");
  t("un registro de 100 000 caracteres se parte en celdas y vuelve igual");

  const inj = c({ op: "push", key: "k", changes: [ch("tareas:bazaar-b:inj", JSON.stringify({ f: "=IMPORTDATA(\"http://x\")", n: "123" }))] });
  assert.equal(inj.ok, true);
  assert.equal(JSON.parse(c({ op: "pull", key: "k", sinceRev: 0 }).rows.find((r) => r.key === "tareas:bazaar-b:inj").json).f, '=IMPORTDATA("http://x")');
  if (server.google) {
    const cells = server.google.grid.flat().filter((x) => typeof x === "string" && x.includes("IMPORTDATA"));
    assert.ok(cells.length && cells.every((x) => x.startsWith("~")), "ninguna celda empieza con '=' (no se ejecuta como fórmula)");
  }
  t("texto con '=' no se guarda como fórmula");

  const since = c({ op: "ping", key: "k" }).rev;
  c({ op: "push", key: "k", changes: [ch("tareas:bazaar-b:otra", '{"v":1}')] });
  assert.deepEqual(c({ op: "pull", key: "k", sinceRev: since }).rows.map((r) => r.key), ["tareas:bazaar-b:otra"], "pull incremental: solo lo nuevo");
  t("pull incremental");
  if (server.google) assert.ok(server.google.locks() > 0, "se usa el candado de escritura"), t("usa el candado (LockService)");
}

(async () => {
  for (const kind of ["memory", "sheet"]) {
    console.log(`\n── Servidor: ${kind === "memory" ? "almacén en memoria" : "hoja de Google simulada"} ──`);
    await serverTests(kind);
    await scenario(kind);
    await teamScenario(kind);
  }
  console.log("\nTODO OK");
  process.exit(0);
})().catch((e) => { console.error("\nFALLA:", e); process.exit(1); });
