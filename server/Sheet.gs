/**
 * BAZARIX — Sheet.gs (Sprint 3)
 * Parte de Google Apps Script: guarda en la hoja y publica la API web.
 * Pestañas: "Datos" (una fila por registro) y las tablas de acceso "Usuarios", "Miembros", "Codigos", "RolesAcceso".
 * Pega este archivo y Core.gs en el mismo proyecto de Apps Script (ver INSTRUCCIONES.md).
 */
var BZX_SHEET_ = "Datos";
var BZX_HEADERS_ = ["key", "coleccion", "bazarId", "version", "rev", "updatedAt", "updatedBy", "deleted", "d1", "d2", "d3", "d4", "rank"];

/** Almacén sobre la hoja: "Datos" guarda los registros; cada tabla de acceso es su propia pestaña. */
function makeSheetStore_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BZX_SHEET_);
  if (!sh) throw new Error("Falta la hoja '" + BZX_SHEET_ + "'. Ejecuta el menú BAZARIX > Preparar hoja.");
  var props = PropertiesService.getScriptProperties();
  var COLS = BZX_HEADERS_.length;

  function nRows() { return Math.max(0, sh.getLastRow() - 1); }
  function toRec(v) {
    return { key: String(v[0]), coleccion: String(v[1]), bazarId: String(v[2]), version: Number(v[3]) || 0, rev: Number(v[4]) || 0,
      updatedAt: String(v[5]), updatedBy: String(v[6]), deleted: Number(v[7]) === 1, json: bzxJoinJson_([v[8], v[9], v[10], v[11]]), rank: Number(v[12]) || 0 };
  }
  function toArr(r) {
    var c = bzxSplitJson_(r.json || "");
    return [r.key, r.coleccion, r.bazarId, r.version, r.rev, r.updatedAt, r.updatedBy, r.deleted ? 1 : 0, c[0], c[1], c[2], c[3], r.rank || 0];
  }
  function enc(v, t) { return t === "n" ? (Number(v) || 0) : "~" + String(v == null ? "" : v); }
  function dec(v, t) {
    if (t === "n") return Number(v) || 0;
    var s = String(v == null ? "" : v);
    return s.charAt(0) === "~" ? s.substr(1) : s;
  }

  return {
    withLock: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(25000);                      // una operación a la vez: nadie pisa a nadie
      try { return fn(); } finally { lock.releaseLock(); }
    },
    getProp: function (k) { return props.getProperty(k); },
    setProp: function (k, v) { props.setProperty(k, String(v)); },
    random: function (bytes) {
      var s = "";
      while (s.length < bytes * 2) s += Utilities.getUuid().replace(/-/g, "");
      return s.substr(0, bytes * 2);
    },
    index: function () {
      var n = nRows(), m = {};
      if (!n) return m;
      var v = sh.getRange(2, 1, n, COLS).getValues();
      for (var i = 0; i < n; i++) m[String(v[i][0])] = { row: i + 2, version: Number(v[i][3]) || 0, deleted: Number(v[i][7]) === 1, bazarId: String(v[i][2]), rank: Number(v[i][12]) || 0 };
      return m;
    },
    rowsSince: function (rev) {
      var n = nRows(), out = [];
      if (!n) return out;
      var v = sh.getRange(2, 1, n, COLS).getValues();
      for (var i = 0; i < n; i++) if ((Number(v[i][4]) || 0) > rev) out.push(toRec(v[i]));
      return out;
    },
    get: function (keys) {
      var set = {}, n = nRows(), out = [];
      keys.forEach(function (k) { set[k] = 1; });
      if (!n) return out;
      var v = sh.getRange(2, 1, n, COLS).getValues();
      for (var i = 0; i < n; i++) if (set[String(v[i][0])]) out.push(toRec(v[i]));
      return out;
    },
    write: function (items) {
      var append = [];
      items.forEach(function (it) {
        if (it.rowNum) sh.getRange(it.rowNum, 1, 1, COLS).setValues([toArr(it.rec)]);
        else append.push(toArr(it.rec));
      });
      if (append.length) sh.getRange(sh.getLastRow() + 1, 1, append.length, COLS).setValues(append);
    },
    table: function (name) {
      var sc = BZX_SCHEMAS_[name], t = ss.getSheetByName(name);
      if (!sc || !t) throw new Error("Falta la pestaña '" + name + "'. Ejecuta el menú BAZARIX > Preparar hoja.");
      function readAll() {
        var n = Math.max(0, t.getLastRow() - 1);
        if (!n) return [];
        return t.getRange(2, 1, n, sc.length).getValues().map(function (r, i) {
          var o = { _row: i + 2 };
          sc.forEach(function (c, j) { o[c[0]] = dec(r[j], c[1]); });
          return o;
        });
      }
      return {
        all: function () { return readAll().map(function (o) { delete o._row; return o; }); },
        put: function (rec) {
          var found = readAll().filter(function (r) { return r.id === rec.id; })[0];
          var arr = sc.map(function (c) { return enc(rec[c[0]], c[1]); });
          if (found) t.getRange(found._row, 1, 1, sc.length).setValues([arr]);
          else t.getRange(t.getLastRow() + 1, 1, 1, sc.length).setValues([arr]);
        },
        del: function (id) {
          var rows = readAll();
          for (var i = rows.length - 1; i >= 0; i--) if (rows[i].id === id) t.deleteRow(rows[i]._row);
        }
      };
    }
  };
}

function bzxOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** La app llama aquí (POST con texto plano para evitar el "preflight" CORS del navegador). */
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return bzxOut_(bzxFail_("BAD_REQUEST", "JSON inválido")); }
  try { return bzxOut_(bzxHandle_(makeSheetStore_(), body)); }
  catch (err) { return bzxOut_(bzxFail_("SERVER", String(err && err.message ? err.message : err))); }
}

function doGet() {
  return ContentService.createTextOutput("BAZARIX API activa (v" + BZX_VERSION_ + ")");
}

// ── Respaldo de la hoja (Sprint 6) ─────────────────────────────
// Copia la hoja completa (datos, usuarios, códigos y script) a la carpeta "BAZARIX respaldos" de tu Drive.
// La copia contiene teléfonos y correos: no compartas esa carpeta. Se conservan las últimas BZX_BACKUP_KEEP_ copias
// (las más viejas van a la papelera de Drive, donde se pueden recuperar).
var BZX_BACKUP_FOLDER_ = "BAZARIX respaldos";
var BZX_BACKUP_KEEP_ = 8;

/** Dado [{ id, name, created }] devuelve los ids a mandar a la papelera: los más viejos que pasen de `keep` y que sean respaldos de esta hoja. */
function bzxRespaldosAPodar_(files, prefix, keep) {
  return files.filter(function (f) { return String(f.name).indexOf(prefix) === 0; })
    .sort(function (a, b) { return b.created - a.created; })
    .slice(keep).map(function (f) { return f.id; });
}

function bzxCarpetaRespaldos_() {
  var it = DriveApp.getFoldersByName(BZX_BACKUP_FOLDER_);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BZX_BACKUP_FOLDER_);
}

/** Hace una copia ahora y poda las viejas. Devuelve { nombre, podadas }. */
function bzxHacerRespaldo_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), folder = bzxCarpetaRespaldos_();
  var prefix = ss.getName() + " — respaldo ";
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd_HHmm");
  var copy = DriveApp.getFileById(ss.getId()).makeCopy(prefix + stamp, folder);
  var files = [], it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); files.push({ id: f.getId(), name: f.getName(), created: f.getDateCreated().getTime() }); }
  var old = bzxRespaldosAPodar_(files, prefix, BZX_BACKUP_KEEP_);
  old.forEach(function (id) { DriveApp.getFileById(id).setTrashed(true); });
  return { nombre: copy.getName(), podadas: old.length };
}

function respaldarHoja() {
  var r = bzxHacerRespaldo_();
  SpreadsheetApp.getUi().alert("Respaldo listo", "Se creó «" + r.nombre + "» en la carpeta «" + BZX_BACKUP_FOLDER_ + "» de tu Drive." + (r.podadas ? "\nSe mandaron a la papelera " + r.podadas + " respaldo(s) antiguo(s)." : ""), SpreadsheetApp.getUi().ButtonSet.OK);
}

