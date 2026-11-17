// Pruebas del servidor del sprint 3 (códigos, usuarios, roles, permisos):  node test_auth.js
// Se corre contra el almacén en memoria y contra una hoja de Google simulada.
const vm = require("node:vm");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const read = (p) => fs.readFileSync(p, "utf8");

function fakeGoogle() {
  const sheets = {};
  const mk = (name, headers) => {
    const grid = [headers.slice()];
    sheets[name] = {
      grid,
      getLastRow: () => grid.length,
      deleteRow: (n) => { grid.splice(n - 1, 1); },
      setFrozenRows() {}, 
      getRange: (r, c, nr = 1, nc = 1) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => (grid[r - 1 + i] ? grid[r - 1 + i][c - 1 + j] ?? "" : ""))),
        setValues: (v) => v.forEach((row, i) => { grid[r - 1 + i] = grid[r - 1 + i] || []; row.forEach((x, j) => { grid[r - 1 + i][c - 1 + j] = x; }); }),
        setNumberFormat() { return this; }, setFontWeight() { return this; },
      }),
    };
  };
  mk("Datos", ["key", "coleccion", "bazarId", "version", "rev", "updatedAt", "updatedBy", "deleted", "d1", "d2", "d3", "d4", "rank"]);
  return { sheets, mk, props: { API_KEY: "owner-key-0123456789", REV: "0" }, uuid: 0 };
}

function makeServer(kind) {
  const ctx = vm.createContext({ console, Date, Math, JSON });
  vm.runInContext(read("server/Core.gs"), ctx);
  let store, g = null;
  if (kind === "memory") store = vm.runInContext("makeMemoryStore_({API_KEY:'owner-key-0123456789'})", ctx);
  else {
    g = fakeGoogle();
    const schemas = vm.runInContext("BZX_SCHEMAS_", ctx);
    Object.keys(schemas).forEach((n) => g.mk(n, schemas[n].map((c) => c[0])));
    let counter = 0;
    Object.assign(ctx, {
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => g.sheets[n] || null }) },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in g.props ? g.props[k] : null), setProperty: (k, v) => { g.props[k] = String(v); } }) },
      Utilities: { getUuid: () => require("node:crypto").randomUUID() },
      ContentService: {},
    });
    vm.runInContext(read("server/Sheet.gs"), ctx);
    store = vm.runInContext("makeSheetStore_()", ctx);
  }
  const call = (body) => JSON.parse(JSON.stringify(ctx.bzxHandle_(store, JSON.parse(JSON.stringify(body)))));
  return { call, store, ctx, g };
}

const OWNER = { key: "owner-key-0123456789" };
const BZ = "bazaar-1000", BZ2 = "bazaar-2000";
const ch = (key, obj, extra = {}) => ({ key, coleccion: key.split(":")[0], bazarId: key.startsWith("bazares:") || key.startsWith("costos:") ? key.split(":")[1] : (key.split(":").length === 3 ? key.split(":")[1] : ""), baseVersion: 0, json: JSON.stringify(obj), ...extra });
const del = (key, baseVersion, bazarId) => ({ key, coleccion: key.split(":")[0], bazarId, baseVersion, deleted: true });

