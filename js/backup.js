/**
 * BAZARIX — backup.js (v4.3)
 * Exportar un bazar completo o solo las secciones elegidas, e importar
 * con dos modos: COMBINAR (agrega/actualiza por id) o REEMPLAZAR.
 *
 * Formato de exportación (tipo "bazar"):
 *   { app, tipo:"bazar", version, exportedAt, origen:{id,name}, secciones:[...], datos:{ <seccion>: ... } }
 *
 * También sabe leer los respaldos completos antiguos (todo el AppState):
 * en ese caso el usuario elige de cuál bazar del archivo importar.
 *
 * Novedades v4.3:
 *  - Eventos de varios días: ficha.multiDia + ficha.dias, expositor.diasParticipacion,
 *    minutoAMinuto[].dia y plano.floors[].dia (los días se referencian por id).
 *  - Color del bazar en "Datos generales". Aviso si los datos usan días que el destino no tiene.
 *
 * Novedades v4.2:
 *  - Catálogo global "caracteristicas" (antes subcategorías): sección propia al exportar/importar.
 *  - Los archivos viejos con subcategorías (categorias con tipo "subcategoria" y expositor.subcategoria)
 *    se convierten solos a características.
 *
 * Novedades v4.1:
 *  - Sección "staff" (roles + responsables): tareas, compras, agenda y expositores apuntan a ellos por id.
 *  - Normalización de lo importado (tipos, fechas DD/MM/AAAA, booleanos, valores por defecto).
 *  - Importación con reversa: si no se puede guardar, se restaura el estado anterior.
 *  - Aviso de archivos de versión más nueva y de secciones que dependen de Staff.
 *  - Guardado: aviso al cerrar con cambios sin guardar. Logo y plano de fondo se comprimen al subirlos.
 *
 * Dependencias: state.js, utils.js, modales.js (openModal/closeModal),
 *               bazaars.js (renderAll, syncCanvasWithState)
 * Cargar DESPUÉS de dialogs.js y ANTES de init.js.
 */

const BACKUP_APP_NAMES = ["BAZARIX", "BAZARICXS", "BARARIX-EXPOSITORES", "EXPOSITORES.COM"];
const BACKUP_VERSION = 4;

// scope "bazar": vive dentro de un bazar · scope "global": compartido entre bazares
const BACKUP_SECTIONS = [
  { key: "general",       scope: "bazar",  label: "Datos generales",  desc: "Nombre, logo, color y escala del plano",
    count: (d) => (d?.logoImage ? "con logo" : "sin logo") },
  { key: "ficha",         scope: "bazar",  label: "Ficha del evento", desc: "Fecha, días del evento, objetivo, líderes, público, lugar y staff",
    count: (d) => `${d.fecha ? `fecha ${d.fecha}` : "sin fecha"}${d.multiDia && (d.dias || []).length > 1 ? ` · ${d.dias.length} días` : ""}` },
  { key: "staff",         scope: "bazar",  label: "Staff (roles y responsables)", desc: "Personas y áreas a las que apuntan tareas, compras, agenda y expositores",
    count: (d) => `${(d.roles || []).length} rol(es) · ${(d.responsables || []).length} persona(s)` },
  { key: "tareas",        scope: "bazar",  label: "Tareas previas y posteriores", desc: "Fases Previo y Post",
    count: (d) => `${d.length} tarea(s)` },
  { key: "compras",       scope: "bazar",  label: "Lista de compras", desc: "Artículos, responsables y costos",
    count: (d) => `${d.length} artículo(s)` },
  { key: "expositores",   scope: "bazar",  label: "Expositores",      desc: "Datos, pagos, checklist e historial",
    count: (d) => `${d.length} expositor(es)` },
  { key: "invitados",     scope: "bazar",  label: "Lista de expositores (invitados)", desc: "Confirmación y asistencia",
    count: (d) => `${d.length} registro(s)` },
  { key: "costos",        scope: "bazar",  label: "Costos del evento", desc: "Mobiliario y gastos extra",
    count: (d) => `${(d.extraCosts || []).length} gasto(s) extra` },
  { key: "minutoAMinuto", scope: "bazar",  label: "Minuto a Minuto",  desc: "Agenda del evento",
    count: (d) => `${d.length} actividad(es)` },
  { key: "plano",         scope: "bazar",  label: "Plano del evento", desc: "Pisos, mesas, elementos, zonas e imagen de fondo",
    count: (d) => `${d.floors.length} piso(s) · ${d.floors.reduce((s, f) => s + (f.tables || []).length, 0)} mesa(s)` },
  { key: "categorias",    scope: "global", label: "Categorías",       desc: "Las usan los expositores de todos los bazares",
    count: (d) => `${d.length} categoría(s)` },
  { key: "caracteristicas", scope: "global", label: "Características", desc: "Etiquetas extra del negocio; las usan los expositores de todos los bazares",
    count: (d) => `${d.length} característica(s)` },
  { key: "plantillas",    scope: "global", label: "Expositores guardados (plantillas)", desc: "Reutilizables entre bazares",
    count: (d) => `${d.length} plantilla(s)` },
];

// Secciones cuyos datos apuntan a personas del Staff por id.
const BACKUP_NEEDS_STAFF = ["tareas", "compras", "minutoAMinuto", "expositores"];

// ==========================================
// Helpers
// ==========================================
const _bkClone = (value) => JSON.parse(JSON.stringify(value));
const _bkUid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const _bkIsObj = (v) => v && typeof v === "object" && !Array.isArray(v);

