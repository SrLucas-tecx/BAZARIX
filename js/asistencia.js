/**
 * EXPOSITORES.COM — asistencia.js
 * Panel lateral de asistencia del mapa: 3 estados por mesa (pendiente/asistió/no asistió)
 * Dependencias: state.js, utils.js, canvas.js
 */

// 19. CHECKLIST DE ASISTENCIA DEL MAPA
// ==========================================
function renderChecklist() {
  const container = document.getElementById("checklist-container");
  if (!container) return;
  const bz = getActiveBazaar();
  const tables = getActiveTables(bz);
  if (tables.length === 0) {
    container.innerHTML = `<p style="font-size:var(--fs-xs);color:var(--color-text-muted);">No hay mesas en este piso. Agrega una con ➕ Mesa (M).</p>`;
    return;
  }
  const asistencia = (t, slot, etiqueta) => {
    const st = tableAttendanceState(t, slot);
    return `<select class="form-select" style="width:125px;padding:5px 7px;font-size:var(--fs-xs);"
                  onchange="setTableAttendance('${t.id}', this.value, ${slot})" aria-label="Estado de asistencia de ${escapeHTML(etiqueta)}">
            <option value="pending" ${st === "pending" ? "selected" : ""}>Pendiente</option>
            <option value="attended" ${st === "attended" ? "selected" : ""}>Asistió</option>
            <option value="absent" ${st === "absent" ? "selected" : ""}>No asistió</option>
          </select>`;
  };
  container.innerHTML = tables.map((t) => {
    const acciones = `<button class="btn-table-edit" type="button" onclick="openModalTableEdit('${t.id}')"
              title="Editar mesa, texto y color" aria-label="Editar ${escapeHTML(t.name)}">✎</button>
          <button class="btn-danger" style="padding:2px 8px;font-size:10px;border-radius:6px;" onclick="deleteTable('${t.id}')" title="Eliminar mesa">🗑️</button>`;
    if (t.shared) {   // mesa compartida: una fila de asistencia por mitad
      const mitades = [1, 2].map((slot) => {
        const exp = bz.expositores.find((e) => e.id === tableSlotValue(t, slot));
        return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;">
            <span style="font-size:var(--fs-xs);color:var(--color-text-muted);">${exp ? `<i class="exp-color-dot" style="background:${getExpositorPlanoColor(exp)}"></i>` : ""}½ ${exp ? escapeHTML(exp.negocio) : "<em>Libre</em>"}</span>
            ${exp ? asistencia(t, slot, `${t.name} (½ ${exp.negocio})`) : ""}
          </div>`;
      }).join("");
      return `
      <div class="card-meta-item">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="font-size:var(--fs-xs);">${escapeHTML(t.name)} · media mesa</strong>
          <div style="display:flex;align-items:center;gap:8px;">${acciones}</div>
        </div>${mitades}
      </div>`;
    }
    const exp = bz.expositores.find((e) => e.id === t.exhibitorId);
    return `
      <div class="card-meta-item" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <strong style="font-size:var(--fs-xs);">${escapeHTML(t.name)}</strong><br>
          <span style="color:var(--color-text-muted);font-size:var(--fs-xs);">${exp ? escapeHTML(exp.negocio) : "<em>Mesa Libre</em>"}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${asistencia(t, 1, t.name)}
          ${acciones}
        </div>
      </div>`;
  }).join("");
}


// ==========================================


// Busca la mesa en TODOS los pisos (el panel Día del Evento muestra todos).
function findTableAnyFloor(tableId, bz = getActiveBazaar()) {
  for (const floor of bz?.floors || []) {
    const table = (floor.tables || []).find((item) => item.id === tableId);
    if (table) return table;
  }
  return null;
}

function setTableAttendance(tableId, newState, slot = 1) {
  const bz = getActiveBazaar();
  const t  = findTableAnyFloor(tableId, bz);
  if (!t) return;
  if (Number(slot) === 2) {   // segunda mitad de una mesa compartida
    t.attended2 = newState === "attended";
    t.absent2   = newState === "absent";
  } else {
    t.attended = newState === "attended";
    t.absent   = newState === "absent";
  }
  const plain = { pending: "pendiente", attended: "asistió", absent: "no asistió" };
  const planoDelDia = (bz.floors || []).find((f) => (f.tables || []).includes(t));
  const diaTxt = planoDelDia && floorDiaId(planoDelDia, bz) ? ` · ${floorLabel(planoDelDia, bz).split(" · ").pop()}` : "";
  const duenoId = tableSlotValue(t, slot);
  if (duenoId) registrarHistorial(duenoId, `Asistencia (${t.name}${t.shared ? " ½" : ""}${diaTxt}): ${plain[newState]}`, bz);
  saveState();
  bazaarCanvas.render();
  renderChecklist();
  renderPanelDiaEvento();
  renderPanelMetricas(bz);
  const labels = { pending:"pendiente ⏳", attended:"asistencia confirmada ✅", absent:"no asistió ❌" };
  showToast(`${t.name}: ${labels[newState]}`);
}

// Alterna entre "asistió" y "pendiente" (antes siempre marcaba "asistió").
function toggleAttendance(tableId) {
  const t = findTableAnyFloor(tableId);
  if (!t) return;
  setTableAttendance(tableId, t.attended ? "pending" : "attended");
}
