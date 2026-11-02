/**
 * BAZARIX — mesas.js
 * Lógica de MESAS, sin pantalla: qué expositor ocupa qué mesa, reglas de disponibilidad,
 * límite de mesas por día, mesas compartidas (media mesa) y los campos derivados del expositor.
 *
 * FUENTE DE VERDAD: la mesa del plano (table.exhibitorId / exhibitorId2 / shared).
 * Del expositor solo se DERIVAN tableIds, tableId y ubicacion, y siempre con
 * syncAllTableAssignments(): nunca se editan a mano (antes se sincronizaban uno por uno y se desfasaban).
 *
 * Reglas:
 *  - Mesa completa: un solo expositor (de tipo "completa").
 *  - Media mesa: la mesa queda "compartida" (shared) con hasta 2 expositores de tipo "media".
 *  - Cada expositor puede ocupar tantas mesas como solicitó; en eventos de varios días el límite es POR DÍA.
 *
 * Dependencias: state.js (helpers tableSlotOf, tableOwnerIds…), evento_ficha.js (días), utils.js, dialogs.js
 * Se carga ANTES de modales.js.
 */

function allTablesOf(bz) {
  return (bz?.floors || []).flatMap((floor) => floor.tables || []);
}

/** Ids de las mesas que ocupa el expositor (se leen del plano, no de copias guardadas). */
function getExpositorTableIds(exp, bz = getActiveBazaar()) {
  if (!exp || !bz) return [];
  return allTablesOf(bz).filter((table) => tableSlotOf(table, exp.id) > 0).map((table) => table.id);
}

/** Cuántas mesas pidió (la media mesa cuenta como una). */
function getExpositorRequestedTableCount(exp) {
  if (!exp) return 1;
  if (exp.mesaTipo === "media") return 1;   // la media mesa ocupa una sola mitad
  const raw = exp.mesasCantidad === "otro" ? exp.mesasCantidadOtro : exp.mesasCantidad;
  return Math.max(1, Math.floor(Number(raw) || 1));
}

/** Ids de `ids` que están en planos del mismo día que `tableId`. */
function _mesasDelMismoDia(bz, ids, tableId) {
  const dia = tableDiaId({ id: tableId }, bz);
  return ids.filter((id) => tableDiaId({ id }, bz) === dia);
}

/** { diaId: cantidad } de mesas seleccionadas (en eventos de un día hay un solo grupo, ""). */
function mesasPorDia(bz, tableIds) {
  const por = {};
  tableIds.forEach((tid) => { const k = tableDiaId({ id: tid }, bz); por[k] = (por[k] || 0) + 1; });
  return por;
}

/**
 * ¿Qué pasa si este expositor (id y tipo) toma esta mesa?
 *  mine      → ya es suya.
 *  others    → ids de los demás dueños.
 *  available → la puede tomar sin conflicto (mesa libre, o con una mitad libre si pide media mesa).
 *  blocked   → no se puede (media mesa sin mitad libre, o mesa completa sobre una mesa compartida).
 * Una mesa completa ocupada por OTRO expositor no está bloqueada: se puede reasignar con confirmación.
 */
function tableAvailability(table, expId, tipo) {
  const mine = Boolean(expId) && tableSlotOf(table, expId) > 0;
  const others = tableOwnerIds(table).filter((oid) => oid !== expId);
  const media = tipo === "media";
  const available = mine || (media ? (table.shared ? others.length < 2 : others.length === 0) : others.length === 0);
  const blocked = !mine && (media ? (table.shared ? others.length >= 2 : others.length > 0) : (table.shared && others.length > 0));
  return { mine, others, available, blocked };
}

/** Texto de ubicación: "A-01, A-02" o, en eventos de varios días, "Día 1: A-01 · Día 2: B-03". */
function getExpositorLocation(exp, bz = getActiveBazaar()) {
  if (!exp || !bz) return "Por asignar";
  const ids = getExpositorTableIds(exp, bz);
  const entries = (bz.floors || []).flatMap((floor) => (floor.tables || [])
    .filter((table) => ids.includes(table.id)).map((table) => ({ name: table.name, dia: floorDiaId(floor, bz) })));
  if (!entries.length) return exp.ubicacionAnterior || "Por asignar";
  if (!bazarEsMultiDia(bz)) return entries.map((entry) => entry.name).join(", ");
  const grupos = new Map();
  entries.forEach(({ name, dia }) => { if (!grupos.has(dia)) grupos.set(dia, []); grupos.get(dia).push(name); });
  return [...grupos.entries()].map(([dia, nombres]) => {
    const i = bz.evento.dias.findIndex((d) => d.id === dia);
    return `${i >= 0 ? `${getDiaLabel(bz.evento.dias[i], i)}: ` : ""}${nombres.join(", ")}`;
  }).join(" · ");
}

// ==========================================
// CAMPOS DERIVADOS DEL EXPOSITOR
// ==========================================
function syncExpositorTableAssignment(bz, exp) {
  const linked = allTablesOf(bz).filter((table) => tableSlotOf(table, exp.id) > 0);
  exp.tableIds = linked.map((table) => table.id);
  exp.tableId = exp.tableIds[0] || "";
  exp.ubicacion = linked.map((table) => table.name).join(", ");
}

/** Recalcula tableIds/tableId/ubicacion de TODOS los expositores. Llamar al terminar cualquier cambio de mesas. */
function syncAllTableAssignments(bz) {
  (bz?.expositores || []).forEach((exp) => syncExpositorTableAssignment(bz, exp));
}