function backupSectionValid(key, data) {
  if (key === "staff") return _bkIsObj(data) && (Array.isArray(data.roles) || Array.isArray(data.responsables));
  if (key === "general" || key === "costos" || key === "ficha") return _bkIsObj(data);
  if (key === "plano") return _bkIsObj(data) && Array.isArray(data.floors);
  return Array.isArray(data);
}

/** Datos de una sección global (compartida entre bazares). */
function _bkGlobalData(key) {
  return key === "categorias" ? AppState.categorias
    : key === "caracteristicas" ? (AppState.caracteristicas || [])
    : AppState.expositorPlantillas;
}
const _BK_GLOBAL_TARGET = { categorias: "categorias", caracteristicas: "caracteristicas", plantillas: "expositorPlantillas" };

/** Archivos viejos: separa las subcategorías (tipo "subcategoria") del catálogo de categorías. */
function _bkSepararCatalogos(categorias, caracteristicas) {
  if (!Array.isArray(categorias)) return { categorias, caracteristicas };
  const viejas = categorias.filter((c) => c && c.tipo === "subcategoria");
  const nuevas = Array.isArray(caracteristicas) ? caracteristicas.slice() : [];
  viejas.forEach((c) => {
    if (!nuevas.some((x) => x && x.id === c.id)) {
      nuevas.push({ id: c.id, nombre: c.nombre, emoji: c.emoji, color: c.color, descripcion: c.descripcion });
    }
  });
  const limpias = categorias.filter((c) => !(c && c.tipo === "subcategoria"))
    .map((c) => { const { tipo, parentId, tieneSubcategorias, ...resto } = c || {}; return resto; });
  return { categorias: limpias, caracteristicas: (viejas.length || Array.isArray(caracteristicas)) ? nuevas : caracteristicas };
}

/** Lista de ids de características de un registro (acepta el campo viejo "subcategoria"). */
function _bkCaracteristicasDe(r) {
  const lista = Array.isArray(r.caracteristicas) ? r.caracteristicas : (r.subcategoria ? [r.subcategoria] : []);
  return [...new Set(lista.map((v) => String(v ?? "").trim()).filter(Boolean))];
}

/** Extrae de un bazar las secciones que se pueden exportar. */
function backupExtraerSecciones(bz) {
  return {
    general:       { name: bz.name, logoImage: bz.logoImage || null, color: bz.color || "", mapConfig: bz.mapConfig },
    ficha:         bz.evento || emptyEvento(),
    staff:         { roles: bz.roles || [], responsables: bz.responsables || [] },
    tareas:        bz.tareas || [],
    compras:       bz.compras || [],
    expositores:   bz.expositores || [],
    invitados:     bz.invitados || [],
    costos:        bz.costsConfig || emptyCostsConfig(),
    minutoAMinuto: bz.minuteByMinute || [],
    plano:         { floors: bz.floors || [], activeFloorId: bz.activeFloorId },
  };
}

function _bkSectionRow(sec, count, checked, onchange) {
  return `
    <label style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;border:1px solid var(--color-border);border-radius:var(--radius-md);margin-bottom:6px;cursor:pointer;">
      <input type="checkbox" value="${sec.key}" ${checked ? "checked" : ""} onchange="${onchange}" style="margin-top:3px;accent-color:var(--color-accent);">
      <span>
        <strong>${escapeHTML(sec.label)}</strong>
        ${sec.scope === "global" ? `<small style="margin-left:6px;padding:1px 6px;border-radius:999px;background:var(--color-accent-soft);color:var(--color-accent);font-weight:700;">Compartido</small>` : ""}
        <br><small style="color:var(--color-text-muted);">${escapeHTML(sec.desc)} · ${escapeHTML(count)}</small>
      </span>
    </label>`;
}

function _bkChecked(containerId) {
  return [...document.querySelectorAll(`#${containerId} input[type=checkbox]:checked`)].map((i) => i.value);
}

/** Descarga un archivo; la URL se libera con retraso (liberarla al instante cancela la descarga en algunos navegadores). */
function _bkDescargar(nombre, contenido, tipo = "application/json") {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

// ==========================================
// NORMALIZACIÓN DE DATOS IMPORTADOS
// Deja cada registro con los tipos que la app espera. Un expositor sin
// "negocio", o con pagado:"Sí", rompía búsquedas, filtros y tarjetas.
// ==========================================
const _bkT = (v) => (v === undefined || v === null ? "" : String(v).trim());
const _bkNum = (v, d = 0) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  if (_bkT(v) === "") return d;
  const x = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(x) ? x : d;
};
const _bkBool = (v) => v === true ||
  ["true", "1", "si", "sí", "x", "✔", "✓", "yes", "pagado", "listo", "comprado"].includes(_bkT(v).toLowerCase());
