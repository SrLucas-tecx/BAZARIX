/**
 * BAZARIX — Core.gs (Sprint 2)
 * Lógica del servidor SIN depender de Google: recibe un "almacén" (store) y atiende las peticiones.
 * Se usa igual en Apps Script (con la hoja), en el modo demo del navegador y en las pruebas.
 *
 * Modelo: cada registro (expositor, tarea, mesa…) es UNA fila con id, versión y revisión.
 *   key        "<coleccion>:<id>"  o  "<coleccion>:<bazarId>:<id>"  (único)
 *   version    sube +1 en cada cambio de ESA fila (detecta ediciones simultáneas)
 *   rev        número de "tanda" global: sirve para que cada cliente pida solo lo nuevo
 *
 * Operaciones (todas POST con JSON):  ping · pull {sinceRev} · push {changes:[...]}
 * Interfaz del store: withLock(fn) getProp(k) setProp(k,v) index() rowsSince(rev) get(keys) write(items)
 */
var BZX_VERSION_ = "2.0";
var BZX_COLLECTIONS_ = { categorias: 1, caracteristicas: 1, plantillas: 1, bazares: 1, expositores: 1, pisos: 1, mesas: 1,
  tareas: 1, compras: 1, invitados: 1, actividades: 1, responsables: 1, roles: 1, gastos: 1, extras: 1, cajamovs: 1 };
var BZX_MAX_CHANGES_ = 200;
var BZX_CHUNK_ = 45000;                              // una celda de Sheets aguanta ~50 000 caracteres
var BZX_MAX_CHUNKS_ = 4;
var BZX_MAX_JSON_ = BZX_CHUNK_ * BZX_MAX_CHUNKS_;
var BZX_KEY_RE_ = /^[a-z]+:[\w.\-:]{1,190}$/;
var BZX_ID_RE_ = /^[\w.\-]{0,150}$/;

function bzxFail_(code, msg) { return { ok: false, code: code, error: msg }; }

function bzxSafeEq_(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

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

function bzxCheckChange_(ch, seen) {
  if (!ch || typeof ch !== "object") return "cambio inválido";
  if (typeof ch.key !== "string" || !BZX_KEY_RE_.test(ch.key)) return "clave inválida";
  var col = ch.key.split(":")[0];
  if (!BZX_COLLECTIONS_[col] || ch.coleccion !== col) return "colección inválida: " + col;
  if (seen[ch.key]) return "clave repetida";
  seen[ch.key] = 1;
  if (typeof ch.bazarId !== "string" || !BZX_ID_RE_.test(ch.bazarId)) return "bazarId inválido";
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

function bzxPull_(store, body) {
  var since = Math.max(0, Math.floor(Number(body.sinceRev) || 0));
  return store.withLock(function () {
    var rows = store.rowsSince(since).map(bzxPublicRow_);
    return { ok: true, rev: Number(store.getProp("REV") || 0), rows: rows };
  });
}

function bzxPush_(store, body) {
  var changes = body.changes;
  if (!Array.isArray(changes) || changes.length === 0 || changes.length > BZX_MAX_CHANGES_) {
    return bzxFail_("BAD_REQUEST", "Envía entre 1 y " + BZX_MAX_CHANGES_ + " cambios por petición");
  }
  var seen = {};
  for (var i = 0; i < changes.length; i++) {
    var problem = bzxCheckChange_(changes[i], seen);
    if (problem) return bzxFail_("BAD_CHANGE", problem + (changes[i] && changes[i].key ? " (" + changes[i].key + ")" : ""));
  }
  var user = String(body.user || "anon").replace(/[<>]/g, "").slice(0, 60);

  return store.withLock(function () {
    var prevRev = Number(store.getProp("REV") || 0);
    var rev = prevRev + 1;
    var idx = store.index();
    var applied = [], writes = [], conflictKeys = [];
    var now = new Date().toISOString();

    for (var j = 0; j < changes.length; j++) {
      var ch = changes[j];
      var cur = idx[ch.key];
      var curVer = cur ? cur.version : 0;
      var ok;
      if (!cur) ok = true;                                             // no existe: se crea (o se ignora si es borrado)
      else if (cur.deleted) ok = ch.deleted ? true : (ch.baseVersion === 0 || ch.baseVersion === curVer);
      else ok = ch.baseVersion === curVer;                             // ¿nadie la cambió desde que la leíste?
      if (!ok) { conflictKeys.push(ch.key); continue; }
      if (!cur && ch.deleted) { applied.push({ key: ch.key, version: 0, deleted: true }); continue; }
      var nv = curVer + 1;
      writes.push({ rowNum: cur ? cur.row : 0, rec: {
        key: ch.key, coleccion: ch.coleccion, bazarId: ch.bazarId, version: nv, rev: rev,
        updatedAt: now, updatedBy: user, deleted: ch.deleted === true, json: ch.deleted === true ? "" : ch.json } });
      applied.push({ key: ch.key, version: nv, deleted: ch.deleted === true });
    }
    if (writes.length) { store.write(writes); store.setProp("REV", String(rev)); }
    var conflicts = conflictKeys.length ? store.get(conflictKeys).map(bzxPublicRow_) : [];
    return { ok: true, prevRev: prevRev, rev: writes.length ? rev : prevRev, applied: applied, conflicts: conflicts };
  });
}

/** Punto de entrada: valida la clave y reparte la operación. Nunca lanza: siempre devuelve un objeto. */
function bzxHandle_(store, body) {
  try {
    if (!body || typeof body !== "object") return bzxFail_("BAD_REQUEST", "Petición inválida");
    var apiKey = store.getProp("API_KEY");
    if (!apiKey || typeof body.key !== "string" || !bzxSafeEq_(body.key, String(apiKey))) {
      return bzxFail_("UNAUTHORIZED", "Clave del equipo incorrecta");
    }
    if (body.op === "ping") return { ok: true, rev: Number(store.getProp("REV") || 0), equipo: store.getProp("TEAM_NAME") || "", version: BZX_VERSION_ };
    if (body.op === "pull") return bzxPull_(store, body);
    if (body.op === "push") return bzxPush_(store, body);
    return bzxFail_("BAD_OP", "Operación desconocida");
  } catch (err) {
    return bzxFail_("SERVER", String(err && err.message ? err.message : err));
  }
}

/** Almacén en memoria (demo del navegador y pruebas). props: {API_KEY, REV…}  rows: arreglo de registros. */
function makeMemoryStore_(props, rows) {
  props = props || {};
  rows = rows || [];
  return {
    props: props, rows: rows,
    withLock: function (fn) { return fn(); },
    getProp: function (k) { return props[k] === undefined ? null : props[k]; },
    setProp: function (k, v) { props[k] = v; },
    index: function () {
      var m = {};
      for (var i = 0; i < rows.length; i++) m[rows[i].key] = { row: i + 1, version: rows[i].version, deleted: !!rows[i].deleted };
      return m;
    },
    rowsSince: function (rev) { return rows.filter(function (r) { return r.rev > rev; }); },
    get: function (keys) { var set = {}; keys.forEach(function (k) { set[k] = 1; }); return rows.filter(function (r) { return set[r.key]; }); },
    write: function (items) {
      items.forEach(function (it) { if (it.rowNum) rows[it.rowNum - 1] = it.rec; else rows.push(it.rec); });
    }
  };
}
