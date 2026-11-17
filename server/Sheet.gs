/**
 * BAZARIX — Sheet.gs (Sprint 2)
 * Parte de Google Apps Script: guarda en la hoja "Datos" y publica la API web.
 * Pega este archivo y Core.gs en el mismo proyecto de Apps Script (ver INSTRUCCIONES.md).
 */
var BZX_SHEET_ = "Datos";
var BZX_HEADERS_ = ["key", "coleccion", "bazarId", "version", "rev", "updatedAt", "updatedBy", "deleted", "d1", "d2", "d3", "d4"];

/** Almacén sobre la hoja "Datos": una fila por registro (el JSON va en d1..d4 si es largo). */
function makeSheetStore_() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BZX_SHEET_);
  if (!sh) throw new Error("Falta la hoja '" + BZX_SHEET_ + "'. Ejecuta el menú BAZARIX > Preparar hoja.");
  var props = PropertiesService.getScriptProperties();
  var COLS = BZX_HEADERS_.length;

  function nRows() { return Math.max(0, sh.getLastRow() - 1); }
  function toRec(v) {
    return { key: String(v[0]), coleccion: String(v[1]), bazarId: String(v[2]), version: Number(v[3]) || 0, rev: Number(v[4]) || 0,
      updatedAt: String(v[5]), updatedBy: String(v[6]), deleted: Number(v[7]) === 1, json: bzxJoinJson_([v[8], v[9], v[10], v[11]]) };
  }
  function toArr(r) {
    var c = bzxSplitJson_(r.json || "");
    return [r.key, r.coleccion, r.bazarId, r.version, r.rev, r.updatedAt, r.updatedBy, r.deleted ? 1 : 0, c[0], c[1], c[2], c[3]];
  }
  return {
    withLock: function (fn) {
      var lock = LockService.getScriptLock();
      lock.waitLock(25000);                      // una escritura a la vez: nadie pisa a nadie
      try { return fn(); } finally { lock.releaseLock(); }
    },
    getProp: function (k) { return props.getProperty(k); },
    setProp: function (k, v) { props.setProperty(k, String(v)); },
    index: function () {
      var n = nRows(), m = {};
      if (!n) return m;
      var v = sh.getRange(2, 1, n, 8).getValues();
      for (var i = 0; i < n; i++) m[String(v[i][0])] = { row: i + 2, version: Number(v[i][3]) || 0, deleted: Number(v[i][7]) === 1 };
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

// ── Menú de la hoja ────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi().createMenu("BAZARIX")
    .addItem("1. Preparar hoja", "prepararHoja")
    .addItem("2. Ver URL y clave del equipo", "mostrarConexion")
    .addSeparator()
    .addItem("Regenerar clave (cierra la sesión a todos)", "regenerarClave")
    .addToUi();
}

function prepararHoja() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(BZX_SHEET_) || ss.insertSheet(BZX_SHEET_);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, BZX_HEADERS_.length).setValues([BZX_HEADERS_]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  ["A:C", "F:G", "I:L"].forEach(function (a1) { sh.getRange(a1).setNumberFormat("@"); });   // texto plano
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty("API_KEY")) props.setProperty("API_KEY", Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, ""));
  if (!props.getProperty("REV")) props.setProperty("REV", "0");
  props.setProperty("TEAM_NAME", ss.getName());
  SpreadsheetApp.getUi().alert("Hoja lista", "Ahora publica el script (Implementar > Nueva implementación > Aplicación web) y usa 'Ver URL y clave del equipo'.", SpreadsheetApp.getUi().ButtonSet.OK);
}

function mostrarConexion() {
  var key = PropertiesService.getScriptProperties().getProperty("API_KEY");
  if (!key) { SpreadsheetApp.getUi().alert("Primero ejecuta 'Preparar hoja'."); return; }
  var url = ScriptApp.getService().getUrl() || "(aún no publicada: Implementar > Nueva implementación > Aplicación web)";
  var esc = function (s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); };
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial;font-size:13px">' +
    '<p><b>URL de la aplicación web</b><br><input style="width:100%" readonly value="' + esc(url) + '" onclick="this.select()"></p>' +
    '<p><b>Clave del equipo</b><br><input style="width:100%" readonly value="' + esc(key) + '" onclick="this.select()"></p>' +
    '<p>Pégalas en BAZARIX: ⚙️ &gt; Almacenamiento &gt; Equipo. Comparte la clave solo con tu equipo.</p></div>').setWidth(460).setHeight(260);
  SpreadsheetApp.getUi().showModalDialog(html, "Conexión de BAZARIX");
}

function regenerarClave() {
  var ui = SpreadsheetApp.getUi();
  if (ui.alert("¿Regenerar la clave?", "Todos los dispositivos conectados tendrán que poner la clave nueva.", ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  PropertiesService.getScriptProperties().setProperty("API_KEY", Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, ""));
  mostrarConexion();
}