const _bkDate = (v) => {
  const s = _bkT(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);   // DD/MM/AAAA (México)
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
};
const _bkTime = (v) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(_bkT(v));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};
const _bkHex = (v) => (/^#[0-9a-f]{6}$/i.test(_bkT(v)) ? _bkT(v) : "#0d9488");
const _bkId = (v, prefix) => _bkT(v) || _bkUid(prefix);
const _bkList = (d, fn) => (Array.isArray(d) ? d.filter(_bkIsObj).map(fn) : d);
const _bkOptNum = (v) => (_bkT(v) === "" ? "" : Math.max(0, _bkNum(v)));
const _BK_STATUSES = ["pendiente", "parcial", "lista", "publicada"];

const _BK_NORM = {
  ficha: (f) => ({
    ...f, fecha: _bkDate(f.fecha), objetivo: _bkT(f.objetivo), lideres: _bkT(f.lideres),
    publico: _bkT(f.publico), lugar: _bkT(f.lugar),
    asistentes: _bkOptNum(f.asistentes), staff: _bkOptNum(f.staff), presupuestoBase: _bkOptNum(f.presupuestoBase),
    multiDia: _bkBool(f.multiDia),
    dias: Array.isArray(f.dias) ? f.dias.filter(_bkIsObj).map((d) => ({ ...d, id: _bkId(d.id, "dia"), nombre: _bkT(d.nombre), fecha: _bkDate(d.fecha) })) : [],
  }),
  staff: (d) => ({
    roles: _bkList(d.roles || [], (r) => ({ ...r, id: _bkId(r.id, "rol"), nombre: _bkT(r.nombre) || "Rol", color: _bkHex(r.color) })),
    responsables: _bkList(d.responsables || [], (p) => ({
      ...p, id: _bkId(p.id, "resp"), nombre: _bkT(p.nombre) || "Sin nombre",
      rolId: _bkT(p.rolId), tel: _bkT(p.tel), email: _bkT(p.email),
    })),
  }),
  categorias: (list) => _bkList(list, (c) => ({
    ...c, id: _bkId(c.id, "cat"), nombre: _bkT(c.nombre) || "Sin nombre",
    emoji: _bkT(c.emoji) || "📦", color: _bkHex(c.color), descripcion: _bkT(c.descripcion),
  })),
  caracteristicas: (list) => _bkList(list, (c) => ({
    ...c, id: _bkId(c.id, "car"), nombre: _bkT(c.nombre) || "Sin nombre",
    emoji: _bkT(c.emoji) || "🏷️", color: _bkHex(c.color), descripcion: _bkT(c.descripcion),
  })),
  expositores: (list) => _bkList(list, (e) => {
    const rawMesas = e.mesasCantidad === "otro" ? e.mesasCantidadOtro : e.mesasCantidad;
    const mesas = Math.max(1, Math.floor(_bkNum(rawMesas, 1)));
    const out = {
      ...e,
      id: _bkId(e.id, "exp"),
      nombre: _bkT(e.nombre) || _bkT(e.negocio) || "Sin nombre",
      negocio: _bkT(e.negocio) || _bkT(e.nombre) || "Sin nombre",
      categoria: _bkT(e.categoria), caracteristicas: _bkCaracteristicasDe(e),
      tel: _bkT(e.tel), email: _bkT(e.email),
      notas: _bkT(e.notas), foto: _bkT(e.foto), notaCredito: _bkT(e.notaCredito),
      costo: Math.max(0, _bkNum(e.costo, _bkNum(e.costoBase, 0))),
      adelanto: Math.max(0, _bkNum(e.adelanto)),
      descuento: Math.max(0, _bkNum(e.descuento)),
      pagado: _bkBool(e.pagado), banned: _bkBool(e.banned),
      fechaLimitePago: _bkDate(e.fechaLimitePago),
      mesasCantidad: mesas > 5 ? "otro" : String(mesas),
      mesasCantidadOtro: mesas > 5 ? String(mesas) : "",
      publicationStatus: _BK_STATUSES.includes(_bkT(e.publicationStatus)) ? _bkT(e.publicationStatus) : "pendiente",
      checklist: Array.isArray(e.checklist) && e.checklist.length ? e.checklist : defaultChecklistItems(),
      historial: Array.isArray(e.historial) ? e.historial : [],
      mesaTipo: _bkT(e.mesaTipo) === "media" ? "media" : "completa",
      color: /^#[0-9a-f]{6}$/i.test(_bkT(e.color)) ? _bkT(e.color) : "",
      diasParticipacion: Array.isArray(e.diasParticipacion) ? [...new Set(e.diasParticipacion.map(_bkT).filter(Boolean))] : [],
    };
    delete out.subcategoria;
    if (e.costoBase !== undefined && _bkT(e.costoBase) !== "") out.costoBase = Math.max(0, _bkNum(e.costoBase));
    return out;
  }),
  invitados: (list) => _bkList(list, (i) => ({
    ...i, id: _bkId(i.id, "inv"), nombre: _bkT(i.nombre) || "Sin nombre",
    expositorId: _bkT(i.expositorId), notas: _bkT(i.notas),
    confirmado: _bkBool(i.confirmado), asistio: _bkBool(i.asistio),
  })),
  tareas: (list) => _bkList(list, (t) => ({
    ...t, id: _bkId(t.id, "tarea"),
    fase: _bkT(t.fase).toLowerCase().startsWith("post") ? "post" : "previo",
    actividad: _bkT(t.actividad), descripcion: _bkT(t.descripcion),
    fecha: _bkDate(t.fecha), avance: _bkT(t.avance), hecho: _bkBool(t.hecho),
  })),
  compras: (list) => _bkList(list, (c) => {
    const cantidad = Math.max(0, _bkNum(c.cantidad, 1));
    const total = Math.max(0, _bkT(c.costoTotal) !== "" ? _bkNum(c.costoTotal) : cantidad * _bkNum(c.costoUnit));
    return {
      ...c, id: _bkId(c.id, "compra"), articulo: _bkT(c.articulo), descripcion: _bkT(c.descripcion),
      fecha: _bkDate(c.fecha), cantidad, costoTotal: total,
      costoUnit: cantidad > 0 ? total / cantidad : 0,
      ivaIncluido: c.ivaIncluido === undefined ? true : _bkBool(c.ivaIncluido),
      comprado: _bkBool(c.comprado), presupuestoId: "",   // el vínculo con Costos no viaja entre bazares
    };
  }),
  minutoAMinuto: (list) => _bkList(list, (r) => ({
    ...r, id: _bkId(r.id, "minute"), time: _bkTime(r.time), horaFin: _bkTime(r.horaFin),
    activity: _bkT(r.activity), lugar: _bkT(r.lugar), area: _bkT(r.area), notes: _bkT(r.notes), dia: _bkT(r.dia),
  })),
  plantillas: (list) => _bkList(list, (p) => ({
    ...p, id: _bkId(p.id, "plt"),
    nombre: _bkT(p.nombre) || _bkT(p.negocio) || "Sin nombre",
    negocio: _bkT(p.negocio) || _bkT(p.nombre) || "Sin nombre",
    categoria: _bkT(p.categoria), caracteristicas: _bkCaracteristicasDe(p),
    tel: _bkT(p.tel), email: _bkT(p.email), foto: _bkT(p.foto), notas: _bkT(p.notas),
  })).map(({ subcategoria, ...resto }) => resto),
};

function backupNormalizar(key, data) {
  const fn = _BK_NORM[key];
  if (!fn || data === undefined || data === null) return data;
  try { return fn(_bkClone(data)); } catch (err) { console.warn("Normalización omitida:", key, err); return data; }
}

// ==========================================
// EXPORTAR
// ==========================================
function openBackupExport() {
  document.getElementById("backup-menu")?.classList.remove("open");
  const select = document.getElementById("be-bazar");
  if (!select) return;
  select.innerHTML = getBazaarsNewestFirst().map((bz) =>
    `<option value="${bz.id}" ${bz.id === AppState.currentBazaarId ? "selected" : ""}>${escapeHTML(bz.name)}</option>`
  ).join("");
  renderBackupExportSections();
  openModal("modal-backup-export");
}

function renderBackupExportSections() {
  const bz = AppState.bazaars[document.getElementById("be-bazar")?.value];
  const container = document.getElementById("be-sections");
  if (!bz || !container) return;
  const datos = backupExtraerSecciones(bz);
  container.innerHTML = BACKUP_SECTIONS.map((sec) => {
    const data = sec.scope === "global" ? _bkGlobalData(sec.key) : datos[sec.key];
    return _bkSectionRow(sec, sec.count(data), sec.key !== "plantillas", "backupExportRefresh()");
  }).join("");
  backupExportRefresh();
}

function backupExportSeleccionar(modo) {
  document.querySelectorAll("#be-sections input[type=checkbox]").forEach((input) => {
    input.checked = modo === "completo" ? input.value !== "plantillas" : false;
  });
  backupExportRefresh();
}

function backupExportRefresh() {
  const keys = _bkChecked("be-sections");
  const bazarKeys = BACKUP_SECTIONS.filter((s) => s.scope === "bazar").map((s) => s.key);
  const complete = bazarKeys.every((k) => keys.includes(k));
  const el = document.getElementById("be-resumen");
  if (el) {
    el.textContent = keys.length === 0
      ? "Selecciona al menos una sección."
      : `${keys.length} sección(es) seleccionada(s)${complete ? " · bazar completo" : " · exportación parcial"}`;
  }
}

function ejecutarExportacionBazar() {
  const bz = AppState.bazaars[document.getElementById("be-bazar")?.value];
  if (!bz) return;
  const keys = _bkChecked("be-sections");
  if (keys.length === 0) {
    showToast("Selecciona al menos una sección", "error");
    return;
  }
  const all = backupExtraerSecciones(bz);
  const datos = {};
  keys.forEach((key) => {
    const sec = BACKUP_SECTIONS.find((item) => item.key === key);
    datos[key] = sec.scope === "global" ? _bkGlobalData(key) : all[key];
  });
  const complete = BACKUP_SECTIONS.filter((s) => s.scope === "bazar").every((s) => keys.includes(s.key));
  const paquete = {
    app: "BAZARIX", tipo: "bazar", version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    origen: { id: bz.id, name: bz.name },
    secciones: keys,
    datos,
  };
  _bkDescargar(
    `bazarix_${bz.name.replace(/[^a-z0-9]+/gi, "_")}_${complete ? "completo" : "parcial"}_${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(paquete, null, 2)
  );
  closeModal("modal-backup-export");
  showToast(complete ? "✅ Bazar completo exportado" : `✅ ${keys.length} sección(es) exportada(s)`);
}

// ==========================================
// IMPORTAR — lectura del archivo
// ==========================================
let _bi = null; // { source, srcId }

/** Convierte cualquier archivo válido a { kind, bazaars:[{id,name,datos}], globales, fullState }. */
function backupNormalizarArchivo(parsed) {
  if (parsed && parsed.tipo === "bazar" && _bkIsObj(parsed.datos)) {
    const datos = {};
    BACKUP_SECTIONS.filter((s) => s.scope === "bazar").forEach((s) => {
      if (parsed.datos[s.key] !== undefined) datos[s.key] = parsed.datos[s.key];
    });
    const cat = _bkSepararCatalogos(parsed.datos.categorias, parsed.datos.caracteristicas);
    return {
      kind: "bazar", exportedAt: parsed.exportedAt, fullState: null,
      bazaars: [{ id: parsed.origen?.id || "origen", name: parsed.origen?.name || datos.general?.name || "Bazar importado", datos }],
      globales: { categorias: cat.categorias, caracteristicas: cat.caracteristicas, plantillas: parsed.datos.plantillas },
    };
  }
  const st = parsed?.data && BACKUP_APP_NAMES.includes(parsed.app) ? parsed.data : parsed;
  if (_bkIsObj(st) && _bkIsObj(st.bazaars)) {
    const clone = migrateState(_bkClone(st));
    return {
      kind: "full", exportedAt: parsed.exportedAt, fullState: st,
      bazaars: Object.entries(clone.bazaars).map(([key, bz]) => ({ id: bz.id || key, name: bz.name || key, datos: backupExtraerSecciones(bz) })),
      globales: { categorias: clone.categorias, caracteristicas: clone.caracteristicas, plantillas: clone.expositorPlantillas },
    };
  }
  return null;
}

function backupPrepararImportacion(parsed) {
  if (parsed && Number(parsed.version) > BACKUP_VERSION) {
    showToast("⚠️ Este archivo viene de una versión más nueva; algunos datos podrían no importarse", "error");
  }
  const source = backupNormalizarArchivo(parsed);
  if (!source || source.bazaars.length === 0) throw new Error("Estructura de respaldo inválida");
  _bi = { source, srcId: source.bazaars[0].id };

  const active = getActiveBazaar();
  const destSelect = document.getElementById("bi-dest");
  destSelect.innerHTML =
    getBazaarsNewestFirst().map((bz) =>
      `<option value="${bz.id}" ${bz.id === active?.id ? "selected" : ""}>${bz.id === active?.id ? "Bazar activo — " : ""}${escapeHTML(bz.name)}</option>`).join("") +
    `<option value="__new__">➕ Crear un bazar nuevo con estos datos</option>`;

  const srcSelect = document.getElementById("bi-source");
  srcSelect.innerHTML = source.bazaars.map((bz) => `<option value="${escapeHTML(bz.id)}">${escapeHTML(bz.name)}</option>`).join("");
  document.getElementById("bi-source-wrap").style.display = source.bazaars.length > 1 ? "block" : "none";

  const date = source.exportedAt ? new Date(source.exportedAt) : null;
  document.getElementById("bi-file-info").textContent =
    `${source.kind === "full" ? "Respaldo completo de la app" : "Exportación de bazar"}` +
    `${date && !Number.isNaN(date.getTime()) ? " · " + date.toLocaleDateString("es-MX") : ""}` +
    ` · ${source.bazaars.length} bazar(es)`;

  document.getElementById("bi-full-btn").style.display = source.kind === "full" ? "inline-flex" : "none";
  document.querySelector('input[name="bi-modo"][value="combinar"]').checked = true;
  document.getElementById("bi-new-name").value = `${source.bazaars[0].name} (importado)`;

  backupImportRenderSections();
  openModal("modal-backup-import");
}

function backupImportSourceChanged() {
  _bi.srcId = document.getElementById("bi-source").value;
  const bz = _bi.source.bazaars.find((b) => b.id === _bi.srcId);
  document.getElementById("bi-new-name").value = `${bz.name} (importado)`;
  backupImportRenderSections();
}

function _bkAvailable() {
  const bz = _bi.source.bazaars.find((b) => b.id === _bi.srcId);
  return BACKUP_SECTIONS.map((sec) => {
    const data = sec.scope === "global" ? _bi.source.globales[sec.key] : bz?.datos[sec.key];
    return backupSectionValid(sec.key, data) ? { sec, data } : null;
  }).filter(Boolean);
}

function backupImportRenderSections() {
  const items = _bkAvailable();
  const container = document.getElementById("bi-sections");
  container.innerHTML = items.length
    ? items.map(({ sec, data }) => _bkSectionRow(sec, sec.count(data), sec.key !== "plantillas", "backupImportRefresh()")).join("")
    : `<p style="color:var(--color-text-muted);font-size:var(--fs-sm);">Este archivo no trae secciones que se puedan importar.</p>`;
  backupImportRefresh();
}

function backupImportSeleccionar(modo) {
  document.querySelectorAll("#bi-sections input[type=checkbox]").forEach((input) => {
    input.checked = modo === "todo" ? input.value !== "plantillas" : false;
  });
  backupImportRefresh();
}

function _bkModo() {
  return document.querySelector('input[name="bi-modo"]:checked')?.value || "combinar";
}

/** Muestra/oculta campos según el destino y calcula avisos en vivo. */
function backupImportRefresh() {
  if (!_bi) return;
  const isNew = document.getElementById("bi-dest").value === "__new__";
  document.getElementById("bi-new-name-wrap").style.display = isNew ? "block" : "none";
  document.getElementById("bi-modo-wrap").style.display = isNew ? "none" : "block";

  const keys = _bkChecked("bi-sections");
  const modo = isNew ? "reemplazar" : _bkModo();
  const warnings = [];
  const bz = _bi.source.bazaars.find((b) => b.id === _bi.srcId);

  if (!isNew && modo === "reemplazar" && keys.length) {
    const names = keys.map((k) => BACKUP_SECTIONS.find((s) => s.key === k).label);
    warnings.push(`⚠️ Se reemplazará por completo: ${names.join(", ")}. Lo que tengas ahí ahora se perderá.`);
  }
  if (keys.includes("categorias") && modo === "reemplazar" && !isNew) {
    warnings.push("⚠️ Las categorías son compartidas: reemplazarlas afecta a todos tus bazares.");
  }
  if (keys.includes("expositores") && !keys.includes("categorias")) {
    const missing = (bz?.datos.expositores || []).filter((e) =>
      e.categoria && !AppState.categorias.some((c) => c.id === e.categoria)
    ).length;
    if (missing > 0) warnings.push(`ℹ️ ${missing} expositor(es) usan categorías que no tienes; se verán como "Sin Categoría". Marca "Categorías" para traerlas.`);
  }
  if (keys.includes("expositores") && !keys.includes("caracteristicas")) {
    const sinCatalogo = (bz?.datos.expositores || []).filter((e) =>
      _bkCaracteristicasDe(e).some((id) => !(AppState.caracteristicas || []).some((c) => c.id === id))
    ).length;
    if (sinCatalogo > 0) warnings.push(`ℹ️ ${sinCatalogo} expositor(es) tienen características que no existen en tu catálogo y no se verán. Marca "Características" para traerlas.`);
  }
  if (keys.includes("caracteristicas") && modo === "reemplazar" && !isNew) {
    warnings.push("⚠️ Las características son compartidas: reemplazarlas afecta a todos tus bazares.");
  }
  if (!keys.includes("ficha")) {
    const destBz = isNew ? null : AppState.bazaars[document.getElementById("bi-dest").value];
    const conocidos = new Set((destBz?.evento?.dias || []).map((d) => d.id));
    const refs = new Set();
    if (keys.includes("expositores")) (bz?.datos.expositores || []).forEach((e) => (e.diasParticipacion || []).forEach((id) => refs.add(id)));
    if (keys.includes("minutoAMinuto")) (bz?.datos.minutoAMinuto || []).forEach((r) => { if (r.dia) refs.add(r.dia); });
    if (keys.includes("plano")) (bz?.datos.plano?.floors || []).forEach((f) => { if (f.dia) refs.add(f.dia); });
    if ([...refs].some((id) => !conocidos.has(id))) {
      warnings.push("ℹ️ Estos datos usan días del evento que el bazar destino no tiene. Marca «Ficha del evento» para traer la lista de días; sin ella se tomarán como «todos los días» o sin día.");
    }
  }
  if (keys.includes("plano") && !keys.includes("expositores")) {
    warnings.push("ℹ️ Las mesas del plano quedarán sin expositor asignado si esos expositores no existen en el destino.");
  }
  if (keys.includes("general") && modo === "combinar" && !isNew) {
    warnings.push("ℹ️ En modo Combinar, Datos generales solo agrega el logo y el color si aún no tienes uno.");
  }
  const staffDisponible = _bkAvailable().some(({ sec }) => sec.key === "staff");
  if (staffDisponible && !keys.includes("staff") && keys.some((k) => BACKUP_NEEDS_STAFF.includes(k))) {
    warnings.push('ℹ️ Tareas, compras, agenda y expositores apuntan a personas del Staff. Marca "Staff" para que conserven su responsable.');
  }
  document.getElementById("bi-warnings").innerHTML = warnings.map((w) =>
    `<p style="margin:4px 0;font-size:var(--fs-xs);color:var(--color-text-muted);">${escapeHTML(w)}</p>`).join("");
}

// ==========================================
// IMPORTAR — aplicar secciones
// ==========================================
function _bkMergeById(actual, nuevos) {
  const map = new Map((actual || []).map((x) => [x.id, x]));
  (nuevos || []).forEach((x) => {
    const item = _bkClone(x);
    if (!item.id) item.id = _bkUid("imp");
    map.set(item.id, item);
  });
  return [...map.values()];
}

function _bkWithIds(list) {
  return _bkClone(list || []).map((x) => (x.id ? x : { ...x, id: _bkUid("imp") }));
}

function _bkApplyPlano(dest, incoming, modo, sameBazaar) {
  const src = _bkClone(incoming.floors || []);
  if (modo === "reemplazar") {
    const idMap = {};
    src.forEach((floor, index) => {
      const newId = sameBazaar ? floor.id : `${dest.id}-floor-${index + 1}`;
      idMap[floor.id] = newId;
      floor.id = newId;
    });
    dest.floors = src;
    dest.activeFloorId = idMap[incoming.activeFloorId] || src[0]?.id;
    return;
  }
  dest.floors = dest.floors || [];
  const usedTableIds = new Set(dest.floors.flatMap((f) => (f.tables || []).map((t) => t.id)));
  src.forEach((floor, index) => {
    const existing = dest.floors.find((f) => f.id === floor.id);
    if (existing) {
      existing.tables   = _bkMergeById(existing.tables, floor.tables);
      existing.elements = _bkMergeById(existing.elements, floor.elements);
      existing.zones    = _bkMergeById(existing.zones, floor.zones);
      if (floor.bgImage) {
        ["bgImage", "backgroundOpacity", "bgScale", "bgScaleX", "bgScaleY", "bgRotation", "bgX", "bgY"].forEach((k) => { existing[k] = floor[k]; });
      }
      return;
    }
    // Piso nuevo: id propio, nombre sin repetir e ids de mesa únicos (se buscan en todos los pisos).
    floor.id = `${dest.id}-floor-${Date.now()}-${index}`;
    if (dest.floors.some((f) => f.name === floor.name)) floor.name = `${floor.name} (importado)`;
    (floor.tables || []).forEach((table, i) => {
      if (usedTableIds.has(table.id)) table.id = `t-${Date.now()}-${index}-${i}`;
      usedTableIds.add(table.id);
    });
    dest.floors.push(floor);
  });
}

function _bkApplySection(dest, key, data, modo, sameBazaar) {
  switch (key) {
    case "general":
      if (modo === "reemplazar") {
        if (data.name) dest.name = data.name;
        dest.logoImage = data.logoImage || null;
        dest.color = /^#[0-9a-f]{6}$/i.test(String(data.color || "")) ? data.color : "";
        if (data.mapConfig) dest.mapConfig = _bkClone(data.mapConfig);
      } else {
        if (data.logoImage && !dest.logoImage) dest.logoImage = data.logoImage;
        if (/^#[0-9a-f]{6}$/i.test(String(data.color || "")) && !dest.color) dest.color = data.color;
      }
      break;
    case "staff":
      if (modo === "reemplazar") {
        dest.roles = _bkWithIds(data.roles);
        dest.responsables = _bkWithIds(data.responsables);
      } else {
        dest.roles = _bkMergeById(dest.roles, data.roles);
        dest.responsables = _bkMergeById(dest.responsables, data.responsables);
      }
      break;
    case "expositores":
      dest.expositores = modo === "reemplazar" ? _bkWithIds(data) : _bkMergeById(dest.expositores, data);
      break;
    case "ficha": {
      const incoming = { ...emptyEvento(), ..._bkClone(data) };
      if (modo === "reemplazar") dest.evento = incoming;
      else {
        dest.evento = { ...emptyEvento(), ...(dest.evento || {}) };
        Object.keys(incoming).forEach((k) => {
          if (["multiDia", "dias"].includes(k) && !(incoming.multiDia && (incoming.dias || []).length > 1)) return;
          if (incoming[k] !== "" && incoming[k] !== null) dest.evento[k] = incoming[k];
        });
      }
      break;
    }
    case "tareas":
      dest.tareas = modo === "reemplazar" ? _bkWithIds(data) : _bkMergeById(dest.tareas, data);
      break;
    case "compras":
      dest.compras = modo === "reemplazar" ? _bkWithIds(data) : _bkMergeById(dest.compras, data);
      break;
    case "invitados":
      dest.invitados = modo === "reemplazar" ? _bkWithIds(data) : _bkMergeById(dest.invitados, data);
      break;
    case "minutoAMinuto":
      dest.minuteByMinute = modo === "reemplazar" ? _bkWithIds(data) : _bkMergeById(dest.minuteByMinute, data);
      break;
    case "costos": {
      const incoming = _bkClone(data);
      dest.costsConfig = modo === "reemplazar"
        ? { ...emptyCostsConfig(), ...incoming, extraCosts: _bkWithIds(incoming.extraCosts || []) }
        : { ...dest.costsConfig, ...incoming, extraCosts: _bkMergeById(dest.costsConfig?.extraCosts, incoming.extraCosts) };
      break;
    }
    case "plano":
      _bkApplyPlano(dest, data, modo, sameBazaar);
      break;
  }
}

/** Quita referencias rotas (mesas o invitados que apuntan a un expositor que no existe). */
function _bkSanear(dest) {
  const ids = new Set(dest.expositores.map((e) => e.id));
  let mesas = 0, invitados = 0;
  dest.floors.forEach((floor) => (floor.tables || []).forEach((table) => {
    if (table.exhibitorId && !ids.has(table.exhibitorId)) { table.exhibitorId = ""; mesas += 1; }
    if (table.exhibitorId2 && !ids.has(table.exhibitorId2)) { table.exhibitorId2 = ""; mesas += 1; }
  }));
  dest.invitados.forEach((inv) => {
    if (inv.expositorId && !ids.has(inv.expositorId)) { inv.expositorId = ""; invitados += 1; }
  });
  return { mesas, invitados };
}

async function ejecutarImportacion() {
  if (!_bi) return;
  const keys = _bkChecked("bi-sections");
  if (keys.length === 0) {
    showToast("Selecciona al menos una sección", "error");
    return;
  }
  const destValue = document.getElementById("bi-dest").value;
  const isNew = destValue === "__new__";
  const modo = isNew ? "reemplazar" : _bkModo();
  const srcBazaar = _bi.source.bazaars.find((b) => b.id === _bi.srcId);

  if (!isNew && modo === "reemplazar") {
    const names = keys.map((k) => BACKUP_SECTIONS.find((s) => s.key === k).label).join(", ");
    if (!await appConfirm(`Se reemplazará por completo: ${names}.\n\nLo que tengas actualmente en esas secciones se perderá. ¿Continuar?`, "Confirmar reemplazo", "Reemplazar")) return;
  }

  // Todo se aplica sobre una COPIA; AppState actual queda intacto hasta que el guardado salga bien.
  const previous = AppState;
  try {
    const next = _bkClone(AppState);
    let dest;
    let newName = "";
    if (isNew) {
      const id = "bazaar-" + Date.now();
      newName = document.getElementById("bi-new-name").value.trim() || `${srcBazaar.name} (importado)`;
      dest = {
        id, name: newName, bgImage: null, logoImage: null, mapConfig: defaultMapConfig(),
        expositores: [], tables: [], costsConfig: emptyCostsConfig(),
        invitados: [], minuteByMinute: [], customMetrics: [],
      };
      next.bazaars[id] = dest;
    } else {
      dest = next.bazaars[destValue];
    }
    if (!dest) throw new Error("Destino no encontrado");
    const sameBazaar = srcBazaar.id === dest.id;

    keys.forEach((key) => {
      const sec = BACKUP_SECTIONS.find((s) => s.key === key);
      if (sec.scope === "global") {
        const data = backupNormalizar(key, _bi.source.globales[key]);
        const target = _BK_GLOBAL_TARGET[key];
        next[target] = modo === "reemplazar" ? _bkWithIds(data) : _bkMergeById(next[target], data);
      } else {
        _bkApplySection(dest, key, backupNormalizar(key, srcBazaar.datos[key]), modo, sameBazaar);
      }
    });

    if (isNew) dest.name = newName;      // el nombre que escribió el usuario manda sobre el del archivo
    migrateState(next);                  // completa campos y valida el conjunto
    const fixed = _bkSanear(dest);
    if (isNew) next.currentBazaarId = dest.id;
    else if (destValue !== next.currentBazaarId) next.currentBazaarId = destValue;

    AppState = next;
    if (!saveState()) {
      AppState = previous;               // reversa: no se pudo guardar, nada cambió
      renderAll();
      syncCanvasWithState();
      showToast("❌ No se importó: no hay espacio para guardar. Exporta un respaldo y libera espacio (quita logos o imágenes pesadas).", "error");
      return;
    }
    renderAll();
    syncCanvasWithState();
    closeModal("modal-backup-import");
    _bi = null;

    const extra = fixed.mesas || fixed.invitados
      ? ` (${fixed.mesas} mesa(s) y ${fixed.invitados} invitado(s) quedaron sin expositor)` : "";
    showToast(`✅ Importado en "${dest.name}" — ${modo === "reemplazar" ? "Reemplazar" : "Combinar"}${extra}`);
  } catch (err) {
    console.error(err);
    AppState = previous;
    showToast("❌ No se pudo importar: el archivo tiene datos inválidos", "error");
  }
}

/** Comportamiento anterior: sustituye TODA la app con un respaldo completo. */
async function reemplazarTodaLaApp() {
  if (!_bi || !_bi.source.fullState) return;
  if (!await appConfirm("Esto reemplaza TODA la app (todos los bazares, categorías y plantillas) con el contenido del archivo. ¿Continuar?", "Reemplazar todos los datos", "Reemplazar")) return;
  const previous = AppState;
  try {
    AppState = migrateState(_bkClone(_bi.source.fullState));
    if (!saveState()) {
      AppState = previous;
      renderAll();
      syncCanvasWithState();
      showToast("❌ No se importó: no hay espacio para guardar. Tus datos actuales siguen intactos.", "error");
      return;
    }
    renderAll();
    syncCanvasWithState();
    closeModal("modal-backup-import");
    _bi = null;
    showToast("✅ Datos importados correctamente");
  } catch (err) {
    console.error(err);
    AppState = previous;
    showToast("❌ Archivo JSON inválido", "error");
  }
}

// ==========================================
// GUARDADO SEGURO E IMÁGENES LIGERAS
// ==========================================
(function () {
  // Avisa al cerrar la pestaña si el último guardado falló (localStorage lleno).
  const saveStateBase = saveState;
  window.saveState = function () {
    const ok = saveStateBase();
    window.__bazarixUnsaved = !ok;
    return ok;
  };
  window.addEventListener("beforeunload", (e) => {
    if (window.__bazarixUnsaved) { e.preventDefault(); e.returnValue = ""; }
  });

  // Reduce imágenes antes de guardarlas: el logo y el plano de fondo llenaban los ~5 MB de localStorage.
  function comprimirImagen(file, maxSide, mime, quality) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          if (!img.width || !img.height) { resolve({ dataUrl: reader.result, ratio: 1 }); return; }
          const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * ratio));
          canvas.height = Math.max(1, Math.round(img.height * ratio));
          const ctx = canvas.getContext("2d");
          if (mime === "image/jpeg") { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ dataUrl: canvas.toDataURL(mime, quality), ratio });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  window.handleLogoUpload = async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { dataUrl } = await comprimirImagen(file, 400, "image/webp", 0.85);
      document.getElementById("logo-base64").value = dataUrl;
      const preview = document.getElementById("logo-preview-box");
      if (preview) preview.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
    } catch {
      showToast("No se pudo leer la imagen", "error");
    }
  };

  window.handleFloorPlanUpload = async function (e) {
    const input = e.target;
    const file = input.files[0];
    if (!file) return;
    try {
      const { dataUrl, ratio } = await comprimirImagen(file, 2000, "image/jpeg", 0.85);
      const floor = getActiveFloor(getActiveBazaar());
      if (!floor) return;
      const scale = 1 / ratio;   // si se redujo la imagen, se amplía igual para conservar su tamaño visual
      floor.bgImage = dataUrl;
      floor.bgScale = scale; floor.bgScaleX = scale; floor.bgScaleY = scale;
      floor.bgRotation = 0; floor.bgX = 0; floor.bgY = 0;
      if (saveState()) showToast("✅ Imagen de fondo cargada");
      bazaarCanvas.loadBgImage();
      updateMapaBazaarLabel();
    } catch {
      showToast("No se pudo leer la imagen", "error");
    } finally {
      input.value = "";   // permite volver a elegir el mismo archivo
    }
  };
})();
