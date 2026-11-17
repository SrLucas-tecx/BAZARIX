/**
 * BAZARIX — Core.gs (Sprint 3)
 * Lógica del servidor SIN depender de Google: recibe un "almacén" (store) y atiende las peticiones.
 * Se usa igual en Apps Script (con la hoja), en el modo demo del navegador y en las pruebas.
 *
 * DATOS: cada registro (expositor, tarea, mesa…) es UNA fila con id, versión y revisión.
 *   key      "<coleccion>:<bazarId>:<id>"   ·  "bazares:<bazarId>" / "costos:<bazarId>"  ·  "<coleccion>:<id>" (catálogos)
 *   version  sube +1 en cada cambio de ESA fila (detecta ediciones simultáneas)
 *   rev      número de "tanda" global: cada cliente pide solo lo nuevo
 *   rank     jerarquía de quien la escribió por última vez (en un choque gana la mayor)
 *
 * ACCESO (sprint 3):
 *   · Dueño de la hoja: usa la "clave del dueño". Puede todo y genera códigos para crear bazares.
 *   · Personas: entran con un CÓDIGO de invitación y reciben un token personal.
 *   · Quien crea un bazar es su ADMIN. Quien se une entra como VISTA (solo lectura) salvo que el código traiga otro rol.
 *   · El admin crea roles personalizados con permisos y rango. TODO se valida aquí, no en la pantalla.
 *
 * Operaciones: ping · redeem · me · pull · push · claimBazaar · invite · ownerCode · codes · revokeCode ·
 *              members · setRole · removeMember · saveRole · deleteRole
 * Interfaz del store: withLock(fn) getProp setProp index() rowsSince(rev) get(keys) write(items) table(name) [now() random(n)]
 */
var BZX_VERSION_ = "3.0";
var BZX_COLLECTIONS_ = { categorias: 1, caracteristicas: 1, plantillas: 1, bazares: 1, costos: 1, expositores: 1, pisos: 1, mesas: 1,
  tareas: 1, compras: 1, invitados: 1, actividades: 1, responsables: 1, roles: 1, gastos: 1, extras: 1, cajamovs: 1 };
var BZX_GLOBAL_ = { categorias: 1, caracteristicas: 1, plantillas: 1 };   // catálogos compartidos por todo el equipo
var BZX_FLAT_ = { bazares: 1, costos: 1 };                                // clave "<col>:<bazarId>"
var BZX_MAX_CHANGES_ = 200;
var BZX_CHUNK_ = 45000;
var BZX_MAX_CHUNKS_ = 4;
var BZX_MAX_JSON_ = BZX_CHUNK_ * BZX_MAX_CHUNKS_;
var BZX_KEY_RE_ = /^[a-z]+:[\w.\-:]{1,190}$/;
var BZX_ID_RE_ = /^[\w.\-]{0,150}$/;
var BZX_BAZAR_RE_ = /^bazaar-[\w.\-]{1,60}$/;
var BZX_RANK_OWNER_ = 1000, BZX_RANK_ADMIN_ = 100;
var BZX_CODE_CHARS_ = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
var BZX_MAX_FAILS_ = 15, BZX_FAIL_WINDOW_MS_ = 10 * 60 * 1000;

/** Qué permiso hace falta para editar cada colección. */
var BZX_COL_PERM_ = { bazares: "ficha:edit", costos: "costos:edit", gastos: "costos:edit", expositores: "expositores:edit",
  pisos: "plano:edit", mesas: "plano:edit", tareas: "tareas:edit", compras: "compras:edit", invitados: "invitados:edit",
  actividades: "actividades:edit", responsables: "staff:edit", roles: "staff:edit", extras: "extras:edit", cajamovs: "caja:edit" };
/** Quien NO tiene el permiso principal puede cambiar solo ciertos campos si tiene el permiso de ese campo. */
var BZX_FIELD_RULES_ = {
  expositores: { pagado: "payments:set", checklist: "checklist:toggle" },
  mesas: { attended: "attendance:set", absent: "attendance:set", attended2: "attendance:set", absent2: "attendance:set" },
  invitados: { confirmado: "attendance:set", asistio: "attendance:set" }
};
var BZX_FREE_FIELDS_ = { expositores: { historial: 1 } };   // la bitácora acompaña a otros cambios permitidos