/** La ejecuta el activador semanal (sin ventanas). */
function respaldoAutomatico() { bzxHacerRespaldo_(); }

function bzxQuitarActivadoresRespaldo_() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "respaldoAutomatico") { ScriptApp.deleteTrigger(t); n++; } });
  return n;
}
function activarRespaldoSemanal() {
  bzxQuitarActivadoresRespaldo_();                                   // no se duplican si lo activas dos veces
  ScriptApp.newTrigger("respaldoAutomatico").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  SpreadsheetApp.getUi().alert("Respaldo semanal activado", "Cada lunes de madrugada se copiará la hoja a «" + BZX_BACKUP_FOLDER_ + "».", SpreadsheetApp.getUi().ButtonSet.OK);
}
function desactivarRespaldoSemanal() {
  var n = bzxQuitarActivadoresRespaldo_();
  SpreadsheetApp.getUi().alert(n ? "Respaldo semanal desactivado" : "No había respaldo semanal activo");
}

// ── Menú de la hoja ────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu("BAZARIX")
    .addItem("1. Preparar hoja", "prepararHoja")
    .addItem("2. Ver URL y clave del dueño", "mostrarConexion")
    .addSeparator()
    .addItem("Regenerar clave del dueño", "regenerarClave")
    .addSeparator()
    .addItem("Hacer respaldo ahora", "respaldarHoja")
    .addItem("Activar respaldo semanal", "activarRespaldoSemanal")
    .addItem("Desactivar respaldo semanal", "desactivarRespaldoSemanal")
    .addToUi();
}

function prepararHoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var datos = ss.getSheetByName(BZX_SHEET_) || ss.insertSheet(BZX_SHEET_);
  datos.getRange(1, 1, 1, BZX_HEADERS_.length).setValues([BZX_HEADERS_]).setFontWeight("bold");
  datos.setFrozenRows(1);
  ["A:C", "F:G", "I:L"].forEach(function (a1) { datos.getRange(a1).setNumberFormat("@"); });   // texto plano
  Object.keys(BZX_SCHEMAS_).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var heads = BZX_SCHEMAS_[name].map(function (c) { return c[0]; });
    sh.getRange(1, 1, 1, heads.length).setValues([heads]).setFontWeight("bold");
    sh.setFrozenRows(1);
  });
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("API_KEY")) props.setProperty("API_KEY", Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, ""));
  if (!props.getProperty("REV")) props.setProperty("REV", "0");
  props.setProperty("TEAM_NAME", ss.getName());
  SpreadsheetApp.getUi().alert("Hoja lista", "Ahora publica el script (Implementar > Nueva implementación > Aplicación web) y usa 'Ver URL y clave del dueño'.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function mostrarConexion() {
  var key = PropertiesService.getScriptProperties().getProperty("API_KEY");
  if (!key) { SpreadsheetApp.getUi().alert("Primero ejecuta 'Preparar hoja'."); return; }
  var url = ScriptApp.getService().getUrl() || "(aún no publicada: Implementar > Nueva implementación > Aplicación web)";
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial;font-size:13px">' +
    '<p><b>URL de la aplicación web</b> (se la das a todo el equipo)<br><input style="width:100%" readonly value="' + esc(url) + '" onclick="this.select()"></p>' +
    '<p><b>Clave del dueño</b> (SOLO para ti: da control total)<br><input style="width:100%" readonly value="' + esc(key) + '" onclick="this.select()"></p>' +
    '<p>El equipo entra con <b>códigos de invitación</b> que tú o los administradores de cada bazar generan desde la app. No compartas la clave del dueño.</p></div>').setWidth(480).setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, "Conexión de BAZARIX");
}

function regenerarClave() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert("¿Regenerar la clave del dueño?", "Los dispositivos conectados como dueño tendrán que poner la clave nueva. Los miembros con código no se ven afectados.", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty("API_KEY", Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, ""));
  mostrarConexion();
}
