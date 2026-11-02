/**
 * EXPOSITORES.COM — checklist.js
 * Checklist individual de cada expositor: agregar, editar, borrar, toggle
 * Dependencias: state.js, utils.js
 */

// ==========================================
function openExpositorChecklist(expId) {
  const exp = getActiveBazaar().expositores.find((e) => e.id === expId);
  if (!exp) return;
  if (!Array.isArray(exp.checklist)) exp.checklist = defaultChecklistItems();
  document.getElementById("checklist-exp-id").value = expId;
  const titleEl = document.getElementById("modal-checklist-title");
  if (titleEl) titleEl.textContent = `Checklist — ${exp.negocio}`;
  renderExpositorChecklist();
  openModal("modal-checklist");
}

function renderExpositorChecklist() {
  const expId = document.getElementById("checklist-exp-id").value;
  const exp   = getActiveBazaar().expositores.find((e) => e.id === expId);
  const container = document.getElementById("checklist-exp-container");
  if (!exp || !container) return;

  const done  = exp.checklist.filter((i) => i.done).length;
  const total = exp.checklist.length;
  const progressEl = document.getElementById("checklist-exp-progress");
  if (progressEl) progressEl.textContent = `${done} / ${total} completado`;

  if (total === 0) {
    container.innerHTML = `<p style="font-size:var(--fs-xs);color:var(--color-text-muted);">Sin pendientes. Agrega uno abajo.</p>`;
    return;
  }

  // Cada ítem: checkbox + campo de texto editable + botón eliminar
  container.innerHTML = exp.checklist.map((item) => `
    <div class="checklist-edit-row">
      <label class="switch" style="flex-shrink:0;">
        <input type="checkbox" ${item.done ? "checked" : ""} onchange="toggleExpositorChecklistItem('${expId}','${item.id}')">
        <span class="slider"></span>
      </label>
      <input type="text" class="form-input checklist-text-input"
             value="${escapeHTML(item.label)}"
             style="${item.done ? "text-decoration:line-through;color:var(--color-text-muted);" : ""}"
             onchange="editChecklistItemLabel('${expId}','${item.id}',this.value)">
      <button type="button" class="btn-danger btn-sm" onclick="removeExpositorChecklistItem('${expId}','${item.id}')">🗑️</button>
    </div>`).join("");
}

function toggleExpositorChecklistItem(expId, itemId) {
  const exp  = getActiveBazaar().expositores.find((e) => e.id === expId);
  const item = exp?.checklist.find((i) => i.id === itemId);
  if (!item) return;
  item.done = !item.done;
  registrarHistorial(expId, `Checklist: "${item.label}" ${item.done ? "completado" : "reabierto"}`);
  saveState();
  renderExpositorChecklist();
  renderExpositores();
}

// [NUEVO] Editar el texto de un ítem del checklist
function editChecklistItemLabel(expId, itemId, newLabel) {
  const exp  = getActiveBazaar().expositores.find((e) => e.id === expId);
  const item = exp?.checklist.find((i) => i.id === itemId);
  if (!item) return;
  item.label = newLabel.trim() || item.label;
  saveState();
}

function addExpositorChecklistItem() {
  const expId = document.getElementById("checklist-exp-id").value;
  const input = document.getElementById("checklist-new-item");
  const label = input.value.trim();
  if (!label) return;
  const exp = getActiveBazaar().expositores.find((e) => e.id === expId);
  if (!exp) return;
  exp.checklist.push({ id: "chk-" + Date.now(), label, done: false });
  input.value = "";
  saveState();
  renderExpositorChecklist();
  renderExpositores();
}

function removeExpositorChecklistItem(expId, itemId) {
  const exp = getActiveBazaar().expositores.find((e) => e.id === expId);
  if (!exp) return;
  exp.checklist = exp.checklist.filter((i) => i.id !== itemId);
  saveState();
  renderExpositorChecklist();
  renderExpositores();
}

// ==========================================