var BZX_PERMS_ = [
  { key: "ficha:edit", label: "Editar la ficha del evento y sus días", group: "Evento" },
  { key: "expositores:edit", label: "Registrar y editar expositores", group: "Expositores" },
  { key: "checklist:toggle", label: "Marcar los pendientes de los expositores", group: "Expositores" },
  { key: "payments:set", label: "Marcar pagos de expositores", group: "Dinero" },
  { key: "costos:edit", label: "Editar costos del evento y gastos", group: "Dinero" },
  { key: "caja:edit", label: "Registrar movimientos de caja", group: "Dinero" },
  { key: "extras:edit", label: "Editar actividades extra", group: "Planeación" },
  { key: "plano:edit", label: "Editar el plano y asignar mesas", group: "Plano" },
  { key: "attendance:set", label: "Marcar asistencia (mesas y expositores)", group: "Día del evento" },
  { key: "invitados:edit", label: "Editar la lista de asistencia de expositores", group: "Día del evento" },
  { key: "staff:edit", label: "Editar el comité (staff)", group: "Planeación" },
  { key: "tareas:edit", label: "Editar tareas", group: "Planeación" },
  { key: "compras:edit", label: "Editar la lista de compras", group: "Planeación" },
  { key: "actividades:edit", label: "Editar el minuto a minuto", group: "Planeación" }
];
var BZX_PERM_SET_ = {};
(function () { for (var i = 0; i < BZX_PERMS_.length; i++) BZX_PERM_SET_[BZX_PERMS_[i].key] = 1; })();
var BZX_PRESETS_ = [
  { nombre: "Cajero", color: "#f59e0b", rank: 20, permisos: ["caja:edit", "payments:set", "attendance:set"] },
  { nombre: "Acceso / Check-in", color: "#0d9488", rank: 10, permisos: ["attendance:set", "checklist:toggle"] },
  { nombre: "Logística", color: "#8b5cf6", rank: 30, permisos: ["plano:edit", "actividades:edit", "attendance:set", "tareas:edit"] },
  { nombre: "Finanzas", color: "#e11d48", rank: 40, permisos: ["costos:edit", "caja:edit", "payments:set", "compras:edit"] }
];

/** Tablas auxiliares (cada una es una pestaña de la hoja). s = texto, n = número. */
var BZX_SCHEMAS_ = {
  Usuarios: [["id", "s"], ["nombre", "s"], ["tokenHash", "s"], ["creado", "s"], ["visto", "s"], ["estado", "s"], ["creditos", "n"]],
  Miembros: [["id", "s"], ["userId", "s"], ["bazarId", "s"], ["rol", "s"], ["desde", "s"]],
  Codigos: [["id", "s"], ["tipo", "s"], ["bazarId", "s"], ["rol", "s"], ["usos", "n"], ["expira", "s"], ["nota", "s"], ["estado", "s"], ["creadoPor", "s"], ["creado", "s"]],
  RolesAcceso: [["id", "s"], ["bazarId", "s"], ["nombre", "s"], ["color", "s"], ["rank", "n"], ["permisos", "s"]]
};

function bzxFail_(code, msg) { return { ok: false, code: code, error: msg }; }