// ==========================================
// ASIGNAR / QUITAR
// ==========================================
/** Asignación desde el formulario del expositor: deja al expositor exactamente en `tableIds`. */
function applyExpositorTableAssignments(bz, exp, tableIds) {
  const entries = (bz.floors || []).flatMap((floor) => (floor.tables || []).map((table) => ({ floor, table })));
  const desiredIds = new Set(tableIds);
  if (entries.filter(({ table }) => desiredIds.has(table.id)).length !== desiredIds.size) {
    showToast("No se encontró una de las mesas seleccionadas en el plano", "error");
    return false;
  }
  const esMedia = exp.mesaTipo === "media";
  entries.forEach(({ table }) => {
    const slot = tableSlotOf(table, exp.id);
    if (desiredIds.has(table.id)) {
      if (slot) {   // ya la tenía: se ajusta la mesa al tipo de espacio actual
        if (esMedia && !table.shared) table.shared = true;
        else if (!esMedia && table.shared && !tableOwnerIds(table).some((oid) => oid !== exp.id)) {   // pidió mesa completa y nadie la comparte
          if (slot === 2) { table.attended = table.attended2; table.absent = table.absent2; }
          table.exhibitorId = exp.id; table.exhibitorId2 = ""; table.shared = false;
          resetTableSlotAttendance(table, 2);
        }
        if (!table.shared) table.color = getTableOwnerColor(exp);
        return;
      }
      if (esMedia) {
        if (!table.shared) {   // mesa libre: pasa a mesa compartida con este expositor en la mitad A
          table.exhibitorId = ""; table.exhibitorId2 = ""; table.shared = true;
          setTableSlot(table, 1, exp.id); resetTableSlotAttendance(table, 1); resetTableSlotAttendance(table, 2);
        } else {
          const libre = !table.exhibitorId ? 1 : 2;
          setTableSlot(table, libre, exp.id); resetTableSlotAttendance(table, libre);
        }
      } else {   // mesa completa: se queda con la mesa y los dueños anteriores la dejan
        table.shared = false; table.exhibitorId = exp.id; table.exhibitorId2 = "";
        resetTableSlotAttendance(table, 1); resetTableSlotAttendance(table, 2);
      }
      if (!table.shared) table.color = getTableOwnerColor(exp);
    } else if (slot) {
      setTableSlot(table, slot, ""); resetTableSlotAttendance(table, slot);
      if (!tableOwnerIds(table).length) table.shared = false;
    }
  });
  syncAllTableAssignments(bz);
  return true;
}

/**
 * Asignación desde «Editar mesa» del plano: una mesa completa (un expositor) o una mesa compartida
 * (hasta 2 expositores de media mesa). No modifica nada si alguna regla falla.
 */
async function assignTableOwners(bz, table, { shared, id1, id2 }) {
  const buscar = (id) => bz.expositores.find((item) => item.id === id) || null;
  const e1 = buscar(id1);
  const e2 = shared ? buscar(id2) : null;
  if ((id1 && !e1) || (shared && id2 && !e2)) {
    showToast("No se encontró el expositor seleccionado", "error");
    return false;
  }
  if (shared && id1 && id1 === id2) {
    showToast("Elige dos expositores distintos para compartir la mesa", "error");
    return false;
  }
  if (shared && [e1, e2].some((e) => e && e.mesaTipo !== "media")) {
    showToast("Solo los expositores de «Media mesa» pueden compartir una mesa. Cambia su tipo de espacio en su registro.", "error");
    return false;
  }
  const anteriores = tableOwnerIds(table);
  for (const e of [e1, e2].filter(Boolean)) {   // el límite de mesas solicitadas se cuenta por día
    if (anteriores.includes(e.id)) continue;
    const propias = getExpositorTableIds(e, bz).filter((tid) => tid !== table.id);
    const limite = getExpositorRequestedTableCount(e);
    if (_mesasDelMismoDia(bz, propias, table.id).length >= limite) {
      showToast(`${e.negocio} solicitó ${limite} ${e.mesaTipo === "media" ? "media(s) mesa(s)" : "mesa(s)"}${bazarEsMultiDia(bz) ? " por día" : ""}; no se puede asignar otra.`, "error");
      return false;
    }
  }
  const nuevos = [id1, shared ? id2 : ""].filter(Boolean);
  const reemplazados = anteriores.filter((oid) => !nuevos.includes(oid));
  if (reemplazados.length && nuevos.length && !await appConfirm(
    `${reemplazados.map((oid) => buscar(oid)?.negocio || "El expositor actual").join(" y ")} dejará esta mesa. ¿Continuar?`, "Reasignar mesa", "Reasignar")) return false;
  const finalShared = Boolean(shared || e1?.mesaTipo === "media");   // quien pidió media mesa deja la mesa compartida
  const antes = { a: table.exhibitorId, b: table.exhibitorId2 };
  table.shared = finalShared;
  table.exhibitorId = id1 || "";
  table.exhibitorId2 = finalShared ? (shared ? id2 || "" : "") : "";
  if (antes.a !== table.exhibitorId) resetTableSlotAttendance(table, 1);
  if (antes.b !== table.exhibitorId2) resetTableSlotAttendance(table, 2);
  if (!finalShared && e1) table.color = getTableOwnerColor(e1);
  if (!tableOwnerIds(table).length && !shared) table.shared = false;
  syncAllTableAssignments(bz);
  return true;
}

/** Deja la mesa sin dueños (al eliminarla o limpiar el plano). */
function removeTableFromExpositorAssignment(bz, table) {
  table.exhibitorId = ""; table.exhibitorId2 = ""; table.shared = false;
  table.attended2 = false; table.absent2 = false;
  syncAllTableAssignments(bz);
}