async function run(kind) {
  const S = makeServer(kind);
  const c = S.call;
  const t = (name) => console.log(`  ✓ ${kind}: ${name}`);

  // ── Dueño: crea un bazar y su primer admin entra con un código de creación ──
  assert.equal(c({ op: "ping" }).auth, false);
  assert.equal(c({ op: "pull", sinceRev: 0 }).code, "UNAUTHORIZED");
  assert.equal(c({ op: "pull", key: "mala" }).code, "UNAUTHORIZED");
  assert.equal(c({ op: "pull", token: "a".repeat(40) }).code, "UNAUTHORIZED");
  t("sin credenciales no se entra");

  assert.equal(c({ op: "ownerCode", ...OWNER, usos: 2, dias: 3, nota: "Mesa directiva" }).ok, true);
  const creator = c({ op: "ownerCode", ...OWNER, usos: 1 });
  assert.match(creator.code, /^BZX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const ana = c({ op: "redeem", code: creator.code.toLowerCase(), nombre: "Ana" });
  assert.equal(ana.ok, true); assert.match(ana.token, /^[0-9a-f]{40}$/);
  assert.equal(ana.me.creditos, 1); assert.deepEqual(ana.me.memberships, []);
  assert.equal(c({ op: "redeem", code: creator.code, nombre: "Otra" }).code, "BAD_CODE", "el código de un solo uso ya se gastó");
  t("un código de creación da un token y un crédito (un solo uso)");

  const A = { token: ana.token };
  assert.equal(c({ op: "claimBazaar", ...A, bazarId: "malo" }).code, "BAD_REQUEST");
  const claim = c({ op: "claimBazaar", ...A, bazarId: BZ });
  assert.equal(claim.ok, true);
  assert.deepEqual([claim.me.creditos, claim.me.memberships[0].bazarId, claim.me.memberships[0].rol, claim.me.memberships[0].rank], [0, BZ, "admin", 100]);
  assert.equal(c({ op: "claimBazaar", ...A, bazarId: BZ2 }).code, "NO_CREDITS");
  assert.equal(c({ op: "claimBazaar", ...OWNER, bazarId: BZ }).code, "EXISTS");
  t("quien crea el bazar queda como ADMIN y gasta su crédito");

  const pushAs = (who, changes) => c({ op: "push", ...who, changes });
  let r = pushAs(A, [ch(`bazares:${BZ}`, { id: BZ, name: "Bazar" }), ch(`costos:${BZ}`, { ivaRate: 16 }), ch(`expositores:${BZ}:e1`, { id: "e1", nombre: "Luz", negocio: "Velas", pagado: false, costo: 100, checklist: [], historial: [] }),
    ch(`mesas:${BZ}:t1`, { id: "t1", name: "A-01", x: 1, attended: false, absent: false, __p: "p1" }), ch(`categorias:cat-1`, { id: "cat-1", nombre: "Arte" })]);
  assert.equal(r.applied.length, 5, JSON.stringify(r.rejected));
  t("el admin sube todo lo de su bazar (y catálogos)");

  // ── Un usuario nuevo por código se une como VISTA ──
  const inv = c({ op: "invite", ...A, bazarId: BZ, usos: 3, dias: 7, nota: "Equipo" });
  assert.equal(inv.ok, true);
  assert.equal(c({ op: "invite", ...A, bazarId: BZ2 }).code, "FORBIDDEN", "no es admin de otro bazar");
  const beto = c({ op: "redeem", code: inv.code, nombre: "Beto" });
  assert.equal(beto.me.memberships[0].rol, "vista");
  const B = { token: beto.token };
  assert.equal(c({ op: "invite", ...B, bazarId: BZ }).code, "FORBIDDEN", "Vista no invita");
  assert.equal(c({ op: "members", ...B, bazarId: BZ }).code, "FORBIDDEN");
  assert.equal(c({ op: "redeem", code: inv.code, token: beto.token }).code, "ALREADY_MEMBER", "no se une dos veces");
  t("quien se une entra como VISTA y no administra nada");

  // ── Vista: lee, pero no escribe ──
  const pb = c({ op: "pull", ...B, sinceRev: 0, knownBazaars: [] });
  assert.ok(pb.rows.some((x) => x.key === `expositores:${BZ}:e1`), "el Vista ve el bazar");
  assert.deepEqual(pb.access, [BZ]);
  const rej = pushAs(B, [ch(`expositores:${BZ}:e1`, { id: "e1", nombre: "HACK", negocio: "Velas", pagado: false, costo: 100, checklist: [], historial: [] }, { baseVersion: 1 })]);
  assert.equal(rej.applied.length, 0); assert.equal(rej.rejected.length, 1);
  assert.match(rej.rejected[0].reason, /rol/i);
  assert.equal(JSON.parse(rej.rejected[0].row.json).nombre, "Luz", "se devuelve lo vigente para revertir");
  const rej2 = pushAs(B, [ch(`tareas:${BZ}:nueva`, { id: "nueva", actividad: "x" })]);
  assert.equal(rej2.rejected[0].row.deleted, true, "lo nuevo rechazado se devuelve como borrado");
  assert.equal(pushAs(B, [ch(`categorias:cat-9`, { id: "cat-9", nombre: "X" })]).rejected.length, 1, "Vista no edita catálogos");
  t("el Vista puede leer pero el servidor rechaza sus escrituras (y le devuelve lo vigente)");

  // ── Roles personalizados con permisos ──
  assert.equal(c({ op: "saveRole", ...B, bazarId: BZ, nombre: "Cajero", permisos: ["caja:edit"] }).code, "FORBIDDEN");
  assert.equal(c({ op: "saveRole", ...A, bazarId: BZ, nombre: "Admin", permisos: [] }).code, "BAD_REQUEST", "nombres reservados");
  const cajero = c({ op: "saveRole", ...A, bazarId: BZ, nombre: "Cajero", color: "#f59e0b", rank: 20, permisos: ["caja:edit", "payments:set", "attendance:set", "hack:todo", "caja:edit"] });
  assert.deepEqual(cajero.role.permisos, ["caja:edit", "payments:set", "attendance:set"], "se descartan permisos inventados y repetidos");
  assert.equal(c({ op: "saveRole", ...A, bazarId: BZ, nombre: "cajero", permisos: [] }).code, "EXISTS");
  assert.equal(c({ op: "setRole", ...A, bazarId: BZ, userId: beto.me.user.id, rol: "rol-noexiste" }).code, "BAD_REQUEST");
  assert.equal(c({ op: "setRole", ...A, bazarId: BZ, userId: beto.me.user.id, rol: cajero.role.id }).ok, true);
  assert.equal(c({ op: "me", ...B }).me.memberships[0].rolNombre, "Cajero");
  t("el admin crea un rol con permisos y se lo asigna a Beto");

  // Cajero: marca pagado y asistencia, agrega caja; NO edita nombres ni costos
  const e1 = JSON.parse(c({ op: "pull", ...OWNER, sinceRev: 0 }).rows.find((x) => x.key === `expositores:${BZ}:e1`).json);
  assert.equal(pushAs(B, [ch(`expositores:${BZ}:e1`, { ...e1, pagado: true, historial: [{ t: "pagó" }] }, { baseVersion: 1 })]).applied.length, 1, "puede marcar pagado");
  assert.equal(pushAs(B, [ch(`expositores:${BZ}:e1`, { ...e1, pagado: true, nombre: "Cambio", historial: [] }, { baseVersion: 2 })]).rejected.length, 1, "pero no cambiar el nombre");
  assert.equal(pushAs(B, [ch(`expositores:${BZ}:e1`, { ...e1, pagado: true, costo: 1 }, { baseVersion: 2 })]).rejected.length, 1, "ni el costo");
  assert.equal(pushAs(B, [ch(`mesas:${BZ}:t1`, { id: "t1", name: "A-01", x: 1, attended: true, absent: false, __p: "p1" }, { baseVersion: 1 })]).applied.length, 1, "puede marcar asistencia");
  assert.equal(pushAs(B, [ch(`mesas:${BZ}:t1`, { id: "t1", name: "MOVIDA", x: 99, attended: true, absent: false, __p: "p1" }, { baseVersion: 2 })]).rejected.length, 1, "no mueve mesas");
  assert.equal(pushAs(B, [ch(`cajamovs:${BZ}:m1`, { id: "m1", extraId: "x", tipo: "ingreso", monto: 50 })]).applied.length, 1, "puede cobrar");
  assert.equal(pushAs(B, [del(`expositores:${BZ}:e1`, 3, BZ)]).rejected.length, 1, "no borra expositores");
  t("permisos finos: pagado y asistencia sí; nombre, costo, plano y borrados no");

  // ── Aislamiento entre bazares ──
  const ivan = c({ op: "redeem", code: c({ op: "ownerCode", ...OWNER }).code, nombre: "Iván" });
  c({ op: "claimBazaar", token: ivan.token, bazarId: BZ2 });
  assert.equal(pushAs({ token: ivan.token }, [ch(`bazares:${BZ2}`, { id: BZ2, name: "Otro" })]).applied.length, 1);
  assert.equal(pushAs({ token: ivan.token }, [ch(`tareas:${BZ}:z`, { id: "z" })]).rejected.length, 1, "Iván no escribe en el bazar de Ana");
  assert.ok(!c({ op: "pull", token: ivan.token, sinceRev: 0, knownBazaars: [] }).rows.some((x) => x.bazarId === BZ), "Iván no ve el bazar de Ana");
  assert.ok(!c({ op: "pull", ...A, sinceRev: 0, knownBazaars: [] }).rows.some((x) => x.bazarId === BZ2), "Ana no ve el de Iván");
  assert.ok(c({ op: "pull", ...OWNER, sinceRev: 0 }).rows.some((x) => x.bazarId === BZ2), "el dueño ve todo");
  assert.ok(c({ op: "pull", token: ivan.token, sinceRev: 0, knownBazaars: [] }).rows.some((x) => x.key === "categorias:cat-1"), "los catálogos son del equipo");
  // un cambio no puede "mudar" una fila a otro bazar
  assert.equal(pushAs({ token: ivan.token }, [ch(`tareas:${BZ2}:q`, { id: "q" })]).applied.length, 1);
  const mudar = pushAs({ token: ivan.token }, [{ ...ch(`tareas:${BZ2}:q`, { id: "q", a: 1 }, { baseVersion: 1 }), bazarId: BZ }]);
  assert.equal(mudar.ok, false, "la clave no corresponde al bazar declarado");
  t("cada bazar está aislado: no se ve ni se escribe lo ajeno");

  // ── Conocer un bazar nuevo trae todo, aunque sea antiguo ──
  const late = c({ op: "pull", ...B, sinceRev: 999, knownBazaars: [] });
  assert.ok(late.rows.some((x) => x.key === `bazares:${BZ}`), "un bazar desconocido se baja completo");
  assert.equal(c({ op: "pull", ...B, sinceRev: 999, knownBazaars: [BZ] }).rows.length, 0, "ya conocido: solo lo nuevo");
  t("al unirte a un bazar recibes todo su historial");

  // ── Jerarquía: gana el rango mayor en un choque ──
  const adminRow = JSON.parse(c({ op: "pull", ...OWNER, sinceRev: 0 }).rows.find((x) => x.key === `tareas:${BZ2}:q`).json);
  const lo = c({ op: "invite", token: ivan.token, bazarId: BZ2, rol: "admin" });
  const luz = c({ op: "redeem", code: lo.code, nombre: "Luz" });                      // otro admin (mismo rango)
  const same = pushAs({ token: luz.token }, [ch(`tareas:${BZ2}:q`, { id: "q", a: 2 }, { baseVersion: 0 })]);
  assert.equal(same.conflicts.length, 1, "mismo rango: gana quien llegó primero");
  const owner = pushAs(OWNER, [ch(`tareas:${BZ2}:q`, { id: "q", a: 3 }, { baseVersion: 0 })]);
  assert.equal(owner.applied[0].override, true, "el dueño (rango mayor) se impone");
  const cajeroTry = pushAs(B, [ch(`cajamovs:${BZ}:m1`, { id: "m1", extraId: "x", tipo: "ingreso", monto: 60 }, { baseVersion: 0 })]);
  assert.equal(cajeroTry.conflicts.length + cajeroTry.applied.length, 1);
  c({ op: "saveRole", ...A, bazarId: BZ, nombre: "Coordinador", rank: 60, permisos: ["caja:edit"] });
  t("en un choque gana el rango mayor; con rango igual, el primero");

  // ── Administración de miembros ──
  const list = c({ op: "members", ...A, bazarId: BZ });
  assert.deepEqual(list.members.map((m) => [m.nombre, m.rol === "admin" ? "admin" : m.rolNombre]).sort(), [["Ana", "admin"], ["Beto", "Cajero"]]);
  assert.ok(list.members.every((m) => m.visto), "se registra cuándo entró cada uno");
  assert.equal(c({ op: "setRole", ...A, bazarId: BZ, userId: ana.me.user.id, rol: "vista" }).code, "LAST_ADMIN");
  assert.equal(c({ op: "removeMember", ...A, bazarId: BZ, userId: ana.me.user.id }).code, "LAST_ADMIN");
  assert.equal(c({ op: "setRole", ...B, bazarId: BZ, userId: ana.me.user.id, rol: "vista" }).code, "FORBIDDEN");
  const del1 = c({ op: "deleteRole", ...A, bazarId: BZ, id: cajero.role.id });
  assert.equal(del1.miembrosAVista, 1, "quien tenía el rol borrado pasa a Vista");
  assert.equal(c({ op: "me", ...B }).me.memberships[0].rol, "vista");
  assert.equal(c({ op: "removeMember", ...A, bazarId: BZ, userId: beto.me.user.id }).ok, true);
  assert.deepEqual(c({ op: "pull", ...B, sinceRev: 0, knownBazaars: [BZ] }).access, [], "sin membresía ya no ve el bazar");
  t("no se puede dejar un bazar sin admin; borrar un rol o un miembro quita el acceso");

  // ── Códigos: vencen, se revocan y no se adivinan ──
  const short = c({ op: "invite", ...A, bazarId: BZ, dias: 1, usos: 1 });
  S.store.now = () => new Date(Date.now() + 2 * 86400000);
  assert.equal(c({ op: "redeem", code: short.code, nombre: "Tarde" }).code, "BAD_CODE", "vencido");
  delete S.store.now;
  const rev = c({ op: "invite", ...A, bazarId: BZ });
  const listed = c({ op: "codes", ...A, bazarId: BZ }).codes;
  assert.ok(listed.length >= 2 && listed.every((x) => x.tipo === "unirse" && !("code" in x)));
  assert.equal(c({ op: "revokeCode", ...A, id: listed.find((x) => x.estado === "activo").id }).ok, true);
  assert.equal(c({ op: "codes", ...OWNER }).codes.some((x) => x.tipo === "crear"), true, "el dueño ve también los códigos de creación");
  assert.equal(c({ op: "codes", token: ivan.token }).codes.every((x) => x.bazarId === BZ2), true, "cada admin ve solo los de su bazar");
  for (let i = 0; i < 15; i++) c({ op: "redeem", code: "BZX-AAAA-BBBB-CCCC", nombre: "x" });
  assert.equal(c({ op: "redeem", code: rev.code, nombre: "Z" }).code, "TOO_MANY", "tras 15 fallos se bloquea un rato");
  t("códigos: vencen, se revocan, no se listan en claro y hay límite de intentos");

  // el token de un usuario nunca se guarda en claro
  const stored = JSON.stringify(S.g ? S.g.sheets.Usuarios.grid : S.store.tables.Usuarios);
  assert.ok(!stored.includes(ana.token), "solo se guarda el hash del token");
  t("el token no se guarda en claro");
}

(async () => {
  for (const kind of ["memory", "sheet"]) { console.log(`\n── ${kind === "memory" ? "almacén en memoria" : "hoja de Google simulada"} ──`); await run(kind); }
  console.log("\nTODO OK");
})().catch((e) => { console.error("\nFALLA:", e); process.exit(1); });

// ── Sprint 4: consulta barata de cambios y contador de miembros ──
(async () => {
  for (const kind of ["memory", "sheet"]) {
    const S = makeServer(kind), c = S.call, t = (n) => console.log(`  ✓ ${kind}: ${n}`);
    assert.equal(c({ op: "rev" }).code, "UNAUTHORIZED");
    const r0 = c({ op: "rev", ...OWNER });
    assert.deepEqual([r0.ok, r0.rev, r0.memRev], [true, 0, 0]);
    const cc = c({ op: "ownerCode", ...OWNER }).code;
    const ana = c({ op: "redeem", code: cc, nombre: "Ana" });
    c({ op: "claimBazaar", token: ana.token, bazarId: BZ });
    const afterClaim = c({ op: "rev", token: ana.token });
    assert.equal(afterClaim.memRev, 1, "crear un bazar cambia el contador de miembros");
    assert.equal(afterClaim.rev, 0, "pero no el de datos");
    c({ op: "push", token: ana.token, changes: [ch(`bazares:${BZ}`, { id: BZ })] });
    assert.equal(c({ op: "rev", token: ana.token }).rev, 1, "escribir datos sube el contador de datos");
    const inv = c({ op: "invite", token: ana.token, bazarId: BZ });
    const beto = c({ op: "redeem", code: inv.code, nombre: "Beto" });
    assert.equal(c({ op: "rev", ...OWNER }).memRev, 2, "unirse lo sube");
    c({ op: "setRole", token: ana.token, bazarId: BZ, userId: beto.me.user.id, rol: "admin" });
    assert.equal(c({ op: "rev", ...OWNER }).memRev, 3, "cambiar un rol lo sube");
    const rl = c({ op: "saveRole", token: ana.token, bazarId: BZ, nombre: "X", permisos: [] });
    c({ op: "deleteRole", token: ana.token, bazarId: BZ, id: rl.role.id });
    c({ op: "removeMember", token: ana.token, bazarId: BZ, userId: beto.me.user.id });
    assert.equal(c({ op: "rev", ...OWNER }).memRev, 6, "crear/borrar rol y quitar miembro también");
    assert.equal(c({ op: "pull", ...OWNER, sinceRev: 0 }).memRev, 6, "el pull también informa el contador");
    assert.equal(c({ op: "rev", ...OWNER }).rev, 1, "las consultas no cambian nada");
    // presencia: quien consulta queda "activo"
    const members = c({ op: "members", token: ana.token, bazarId: BZ }).members;
    assert.equal(members.find((m) => m.nombre === "Ana").activo, true);
    t("rev: contadores de datos y de miembros (barato, solo lectura) y presencia");
  }
  console.log("\nTODO OK (sprint 4)");
})().catch((e) => { console.error("\nFALLA:", e); process.exit(1); });