function bzxSafeEq_(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// ── SHA-256 (puro, síncrono: sirve igual en Apps Script, navegador y Node) ──
var BZX_K_ = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function bzxUtf8_(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00); }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function bzxSha256_(str) {
  var b = bzxUtf8_(String(str)), len = b.length, i, j;
  b.push(0x80);
  while (b.length % 64 !== 56) b.push(0);
  var hi = Math.floor(len * 8 / 4294967296), lo = (len * 8) >>> 0;
  b.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = new Array(64);
  var rotr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
  for (i = 0; i < b.length; i += 64) {
    for (j = 0; j < 16; j++) w[j] = ((b[i + j * 4] << 24) | (b[i + j * 4 + 1] << 16) | (b[i + j * 4 + 2] << 8) | b[i + j * 4 + 3]) | 0;
    for (j = 16; j < 64; j++) {
      var s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      var s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }
    var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (j = 0; j < 64; j++) {
      var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      var ch = (e & f) ^ (~e & g);
      var t1 = (h + S1 + ch + BZX_K_[j] + w[j]) | 0;
      var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      var maj = (a & bb) ^ (a & c) ^ (bb & c);
      var t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  var hex = "";
  for (i = 0; i < 8; i++) hex += ("00000000" + (H[i] >>> 0).toString(16)).slice(-8);
  return hex;
}

function bzxNow_(store) { return store.now ? store.now() : new Date(); }
function bzxRandHex_(store, bytes) {
  if (store.random) return store.random(bytes);
  var s = "";
  for (var i = 0; i < bytes; i++) s += ("0" + Math.floor(Math.random() * 256).toString(16)).slice(-2);
  return s;
}
function bzxNewCode_(store) {
  var raw = bzxRandHex_(store, 12), out = "";
  for (var i = 0; i < 12; i++) out += BZX_CODE_CHARS_.charAt(parseInt(raw.substr(i * 2, 2), 16) % BZX_CODE_CHARS_.length);
  return out;
}
function bzxFmtCode_(c) { return "BZX-" + c.substr(0, 4) + "-" + c.substr(4, 4) + "-" + c.substr(8, 4); }
function bzxNormCode_(s) {
  var n = String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (n.indexOf("BZX") === 0) n = n.substr(3);
  return /^[A-Z0-9]{12}$/.test(n) ? n : "";
}
function bzxCodeHash_(norm) { return bzxSha256_("code:" + norm); }
function bzxCleanText_(s, max) { return String(s == null ? "" : s).replace(/[<>]/g, "").trim().slice(0, max); }

/** JSON -> hasta 4 celdas. Cada celda lleva "~" delante: así Sheets nunca la toma por fórmula, número o fecha. */
function bzxSplitJson_(json) {
  var out = [];
  for (var i = 0; i < BZX_MAX_CHUNKS_; i++) {
    var part = json.substr(i * BZX_CHUNK_, BZX_CHUNK_);
    out.push(part.length ? "~" + part : "");
  }
  return out;
}
function bzxJoinJson_(cells) {
  var s = "";
  for (var i = 0; i < cells.length; i++) {
    var c = String(cells[i] == null ? "" : cells[i]);
    if (c.charAt(0) === "~") s += c.substr(1);
  }
  return s;
}

// ── Validación de cambios ──
function bzxCheckChange_(ch, seen) {
  if (!ch || typeof ch !== "object") return "cambio inválido";
  if (typeof ch.key !== "string" || !BZX_KEY_RE_.test(ch.key)) return "clave inválida";
  var col = ch.key.split(":")[0];
  if (!BZX_COLLECTIONS_[col] || ch.coleccion !== col) return "colección inválida: " + col;
  if (seen[ch.key]) return "clave repetida";
  seen[ch.key] = 1;
  if (typeof ch.bazarId !== "string" || !BZX_ID_RE_.test(ch.bazarId)) return "bazarId inválido";
  if (BZX_GLOBAL_[col]) { if (ch.bazarId !== "") return "un catálogo no pertenece a un bazar"; }
  else {
    if (!BZX_BAZAR_RE_.test(ch.bazarId)) return "bazarId inválido";
    var prefix = BZX_FLAT_[col] ? col + ":" + ch.bazarId : col + ":" + ch.bazarId + ":";
    if (BZX_FLAT_[col] ? ch.key !== prefix : ch.key.indexOf(prefix) !== 0 || ch.key.length === prefix.length) return "la clave no corresponde al bazar";
  }
  var bv = ch.baseVersion;
  if (typeof bv !== "number" || bv < 0 || Math.floor(bv) !== bv) return "baseVersion inválido";
  if (ch.deleted === true) return null;
  if (typeof ch.json !== "string" || ch.json.length === 0 || ch.json.length > BZX_MAX_JSON_) return "json vacío o demasiado grande";
  try { var o = JSON.parse(ch.json); if (!o || typeof o !== "object") return "json inválido"; } catch (e) { return "json inválido"; }
  return null;
}

function bzxPublicRow_(r) {
  return { key: r.key, coleccion: r.coleccion, bazarId: r.bazarId, version: r.version, rev: r.rev,
    updatedAt: r.updatedAt, updatedBy: r.updatedBy, deleted: !!r.deleted, json: r.deleted ? "" : r.json };
}
/** Bazar al que pertenece una fila (las filas del bazar y de costos de la versión 2 no traían bazarId). */
function bzxRowBazar_(r) {
  if (r.bazarId) return r.bazarId;
  return BZX_FLAT_[r.coleccion] ? String(r.key).slice(r.coleccion.length + 1) : "";
}
function bzxChangedKeys_(a, b) {
  var keys = {}, k, out = [];
  for (k in a) keys[k] = 1;
  for (k in b) keys[k] = 1;
  for (k in keys) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(k);
  return out;
}

// ── Autenticación y permisos ──
function bzxAuth_(store, body) {
  var ownerKey = store.getProp("API_KEY");
  if (typeof body.key === "string" && body.key && ownerKey && bzxSafeEq_(body.key, String(ownerKey))) {
    return { ok: true, user: { id: "owner", nombre: bzxCleanText_(body.user, 60) || "Dueño", owner: true } };
  }
  if (typeof body.token === "string" && /^[0-9a-f]{32,128}$/.test(body.token)) {
    var h = bzxSha256_("token:" + body.token);
    var users = store.table("Usuarios"), u = null, all = users.all();
    for (var i = 0; i < all.length; i++) if (all[i].tokenHash === h) { u = all[i]; break; }
    if (u && u.estado === "activo") {
      var now = bzxNow_(store);
      if (!u.visto || now.getTime() - new Date(u.visto).getTime() > 60000) { u.visto = now.toISOString(); users.put(u); }
      return { ok: true, user: { id: u.id, nombre: u.nombre, owner: false, creditos: Number(u.creditos) || 0 } };
    }
  }
  return bzxFail_("UNAUTHORIZED", "Sesión inválida: usa la clave del dueño o vuelve a unirte con un código");
}

function bzxParsePerms_(s) {
  var out = {};
  try { var a = JSON.parse(s || "[]"); for (var i = 0; i < a.length; i++) if (BZX_PERM_SET_[a[i]]) out[a[i]] = 1; } catch (e) { /* vacío */ }
  return out;
}

/** Qué puede hacer una persona en cada bazar suyo: { owner, anyAdmin, bazars: { id: { rol, rank, all, perms } } }. */
function bzxAccess_(store, user) {
  var acc = { owner: !!user.owner, anyAdmin: !!user.owner, bazars: {} };
  if (user.owner) return acc;
  var mine = store.table("Miembros").all().filter(function (m) { return m.userId === user.id; });
  var roles = store.table("RolesAcceso").all();
  mine.forEach(function (m) {
    var info = { rol: m.rol, rank: 0, all: false, perms: {} };
    if (m.rol === "admin") { info.rank = BZX_RANK_ADMIN_; info.all = true; acc.anyAdmin = true; }
    else if (m.rol !== "vista") {
      var r = roles.filter(function (x) { return x.id === m.rol && x.bazarId === m.bazarId; })[0];
      if (r) { info.rank = Math.min(99, Math.max(1, Number(r.rank) || 1)); info.perms = bzxParsePerms_(r.permisos); }
    }
    acc.bazars[m.bazarId] = info;
  });
  return acc;
}
function bzxCan_(acc, bazarId, perm) {
  if (acc.owner) return true;
  var b = acc.bazars[bazarId];
  return !!b && (b.all || !!b.perms[perm]);
}
function bzxIsAdmin_(acc, bazarId) { return acc.owner || (!!acc.bazars[bazarId] && acc.bazars[bazarId].all); }
function bzxRankIn_(acc, bazarId) {
  if (acc.owner) return BZX_RANK_OWNER_;
  if (bazarId && acc.bazars[bazarId]) return acc.bazars[bazarId].rank;
  return acc.anyAdmin ? BZX_RANK_ADMIN_ : 0;
}

/** ¿Puede esta persona hacer este cambio? */
function bzxAuthorize_(store, acc, ch, cur, bazarId) {
  if (acc.owner) return { ok: true };
  var col = ch.coleccion;
  if (BZX_GLOBAL_[col]) return acc.anyAdmin ? { ok: true } : { ok: false, reason: "Solo los administradores editan los catálogos" };
  if (!bazarId || !acc.bazars[bazarId]) return { ok: false, reason: "No eres miembro de este bazar" };
  if (col === "bazares" && ch.deleted === true) return bzxIsAdmin_(acc, bazarId) ? { ok: true } : { ok: false, reason: "Solo un administrador elimina el bazar" };
  var perm = BZX_COL_PERM_[col];
  if (bzxCan_(acc, bazarId, perm)) return { ok: true };
  var rules = BZX_FIELD_RULES_[col];
  if (rules && cur && !cur.deleted && ch.deleted !== true) {
    var old = store.get([ch.key])[0];
    if (old && old.json) {
      var diff = bzxChangedKeys_(JSON.parse(old.json), JSON.parse(ch.json)), free = BZX_FREE_FIELDS_[col] || {};
      var real = diff.filter(function (k) { return !free[k]; });
      var allowed = real.length > 0 && real.every(function (k) { return rules[k] && bzxCan_(acc, bazarId, rules[k]); });
      if (allowed) return { ok: true };
    }
  }
  return { ok: false, reason: "Tu rol no permite editar esto (" + (perm || col) + ")" };
}

// ── Pull / push ──
function bzxPull_(store, body, acc) {
  var since = Math.max(0, Math.floor(Number(body.sinceRev) || 0));
  var known = {};
  (Array.isArray(body.knownBazaars) ? body.knownBazaars : []).forEach(function (id) { if (typeof id === "string") known[id] = 1; });
  var fresh = {}, anyFresh = false;                  // bazares a los que ya tienes acceso pero aún no conoces: se bajan completos
  if (!acc.owner) Object.keys(acc.bazars).forEach(function (id) { if (!known[id]) { fresh[id] = 1; anyFresh = true; } });
  var rows = store.rowsSince(anyFresh ? 0 : since).filter(function (r) {
    var b = bzxRowBazar_(r);
    if (!(r.rev > since || (b && fresh[b]))) return false;
    if (acc.owner) return true;
    return b === "" ? !!BZX_GLOBAL_[r.coleccion] : !!acc.bazars[b];
  }).map(bzxPublicRow_);
  return { ok: true, rev: Number(store.getProp("REV") || 0), rows: rows, access: acc.owner ? null : Object.keys(acc.bazars) };
}

function bzxPush_(store, body, user, acc) {
  var changes = body.changes;
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > BZX_MAX_CHANGES_) {
    return bzxFail_("BAD_REQUEST", "Envía entre 1 y " + BZX_MAX_CHANGES_ + " cambios por petición");
  }
  var seen = {};
  for (var i = 0; i < changes.length; i++) {
    var problem = bzxCheckChange_(changes[i], seen);
    if (problem) return bzxFail_("BAD_CHANGE", problem + (changes[i] && changes[i].key ? " (" + changes[i].key + ")" : ""));
  }
  var prevRev = Number(store.getProp("REV") || 0), rev = prevRev + 1;
  var idx = store.index();
  var applied = [], writes = [], conflictKeys = [], rejected = [];
  var nowIso = bzxNow_(store).toISOString();

  for (var j = 0; j < changes.length; j++) {
    var ch = changes[j], cur = idx[ch.key];
    var bazarId = cur ? bzxRowBazar_({ bazarId: cur.bazarId, coleccion: ch.coleccion, key: ch.key }) : ch.bazarId;
    var authz = bzxAuthorize_(store, acc, ch, cur, bazarId);
    if (!authz.ok) { rejected.push({ key: ch.key, reason: authz.reason }); continue; }

    var curVer = cur ? cur.version : 0, ok, override = false;
    if (!cur) ok = true;
    else if (cur.deleted) ok = ch.deleted ? true : (ch.baseVersion === 0 || ch.baseVersion === curVer);
    else ok = ch.baseVersion === curVer;
    var myRank = bzxRankIn_(acc, bazarId);
    if (!ok && cur && myRank > (Number(cur.rank) || 0)) { ok = true; override = true; }   // gana la mayor jerarquía
    if (!ok) { conflictKeys.push(ch.key); continue; }
    if (!cur && ch.deleted) { applied.push({ key: ch.key, version: 0, deleted: true }); continue; }
    var nv = curVer + 1;
    writes.push({ rowNum: cur ? cur.row : 0, rec: {
      key: ch.key, coleccion: ch.coleccion, bazarId: bazarId, version: nv, rev: rev, updatedAt: nowIso, updatedBy: user.nombre.slice(0, 60),
      deleted: ch.deleted === true, json: ch.deleted === true ? "" : ch.json, rank: myRank } });
    applied.push({ key: ch.key, version: nv, deleted: ch.deleted === true, override: override });
  }
  if (writes.length) { store.write(writes); store.setProp("REV", String(rev)); }

  var back = conflictKeys.concat(rejected.map(function (r) { return r.key; }));
  var serverRows = back.length ? store.get(back).map(bzxPublicRow_) : [];
  var byKey = {};
  serverRows.forEach(function (r) { byKey[r.key] = r; });
  var conflicts = conflictKeys.map(function (k) { return byKey[k]; }).filter(Boolean);
  var rej = rejected.map(function (r) {
    var parts = r.key.split(":");
    var row = byKey[r.key] || { key: r.key, coleccion: parts[0], bazarId: BZX_GLOBAL_[parts[0]] ? "" : parts[1], version: 0, rev: 0, deleted: true, json: "" };
    return { key: r.key, reason: r.reason, row: row };
  });
  return { ok: true, prevRev: prevRev, rev: writes.length ? rev : prevRev, applied: applied, conflicts: conflicts, rejected: rej };
}

// ── Usuarios, códigos y roles ──
function bzxRoleInfo_(store, bazarId, rol) {
  if (rol === "admin") return { nombre: "Administrador", rank: BZX_RANK_ADMIN_ };
  if (rol === "vista") return { nombre: "Vista", rank: 0 };
  var r = store.table("RolesAcceso").all().filter(function (x) { return x.id === rol && x.bazarId === bazarId; })[0];
  return r ? { nombre: r.nombre, rank: Number(r.rank) || 1 } : null;
}

function bzxMe_(store, user, acc) {
  var roles = store.table("RolesAcceso").all();
  var memberships = Object.keys(acc.bazars).map(function (id) {
    var b = acc.bazars[id], info = bzxRoleInfo_(store, id, b.rol);
    return { bazarId: id, rol: b.rol, rolNombre: info ? info.nombre : "Vista", rank: b.rank, todo: b.all, permisos: b.all ? [] : Object.keys(b.perms) };
  });
  var visible = roles.filter(function (r) { return acc.owner || !!acc.bazars[r.bazarId]; }).map(function (r) {
    return { id: r.id, bazarId: r.bazarId, nombre: r.nombre, color: r.color, rank: Number(r.rank) || 1, permisos: Object.keys(bzxParsePerms_(r.permisos)) };
  });
  return { user: { id: user.id, nombre: user.nombre, owner: !!user.owner }, creditos: Number(user.creditos) || 0, memberships: memberships, roles: visible,
    catalogo: { permisos: BZX_PERMS_, plantillas: BZX_PRESETS_ } };
}

function bzxTooManyFails_(store) {
  var raw = store.getProp("FAILS"), f = null;
  try { f = raw ? JSON.parse(raw) : null; } catch (e) { f = null; }
  var now = bzxNow_(store).getTime();
  return !!f && now - f.t < BZX_FAIL_WINDOW_MS_ && f.n >= BZX_MAX_FAILS_;
}
function bzxRegisterFail_(store) {
  var raw = store.getProp("FAILS"), f = null;
  try { f = raw ? JSON.parse(raw) : null; } catch (e) { f = null; }
  var now = bzxNow_(store).getTime();
  if (!f || now - f.t >= BZX_FAIL_WINDOW_MS_) f = { n: 0, t: now };
  f.n++;
  store.setProp("FAILS", JSON.stringify(f));
}

function bzxRedeem_(store, body) {
  if (bzxTooManyFails_(store)) return bzxFail_("TOO_MANY", "Demasiados intentos fallidos. Espera unos minutos.");
  var norm = bzxNormCode_(body.code);
  var codes = store.table("Codigos"), now = bzxNow_(store);
  var rec = null;
  if (norm) { var h = bzxCodeHash_(norm), all = codes.all(); for (var i = 0; i < all.length; i++) if (all[i].id === h) { rec = all[i]; break; } }
  if (!rec || rec.estado !== "activo" || (Number(rec.usos) || 0) <= 0 || new Date(rec.expira).getTime() < now.getTime()) {
    bzxRegisterFail_(store);
    return bzxFail_("BAD_CODE", "Código inválido o vencido");
  }
  var authed = null;
  if (typeof body.token === "string") { var a = bzxAuth_(store, { token: body.token }); if (a.ok) authed = a.user; }
  var nombre = bzxCleanText_(body.nombre, 60);
  if (!authed && !nombre) return bzxFail_("BAD_REQUEST", "Escribe tu nombre");

  var members = store.table("Miembros"), usersT = store.table("Usuarios");
  if (rec.tipo === "unirse") {
    if (rec.rol !== "admin" && rec.rol !== "vista" && !bzxRoleInfo_(store, rec.bazarId, rec.rol)) return bzxFail_("ROLE_GONE", "El rol de este código ya no existe. Pide uno nuevo.");
    if (authed && members.all().some(function (m) { return m.id === authed.id + ":" + rec.bazarId; })) return bzxFail_("ALREADY_MEMBER", "Ya eres miembro de este bazar");
  }
  var user = authed, token = null;
  if (!user) {
    token = bzxRandHex_(store, 20);
    var rec2 = { id: "u-" + bzxRandHex_(store, 6), nombre: nombre, tokenHash: bzxSha256_("token:" + token), creado: now.toISOString(), visto: now.toISOString(), estado: "activo", creditos: 0 };
    usersT.put(rec2);
    user = { id: rec2.id, nombre: nombre, owner: false, creditos: 0 };
  }
  if (rec.tipo === "unirse") {
    members.put({ id: user.id + ":" + rec.bazarId, userId: user.id, bazarId: rec.bazarId, rol: rec.rol, desde: now.toISOString() });
    rec.usos = (Number(rec.usos) || 0) - 1;
  } else {                                                     // código para crear bazares: da "créditos" (un bazar por crédito)
    var u = usersT.all().filter(function (x) { return x.id === user.id; })[0];
    u.creditos = (Number(u.creditos) || 0) + (Number(rec.usos) || 0);
    usersT.put(u);
    user.creditos = u.creditos;
    rec.usos = 0;
  }
  if ((Number(rec.usos) || 0) <= 0) rec.estado = "agotado";
  codes.put(rec);
  var out = { ok: true, me: bzxMe_(store, user, bzxAccess_(store, user)) };
  if (token) out.token = token;
  return out;
}

function bzxAdminOnly_(acc, bazarId) {
  return bzxIsAdmin_(acc, bazarId) ? null : bzxFail_("FORBIDDEN", "Solo un administrador del bazar puede hacer esto");
}
function bzxBazarId_(body) {
  return typeof body.bazarId === "string" && BZX_BAZAR_RE_.test(body.bazarId) ? body.bazarId : "";
}

function bzxMakeCode_(store, user, tipo, bazarId, rol, usos, dias, nota) {
  var plain = bzxNewCode_(store), now = bzxNow_(store);
  store.table("Codigos").put({ id: bzxCodeHash_(plain), tipo: tipo, bazarId: bazarId, rol: rol, usos: usos, nota: nota,
    expira: new Date(now.getTime() + dias * 86400000).toISOString(), estado: "activo", creadoPor: user.id, creado: now.toISOString() });
  return { ok: true, code: bzxFmtCode_(plain), usos: usos, expira: new Date(now.getTime() + dias * 86400000).toISOString() };
}
function bzxIntIn_(v, min, max, def) { var n = Math.floor(Number(v)); return isFinite(n) ? Math.min(max, Math.max(min, n)) : def; }

function bzxAdminCount_(store, bazarId) {
  return store.table("Miembros").all().filter(function (m) { return m.bazarId === bazarId && m.rol === "admin"; }).length;
}

function bzxDispatch_(store, body, op) {
  if (op === "redeem") return bzxRedeem_(store, body);
  var a = bzxAuth_(store, body);
  if (!a.ok) return a;
  var user = a.user, acc = bzxAccess_(store, user), bazarId = bzxBazarId_(body), denied;

  switch (op) {
    case "ping": return { ok: true, auth: true, rev: Number(store.getProp("REV") || 0), equipo: store.getProp("TEAM_NAME") || "", version: BZX_VERSION_, owner: !!user.owner, nombre: user.nombre };
    case "me": return { ok: true, me: bzxMe_(store, user, acc) };
    case "pull": return bzxPull_(store, body, acc);
    case "push": return bzxPush_(store, body, user, acc);

    case "claimBazaar": {
      if (!bazarId) return bzxFail_("BAD_REQUEST", "Id de bazar inválido");
      if (store.table("Miembros").all().some(function (m) { return m.bazarId === bazarId; }) || store.index()["bazares:" + bazarId]) return bzxFail_("EXISTS", "Ese bazar ya existe");
      if (!user.owner) {
        if ((Number(user.creditos) || 0) < 1) return bzxFail_("NO_CREDITS", "Necesitas un código para crear bazares");
        var usersT = store.table("Usuarios"), u = usersT.all().filter(function (x) { return x.id === user.id; })[0];
        u.creditos = (Number(u.creditos) || 0) - 1;
        usersT.put(u);
        user.creditos = u.creditos;
        store.table("Miembros").put({ id: user.id + ":" + bazarId, userId: user.id, bazarId: bazarId, rol: "admin", desde: bzxNow_(store).toISOString() });
        acc = bzxAccess_(store, user);
      }
      return { ok: true, me: bzxMe_(store, user, acc) };
    }
    case "ownerCode":
      if (!user.owner) return bzxFail_("FORBIDDEN", "Solo el dueño de la hoja genera códigos para crear bazares");
      return bzxMakeCode_(store, user, "crear", "", "", bzxIntIn_(body.usos, 1, 50, 1), bzxIntIn_(body.dias, 1, 90, 7), bzxCleanText_(body.nota, 80));
    case "invite": {
      if (!bazarId) return bzxFail_("BAD_REQUEST", "Id de bazar inválido");
      if ((denied = bzxAdminOnly_(acc, bazarId))) return denied;
      var rol = String(body.rol || "vista");
      if (rol !== "admin" && rol !== "vista" && !bzxRoleInfo_(store, bazarId, rol)) return bzxFail_("BAD_REQUEST", "Ese rol no existe en el bazar");
      return bzxMakeCode_(store, user, "unirse", bazarId, rol, bzxIntIn_(body.usos, 1, 100, 1), bzxIntIn_(body.dias, 1, 60, 7), bzxCleanText_(body.nota, 80));
    }
    case "codes": {
      var now = bzxNow_(store).getTime();
      var list = store.table("Codigos").all().filter(function (c) {
        return user.owner ? true : (c.tipo === "unirse" && bzxIsAdmin_(acc, c.bazarId) && (!bazarId || c.bazarId === bazarId));
      }).map(function (c) {
        var vencido = new Date(c.expira).getTime() < now;
        return { id: c.id, tipo: c.tipo, bazarId: c.bazarId, rol: c.rol, usos: Number(c.usos) || 0, expira: c.expira, nota: c.nota, creado: c.creado,
          estado: c.estado === "activo" && vencido ? "vencido" : c.estado };
      });
      return { ok: true, codes: list };
    }
    case "revokeCode": {
      var cT = store.table("Codigos"), rec = cT.all().filter(function (c) { return c.id === body.id; })[0];
      if (!rec) return bzxFail_("NOT_FOUND", "Código no encontrado");
      if (rec.tipo === "crear" ? !user.owner : !!(denied = bzxAdminOnly_(acc, rec.bazarId))) return denied || bzxFail_("FORBIDDEN", "Solo el dueño revoca estos códigos");
      rec.estado = "revocado";
      cT.put(rec);
      return { ok: true };
    }
    case "members": {
      if (!bazarId) return bzxFail_("BAD_REQUEST", "Id de bazar inválido");
      if ((denied = bzxAdminOnly_(acc, bazarId))) return denied;
      var users = store.table("Usuarios").all(), nowMs = bzxNow_(store).getTime();
      var members = store.table("Miembros").all().filter(function (m) { return m.bazarId === bazarId; }).map(function (m) {
        var u = users.filter(function (x) { return x.id === m.userId; })[0] || {};
        var info = bzxRoleInfo_(store, bazarId, m.rol) || { nombre: "Vista", rank: 0 };
        return { userId: m.userId, nombre: u.nombre || "(desconocido)", rol: m.rol, rolNombre: info.nombre, rank: info.rank, desde: m.desde, visto: u.visto || "",
          activo: !!u.visto && nowMs - new Date(u.visto).getTime() < 45000 };
      });
      return { ok: true, members: members };
    }
    case "setRole": {
      if (!bazarId) return bzxFail_("BAD_REQUEST", "Id de bazar inválido");
      if ((denied = bzxAdminOnly_(acc, bazarId))) return denied;
      var target = store.table("Miembros").all().filter(function (m) { return m.id === body.userId + ":" + bazarId; })[0];
      if (!target) return bzxFail_("NOT_FOUND", "Miembro no encontrado");
      var newRol = String(body.rol || "");
      if (newRol !== "admin" && newRol !== "vista" && !bzxRoleInfo_(store, bazarId, newRol)) return bzxFail_("BAD_REQUEST", "Ese rol no existe en el bazar");
      if (target.rol === "admin" && newRol !== "admin" && bzxAdminCount_(store, bazarId) <= 1) return bzxFail_("LAST_ADMIN", "Debe quedar al menos un administrador");
      target.rol = newRol;
      store.table("Miembros").put(target);
      return { ok: true };
    }
    case "removeMember": {
      if (!bazarId) return bzxFail_("BAD_REQUEST", "Id de bazar inválido");
      if ((denied = bzxAdminOnly_(acc, bazarId))) return denied;
      var t2 = store.table("Miembros").all().filter(function (m) { return m.id === body.userId + ":" + bazarId; })[0];
      if (!t2) return bzxFail_("NOT_FOUND", "Miembro no encontrado");
      if (t2.rol === "admin" && bzxAdminCount_(store, bazarId) <= 1) return bzxFail_("LAST_ADMIN", "Debe quedar al menos un administrador");
      store.table("Miembros").del(t2.id);
      return { ok: true };
    }
    case "saveRole": {
      if (!bazarId) return bzxFail_("BAD_REQUEST", "Id de bazar inválido");
      if ((denied = bzxAdminOnly_(acc, bazarId))) return denied;
      var nombreR = bzxCleanText_(body.nombre, 40);
      if (!nombreR) return bzxFail_("BAD_REQUEST", "Falta el nombre del rol");
      if (/^(admin|administrador|vista)$/i.test(nombreR)) return bzxFail_("BAD_REQUEST", "Ese nombre está reservado");
      var color = /^#[0-9a-fA-F]{6}$/.test(String(body.color || "")) ? body.color : "#0d9488";
      var perms = (Array.isArray(body.permisos) ? body.permisos : []).filter(function (p, i, arr) { return BZX_PERM_SET_[p] && arr.indexOf(p) === i; });
      var rT = store.table("RolesAcceso"), existing = rT.all().filter(function (r) { return r.bazarId === bazarId; });
      var id = typeof body.id === "string" && body.id ? body.id : "";
      if (id && !existing.some(function (r) { return r.id === id; })) return bzxFail_("NOT_FOUND", "Rol no encontrado");
      if (existing.some(function (r) { return r.id !== id && r.nombre.toLowerCase() === nombreR.toLowerCase(); })) return bzxFail_("EXISTS", "Ya hay un rol con ese nombre");
      var role = { id: id || "rol-" + bzxRandHex_(store, 6), bazarId: bazarId, nombre: nombreR, color: color, rank: bzxIntIn_(body.rank, 1, 99, 10), permisos: JSON.stringify(perms) };
      rT.put(role);
      return { ok: true, role: { id: role.id, bazarId: bazarId, nombre: nombreR, color: color, rank: role.rank, permisos: perms } };
    }
    case "deleteRole": {
      if (!bazarId) return bzxFail_("BAD_REQUEST", "Id de bazar inválido");
      if ((denied = bzxAdminOnly_(acc, bazarId))) return denied;
      var rT2 = store.table("RolesAcceso"), role2 = rT2.all().filter(function (r) { return r.id === body.id && r.bazarId === bazarId; })[0];
      if (!role2) return bzxFail_("NOT_FOUND", "Rol no encontrado");
      var mT = store.table("Miembros"), moved = 0;
      mT.all().forEach(function (m) { if (m.bazarId === bazarId && m.rol === role2.id) { m.rol = "vista"; mT.put(m); moved++; } });
      rT2.del(role2.id);
      return { ok: true, miembrosAVista: moved };
    }
  }
  return bzxFail_("BAD_OP", "Operación desconocida");
}

/** Punto de entrada: nunca lanza, siempre devuelve un objeto. Todo ocurre dentro de UN solo candado. */
function bzxHandle_(store, body) {
  try {
    if (!body || typeof body !== "object") return bzxFail_("BAD_REQUEST", "Petición inválida");
    var op = String(body.op || "");
    if (op === "ping" && !body.key && !body.token) return { ok: true, auth: false, equipo: store.getProp("TEAM_NAME") || "", version: BZX_VERSION_ };
    return store.withLock(function () { return bzxDispatch_(store, body, op); });
  } catch (err) {
    var msg = String(err && err.message ? err.message : err);
    return bzxFail_(/lock|bloqueo|timeout/i.test(msg) ? "BUSY" : "SERVER", msg);
  }
}

/** Almacén en memoria (demo del navegador y pruebas). props: {API_KEY, REV…}  rows: registros  tables: {Usuarios:[…], …} */
function makeMemoryStore_(props, rows, tables) {
  props = props || {};
  rows = rows || [];
  tables = tables || {};
  Object.keys(BZX_SCHEMAS_).forEach(function (n) { if (!Array.isArray(tables[n])) tables[n] = []; });
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };
  var store = {
    props: props, rows: rows, tables: tables,
    withLock: function (fn) { return fn(); },
    getProp: function (k) { return props[k] === undefined ? null : props[k]; },
    setProp: function (k, v) { props[k] = v; },
    index: function () {
      var m = {};
      for (var i = 0; i < rows.length; i++) m[rows[i].key] = { row: i + 1, version: rows[i].version, deleted: !!rows[i].deleted, bazarId: rows[i].bazarId, rank: rows[i].rank || 0 };
      return m;
    },
    rowsSince: function (rev) { return rows.filter(function (r) { return r.rev > rev; }); },
    get: function (keys) { var set = {}; keys.forEach(function (k) { set[k] = 1; }); return rows.filter(function (r) { return set[r.key]; }); },
    write: function (items) { items.forEach(function (it) { if (it.rowNum) rows[it.rowNum - 1] = it.rec; else rows.push(it.rec); }); },
    table: function (name) {
      var list = tables[name];
      return {
        all: function () { return clone(list); },
        put: function (rec) { var i = list.findIndex(function (r) { return r.id === rec.id; }); var c = clone(rec); if (i >= 0) list[i] = c; else list.push(c); },
        del: function (id) { var i = list.findIndex(function (r) { return r.id === id; }); if (i >= 0) list.splice(i, 1); }
      };
    }
  };
  return store;
}
