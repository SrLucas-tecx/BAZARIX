/**
 * EXPOSITORES.COM — modales.js
 * Apertura/cierre de modales, formulario de expositor, CRUD categorías
 * Dependencias: state.js, utils.js
 */

// 13. MODALES Y FORMULARIO DE EXPOSITOR
// ==========================================
let formData = {};
let currentStep = 1;
let _expositorFormInitialSnapshot = "";
let _expositorCloseConfirmationPending = false;
window.formData = formData;
window.currentStep = currentStep;

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("open");
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  if (id === "modal-expositor" && el.classList.contains("open")) {
    syncExpositorFormData();
    if (JSON.stringify(formData) !== _expositorFormInitialSnapshot) {
      if (_expositorCloseConfirmationPending) return;
      _expositorCloseConfirmationPending = true;
      appConfirm("Hay cambios sin guardar. ¿Quieres descartarlos?", "Descartar cambios", "Descartar")
        .then((confirmed) => {
          _expositorCloseConfirmationPending = false;
          if (confirmed) finishCloseExpositorModal(el);
        });
      return;
    }
  }
  el.classList.remove("open");
  if (id === "modal-expositor") setExpositorWizardStep(1);
}

function finishCloseExpositorModal(modal = document.getElementById("modal-expositor")) {
  modal?.classList.remove("open");
  setExpositorWizardStep(1);
}

function syncExpositorFormData() {
  const form = document.getElementById("form-expositor");
  if (!form) return formData;
  const fields = {};
  [...form.querySelectorAll("input:not([type='file']), select, textarea")].forEach((control) => {
    if (control.classList.contains("exp-table-option")) return;
    if (!control.id && !control.name) return;
    const key = control.id || control.name;
    fields[key] = control.type === "checkbox" ? control.checked : control.value;
  });
  formData = {
    ...fields,
    tableIds: [...form.querySelectorAll("#exp-ubicacion .exp-table-option:checked")].map((checkbox) => checkbox.value),
    caracteristicas: [...form.querySelectorAll("#exp-caracteristicas-picker .exp-carac-option:checked")].map((box) => box.value),
    diasParticipacion: [...form.querySelectorAll("#exp-dias-picker .exp-dia-option:checked")].map((box) => box.value),
    sillasAsignadas: document.getElementById("exp-sillas-total")?.textContent || ""
  };
  window.formData = formData;
  renderExpositorWizardSummary();
  return formData;
}

function prepareExpositorWizard() {
  const form = document.getElementById("form-expositor");
  if (!form) return;
  if (form.dataset.wizardInitialized !== "true") {
    const sync = () => syncExpositorFormData();
    form.addEventListener("input", sync);
    form.addEventListener("change", sync);
    form.dataset.wizardInitialized = "true";
  }
  setExpositorWizardStep(1);
  syncExpositorFormData();
  _expositorFormInitialSnapshot = JSON.stringify(formData);
  document.querySelector(".expositor-wizard-modal")?.scrollTo({ top: 0 });
}

function setExpositorWizardStep(step) {
  if (!Number.isInteger(step) || step < 1 || step > 4) return;
  currentStep = step;
  window.currentStep = currentStep;
  document.querySelectorAll("#form-expositor [data-wizard-step]").forEach((panel) => {
    panel.hidden = Number(panel.dataset.wizardStep) !== step;
  });
  document.querySelectorAll("#form-expositor [data-wizard-indicator]").forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.wizardIndicator);
    indicator.classList.toggle("is-current", indicatorStep === step);
    indicator.classList.toggle("is-complete", indicatorStep < step);
    if (indicatorStep === step) indicator.setAttribute("aria-current", "step");
    else indicator.removeAttribute("aria-current");
  });
  const photo = document.getElementById("exp-photo-group");
  if (photo) photo.hidden = step !== 1;   // la foto solo se muestra en el paso 1 (Identidad)
  const cancel = document.getElementById("exp-wizard-cancel");
  const previous = document.getElementById("exp-wizard-previous");
  const next = document.getElementById("exp-wizard-next");
  const submit = document.getElementById("exp-wizard-submit");
  if (cancel) cancel.hidden = step !== 1;
  if (previous) previous.hidden = step === 1;
  if (next) {
    next.hidden = step === 4;
    next.textContent = [
      "",
      "Siguiente: Detalles Logísticos",
      "Siguiente: Costos y Pagos",
      "Siguiente: Notas y Confirmación"
    ][step];
  }
  if (submit) submit.hidden = step !== 4;
}

function validateExpositorStep(step) {
  const panel = document.querySelector(`#form-expositor [data-wizard-step="${step}"]`);
  if (!panel) return false;
  const invalidControl = [...panel.querySelectorAll("input, select, textarea")]
    .find((control) => !control.checkValidity());
  if (invalidControl) {
    invalidControl.reportValidity();
    return false;
  }
  return true;
}

function nextExpositorStep() {
  if (!validateExpositorStep(currentStep)) return;
  syncExpositorFormData();
  setExpositorWizardStep(Math.min(4, currentStep + 1));
  document.querySelector(`#form-expositor [data-wizard-step="${currentStep}"] .exp-wizard-title`)?.focus();
  document.querySelector(".expositor-wizard-modal")?.scrollTo({ top: 0, behavior: "smooth" });
}

function previousExpositorStep() {
  setExpositorWizardStep(Math.max(1, currentStep - 1));
  syncExpositorFormData();
  document.querySelector(`#form-expositor [data-wizard-step="${currentStep}"] .exp-wizard-title`)?.focus();
  document.querySelector(".expositor-wizard-modal")?.scrollTo({ top: 0, behavior: "smooth" });
}

function renderExpositorWizardSummary() {
  const box = document.getElementById("exp-wizard-summary");
  if (!box) return;
  const name = formData["exp-nombre"] || "Sin nombre";
  const business = formData["exp-negocio"] || "Sin marca";
  const chairs = formData.sillasAsignadas || document.getElementById("exp-sillas-total")?.textContent || "0";
  const tableCount = formData["exp-mesas-cantidad"] === "otro"
    ? formData["exp-mesas-otro"] || "0"
    : formData["exp-mesas-cantidad"] || "1";
  const total = Math.max(0, Number(formData["exp-costo"]) || 0);
  const discount = Math.max(0, Number(formData["exp-descuento"]) || 0);
  const advance = Math.max(0, Number(formData["exp-adelanto"]) || 0);
  const balance = formData["exp-pagado"] ? 0 : Math.max(0, total - discount - advance);
  box.innerHTML = `
    <div><span>Nombre</span><strong>${escapeHTML(String(name))}</strong></div>
    <div><span>Marca</span><strong>${escapeHTML(String(business))}</strong></div>
    <div><span>Mesas / sillas</span><strong>${escapeHTML(String(tableCount))} / ${escapeHTML(String(chairs))}</strong></div>
    <div><span>Saldo pendiente</span><strong>${formatCurrency(balance)}</strong></div>`;
}

function openModalExpositor(id = null, categoryId = null) {
  const form = document.getElementById("form-expositor");
  form.reset();
  populateCategoriaSelect();
  document.getElementById("exp-id").value           = "";
  document.getElementById("exp-foto-base64").value  = "";
  const box = document.getElementById("avatar-preview-box");
  if (box) box.innerHTML = "📷";

  const bz = getActiveBazaar();
  let exp = null;
  if (id) {
    exp = bz.expositores.find((e) => e.id === id);
    if (exp) {
      document.getElementById("modal-exp-title").textContent = "Editar Expositor";
      document.getElementById("exp-id").value           = exp.id;
      document.getElementById("exp-nombre").value        = exp.nombre;
      document.getElementById("exp-negocio").value       = exp.negocio;
      document.getElementById("exp-categoria").value     = exp.categoria;
      
      document.getElementById("exp-mesas-cantidad").value = exp.mesasCantidad || "1";
      document.getElementById("exp-mesas-otro").value = exp.mesasCantidadOtro || "";
      document.getElementById("exp-tel").value           = exp.tel || "";
      document.getElementById("exp-email").value         = exp.email || "";
      document.getElementById("exp-costo-base").value    = Math.max(0, Number(exp.costoBase ?? (Number(exp.costo || 0) - Number(exp.costoExtraSillas || 0))));
      document.getElementById("exp-sillas-extra-enabled").checked = Number(exp.sillasExtraCantidad || 0) > 0;
      document.getElementById("exp-sillas-extra-cantidad").value = exp.sillasExtraCantidad || 1;
      document.getElementById("exp-costo-silla-extra").value = bz.costsConfig.chairExtraUnitPrice || 0;
      document.getElementById("exp-adelanto").value      = exp.adelanto || 0;
      document.getElementById("exp-fecha-limite").value  = exp.fechaLimitePago || "";
      document.getElementById("exp-pagado").checked      = exp.pagado;
      document.getElementById("exp-descuento").value     = exp.descuento || 0;
      document.getElementById("exp-notas-credito").value = exp.notaCredito || "";
      document.getElementById("exp-sillas-por-mesa").value = exp.sillasPorMesa ?? bz.costsConfig.chairsPerTable ?? 2;
      document.getElementById("exp-notas").value         = exp.notas || "";
      document.getElementById("exp-mesa-tipo").value     = exp.mesaTipo === "media" ? "media" : "completa";
      document.getElementById("exp-color-enabled").checked = Boolean(exp.color);
      if (exp.color) document.getElementById("exp-color").value = exp.color;
      document.getElementById("exp-foto-base64").value   = exp.foto || "";
      if (exp.foto && box) box.innerHTML = `<img src="${exp.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    }
  } else {
    document.getElementById("modal-exp-title").textContent = "Nuevo Expositor";
    document.getElementById("exp-sillas-por-mesa").value = bz.costsConfig.chairsPerTable ?? 2;
    document.getElementById("exp-sillas-extra-enabled").checked = false;
    document.getElementById("exp-sillas-extra-cantidad").value = 1;
    document.getElementById("exp-costo-silla-extra").value = bz.costsConfig.chairExtraUnitPrice || 0;
    if (categoryId && AppState.categorias.some((category) => category.id === categoryId)) {
      document.getElementById("exp-categoria").value = categoryId;
    }
  }
  populateExpositorCaracteristicas(exp?.caracteristicas || []);
  populateExpositorDias(exp, bz);
  populateExpositorAssignmentSelects(bz, exp);
  toggleOtherTableCount();
  updateExpositorColorFields();
  updateExpositorMesaTipo(false);
  applySuggestedBaseCost(!exp);
  updateExpositorExtraChairFields();
  updateExpositorCostPreview();
  updateExpositorPaymentFields();
  prepareExpositorWizard();
  openModal("modal-expositor");
}

function setExpositorConditionalVisibility(element, visible) {
  if (!element) return;
  clearTimeout(element._visibilityTimer);
  if (visible) {
    element.hidden = false;
    element.inert = false;
    element.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => element.classList.remove("is-collapsed"));
  } else {
    element.inert = true;
    element.setAttribute("aria-hidden", "true");
    element.classList.add("is-collapsed");
    element._visibilityTimer = setTimeout(() => { element.hidden = true; }, 220);
  }
}

function updateExpositorPaymentFields() {
  const isPaidFull = document.getElementById("exp-pagado")?.checked || false;
  const hasDiscount = Number(document.getElementById("exp-descuento")?.value || 0) > 0;
  const paymentDetails = document.getElementById("exp-payment-details");
  const creditNote = document.getElementById("exp-credit-note-wrap");
  const balance = document.getElementById("exp-payment-balance");
  const paidBadge = document.getElementById("exp-payment-paid-badge");

  setExpositorConditionalVisibility(paymentDetails, !isPaidFull);
  setExpositorConditionalVisibility(creditNote, hasDiscount);
  setExpositorConditionalVisibility(balance, !isPaidFull);
  setExpositorConditionalVisibility(paidBadge, isPaidFull);
  updateExpositorPaymentPreview();
}

function updateExpositorPaymentPreview() {
  const balance = document.getElementById("exp-payment-balance");
  if (!balance || document.getElementById("exp-pagado")?.checked) return;
  const total = Math.max(0, Number(document.getElementById("exp-costo")?.value || 0));
  const discount = Math.max(0, Number(document.getElementById("exp-descuento")?.value || 0));
  const advance = Math.max(0, Number(document.getElementById("exp-adelanto")?.value || 0));
  const pending = Math.max(0, total - discount - advance);
  balance.innerHTML = `<span>Saldo pendiente</span><strong>${formatCurrency(pending)}</strong>`;
}

function updateExpositorExtraChairFields(clearWhenDisabled = true) {
  const enabled = document.getElementById("exp-sillas-extra-enabled")?.checked || false;
  const details = document.getElementById("exp-sillas-extra-details");
  const countInput = document.getElementById("exp-sillas-extra-cantidad");
  const costInput = document.getElementById("exp-costo-silla-extra");
  countInput.required = false;
  countInput.disabled = !enabled;
  costInput.required = false;
  costInput.disabled = !enabled;
  if (!enabled && clearWhenDisabled) {
    countInput.value = "";
    costInput.value = "";
  }
  setExpositorConditionalVisibility(details, enabled);
  updateExpositorCostPreview();
}

function updateExpositorCostPreview() {
  const baseInput = document.getElementById("exp-costo-base");
  const totalInput = document.getElementById("exp-costo");
  const extraSummary = document.getElementById("exp-sillas-extra-total");
  if (!baseInput || !totalInput || !extraSummary) return;
  const baseCost = Math.max(0, Number(baseInput.value) || 0);
  const hasExtraChairs = document.getElementById("exp-sillas-extra-enabled")?.checked || false;
  const extraCount = hasExtraChairs
    ? Math.max(0, Math.floor(Number(document.getElementById("exp-sillas-extra-cantidad")?.value) || 0))
    : 0;
  const bz = getActiveBazaar();
  const unitCost = hasExtraChairs ? Math.max(0, Number(bz?.costsConfig?.chairExtraUnitPrice) || 0) : 0;
  const unitInput = document.getElementById("exp-costo-silla-extra");
  if (unitInput) unitInput.value = unitCost;
  const extraCost = extraCount * unitCost;
  const finalCost = Math.round((baseCost + extraCost) * 100) / 100;
  totalInput.value = Number.isFinite(finalCost) ? finalCost.toFixed(2) : "";
  extraSummary.textContent = extraCount
    ? `${extraCount} silla(s) extra × ${formatCurrency(unitCost)} = ${formatCurrency(extraCost)}`
    : "Sin cargo de sillas extra.";
  updateExpositorPaymentPreview();
}

function getExpositorPendingBalance(exp) {
  if (!exp || exp.pagado) return 0;
  return Math.max(0,
    Number(exp.costo || 0) - Number(exp.descuento || 0) - Number(exp.adelanto || 0)
  );
}

/** Dibuja las mesas del plano que se pueden elegir. Con «Ocultar mesas ocupadas» solo salen las disponibles. */
function renderExpositorTablePicker(bz, exp, selectedTableIds) {
  const tableList = document.getElementById("exp-ubicacion");
  if (!tableList) return;
  const tipo = document.getElementById("exp-mesa-tipo")?.value || exp?.mesaTipo || "completa";
  const ocultar = document.getElementById("exp-ocultar-ocupadas")?.checked ?? true;
  const tables = (bz.floors || []).flatMap((floor) => (floor.tables || []).map((table) => ({ floor, table })));
  const legacyLocation = exp?.ubicacionAnterior?.trim() || "";
  const hasLegacyLocation = legacyLocation && selectedTableIds.length === 0
    && !tables.some(({ table }) => table.name.trim().toLowerCase() === legacyLocation.toLowerCase());
  const nombre = (id) => bz.expositores.find((item) => item.id === id)?.negocio || "";
  let ocultas = 0;
  const tiles = tables.map(({ floor, table }) => {
    const av = tableAvailability(table, exp?.id, tipo);
    const mine = av.mine || selectedTableIds.includes(table.id);
    const others = av.others;
    if (ocultar && !(mine || av.available)) { ocultas += 1; return ""; }
    const bloqueada = !mine && av.blocked;
    const estado = others.length ? (table.shared ? (others.length < 2 ? "½ libre" : "Llena") : "Asignada") : (table.shared ? "Compartida" : "");
    const ariaLabel = `${floorLabel(floor, bz)} · ${table.name}${others.length ? ` · ${others.map(nombre).join(" y ")}` : ""}`;
    return `<label class="exp-table-tile${others.length ? " is-assigned" : ""}" title="${escapeHTML(ariaLabel)}">
        <input type="checkbox" class="exp-table-option" value="${escapeHTML(table.id)}" data-dia="${escapeHTML(floorDiaId(floor, bz))}"
          ${bloqueada ? 'data-bloqueada="1" disabled' : ""} aria-label="${escapeHTML(ariaLabel)}" ${mine && selectedTableIds.includes(table.id) ? "checked" : ""}
          onchange="updateExpositorTableSelection(this)">
        <span class="exp-table-tile-name">${escapeHTML(table.name)}</span>
        <span class="exp-table-tile-floor">${escapeHTML(floorLabel(floor, bz))}</span>
        ${estado ? `<span class="exp-table-tile-status">${estado}</span>` : ""}
      </label>`;
  });
  tableList.innerHTML = tiles.some(Boolean)
    ? tiles.join("")
    : tables.length
      ? `<span class="form-hint" style="grid-column:1/-1;">No hay mesas libres para este tipo de espacio${ocultas ? ` (${ocultas} ocupada(s) oculta(s))` : ""}. Desactiva «Ocultar mesas ocupadas» para verlas.</span>`
      : `<span class="form-hint">No hay mesas en el plano. La asignación es opcional; puedes agregar o asignar mesas después.</span>`;
  if (ocultas && tiles.some(Boolean)) tableList.insertAdjacentHTML("beforeend", `<p class="form-hint" style="grid-column:1/-1;margin:0;">${ocultas} mesa(s) ocupada(s) oculta(s).</p>`);
  if (hasLegacyLocation) tableList.insertAdjacentHTML("beforeend", `<p class="form-hint" style="grid-column:1/-1;">Ubicación anterior conservada: ${escapeHTML(legacyLocation)}</p>`);
}

/** Vuelve a dibujar las mesas conservando lo marcado (al cambiar el tipo de espacio o ocultar ocupadas). */
function refreshExpositorTablePicker() {
  const bz = getActiveBazaar();
  if (!bz) return;
  const expId = document.getElementById("exp-id")?.value;
  const exp = expId ? bz.expositores.find((item) => item.id === expId) : null;
  const seleccion = [...document.querySelectorAll("#exp-ubicacion .exp-table-option:checked")].map((box) => box.value);
  renderExpositorTablePicker(bz, exp, seleccion);
  updateExpositorTableSelection();
}

function populateExpositorAssignmentSelects(bz, exp = null) {
  const tableList = document.getElementById("exp-ubicacion");
  const areaSelect = document.getElementById("exp-area-encargada");
  if (!tableList || !areaSelect) return;

  const floors = bz.floors || [];
  const tables = floors.flatMap((floor) => (floor.tables || []).map((table) => ({ floor, table })));
  const selectedTableIds = getExpositorTableIds(exp, bz);
  const legacyLocation = exp?.ubicacionAnterior?.trim() || "";
  const requested = getExpositorRequestedTableCount(exp);
  const hasLegacyLocation = legacyLocation && selectedTableIds.length === 0
    && !tables.some(({ table }) => table.name.trim().toLowerCase() === legacyLocation.toLowerCase());
  renderExpositorTablePicker(bz, exp, selectedTableIds);

  const roles = bz.roles || [];
  const selectedRoleId = exp?.areaRolId && roles.some((role) => role.id === exp.areaRolId)
    ? exp.areaRolId
    : roles.find((role) => role.nombre.trim().toLowerCase() === (exp?.areaEncargada || "").trim().toLowerCase())?.id || "";
  const legacyArea = exp?.areaEncargada?.trim() || "";
  const selectedRoleExists = roles.some((role) => role.id === selectedRoleId);
  areaSelect.innerHTML = `<option value="">Selecciona un área de Staff</option>` + roles.map((role) =>
    `<option value="${escapeHTML(role.id)}" ${role.id === selectedRoleId ? "selected" : ""}>${escapeHTML(role.nombre)}</option>`
  ).join("");
  if (legacyArea && !selectedRoleExists && !roles.some((role) => role.nombre.trim().toLowerCase() === legacyArea.toLowerCase())) {
    areaSelect.insertAdjacentHTML("beforeend", `<option value="__legacy_area" selected>${escapeHTML(legacyArea)} (área anterior)</option>`);
  }
  areaSelect.value = selectedRoleExists ? selectedRoleId
    : legacyArea && !roles.some((role) => role.nombre.trim().toLowerCase() === legacyArea.toLowerCase()) ? "__legacy_area" : "";
  const responsibleSelect = document.getElementById("exp-encargado");
  if (responsibleSelect) responsibleSelect.dataset.selectedId = exp?.encargadoId || "";
  updateExpositorAreaStaff();
  updateExpositorTableSelection();
  updateExpositorChairPreview();
}

function updateExpositorChairPreview() {
  const output = document.getElementById("exp-sillas-total");
  if (!output) return;
  const tables = getExpositorRequestedTableCount({
    mesasCantidad: document.getElementById("exp-mesas-cantidad")?.value,
    mesasCantidadOtro: document.getElementById("exp-mesas-otro")?.value,
    mesaTipo: document.getElementById("exp-mesa-tipo")?.value
  });
  const chairsPerTable = Math.max(0, Math.floor(Number(document.getElementById("exp-sillas-por-mesa")?.value) || 0));
  const totalChairs = tables * chairsPerTable;
  output.textContent = Number.isSafeInteger(totalChairs) ? String(totalChairs) : "Revisa la cantidad";
}

/** Días en los que participa según el formulario abierto (null = todos). */
function expositorFormDias(bz = getActiveBazaar()) {
  if (!bazarEsMultiDia(bz)) return null;
  const todos = document.getElementById("exp-todos-dias");
  if (!todos || todos.checked) return null;
  const elegidos = [...document.querySelectorAll("#exp-dias-picker .exp-dia-option:checked")].map((box) => box.value);
  return elegidos.length && elegidos.length < bz.evento.dias.length ? new Set(elegidos) : null;
}

function renderExpositorTableAssignmentHint(exp, requested, selectedCount, totalTables, porDia = null) {
  const hint = document.getElementById("exp-table-assignment-hint");
  if (!hint) return;
  if (!totalTables) {
    hint.textContent = `${requested} mesa(s) solicitada(s)${porDia ? " por día" : ""}. La asignación en el plano es opcional y puedes hacerla después.`;
  } else if (porDia && porDia.length) {
    hint.textContent = `${porDia.map(({ label, count }) => `${label}: ${count} de ${requested}`).join(" · ")} mesa(s). Puedes dejar mesas por asignar.`;
  } else {
    hint.textContent = `${selectedCount} de ${requested} mesa(s) seleccionada(s). ${selectedCount < requested ? "Puedes dejar mesas por asignar." : "Cantidad solicitada completada."}`;
  }
}

function updateExpositorTableSelection(changedCheckbox = null) {
  const bz = getActiveBazaar();
  const multi = bazarEsMultiDia(bz);
  const checkboxes = [...document.querySelectorAll("#exp-ubicacion .exp-table-option")];
  const requested = getExpositorRequestedTableCount({
    mesasCantidad: document.getElementById("exp-mesas-cantidad")?.value,
    mesasCantidadOtro: document.getElementById("exp-mesas-otro")?.value,
    mesaTipo: document.getElementById("exp-mesa-tipo")?.value
  });
  const diaDe = (box) => box.dataset.dia || "";
  const permitidos = expositorFormDias(bz);   // null = todos los días
  const bloqueada = (box) => Boolean(permitidos && diaDe(box) && !permitidos.has(diaDe(box)));
  let quitadas = false;
  checkboxes.forEach((box) => { if (box.checked && bloqueada(box)) { box.checked = false; quitadas = true; } });
  if (quitadas) showToast("Se quitaron mesas de días en los que el expositor no participa.");

  // Límite de mesas solicitadas: se cuenta por día (en eventos de un día, es un solo grupo).
  const grupos = {};
  checkboxes.filter((box) => box.checked).forEach((box) => { (grupos[diaDe(box)] ||= []).push(box); });
  Object.values(grupos).forEach((lista) => {
    if (lista.length <= requested) return;
    if (changedCheckbox && lista.includes(changedCheckbox)) {
      changedCheckbox.checked = false;
      showToast(`Este expositor solicitó ${requested} mesa(s)${multi ? " por día" : ""}.`, "error");
    } else {
      lista.slice(requested).forEach((box) => { box.checked = false; });
      showToast(`Se ajustó la asignación al nuevo límite de ${requested} mesa(s)${multi ? " por día" : ""}.`);
    }
  });
  const contar = (dia) => checkboxes.filter((box) => box.checked && diaDe(box) === dia).length;
  checkboxes.forEach((box) => {
    box.disabled = !box.checked && (box.dataset.bloqueada === "1" || bloqueada(box) || contar(diaDe(box)) >= requested);
    box.closest(".exp-table-tile")?.classList.toggle("is-selected", box.checked);
    box.closest(".exp-table-tile")?.classList.toggle("is-disabled", box.disabled);
  });
  const expId = document.getElementById("exp-id")?.value;
  const exp = bz?.expositores.find((item) => item.id === expId) || null;
  const claves = [...new Set(checkboxes.map(diaDe))];
  const porDia = multi ? claves.map((dia) => {
    const i = bz.evento.dias.findIndex((d) => d.id === dia);
    return { label: i >= 0 ? getDiaLabel(bz.evento.dias[i], i) : "Sin día", count: contar(dia) };
  }) : null;
  renderExpositorTableAssignmentHint(exp, requested, checkboxes.filter((box) => box.checked).length, checkboxes.length, porDia);
  updateExpositorChairPreview();
}

function updateExpositorAreaStaff() {
  const select = document.getElementById("exp-area-encargada");
  const personSelect = document.getElementById("exp-encargado");
  const bz = getActiveBazaar();
  if (!select || !personSelect || !bz) return;
  const role = bz.roles.find((item) => item.id === select.value);
  const selectedId = personSelect.value || personSelect.dataset.selectedId || "";
  const people = role ? bz.responsables.filter((person) => person.rolId === role.id) : [];
  personSelect.disabled = !role || people.length === 0;
  personSelect.innerHTML = !role
    ? `<option value="">Elige un área de Staff primero</option>`
    : people.length
      ? `<option value="">Elegir persona de ${escapeHTML(role.nombre)}</option>${people.map((person) =>
        `<option value="${escapeHTML(person.id)}">${escapeHTML(person.nombre)}</option>`
      ).join("")}`
      : `<option value="">No hay personas asignadas a esta área</option>`;
  personSelect.value = people.some((person) => person.id === selectedId) ? selectedId : "";
  personSelect.dataset.selectedId = personSelect.value;
}

function getExpositorAreaName(exp, bz = getActiveBazaar()) {
  return bz?.roles?.find((role) => role.id === exp.areaRolId)?.nombre || exp.areaEncargada || "";
}

function getExpositorResponsibleName(exp, bz = getActiveBazaar()) {
  return bz?.responsables?.find((person) => person.id === exp.encargadoId)?.nombre || "";
}

function toggleOtherTableCount() {
  const select = document.getElementById("exp-mesas-cantidad");
  const input = document.getElementById("exp-mesas-otro");
  if (!select || !input) return;
  const custom = select.value === "otro";
  input.style.display = custom ? "block" : "none";
  input.required = custom;
  if (!custom) input.value = "";   // un valor inválido oculto bloqueaba el envío en silencio
  updateExpositorTableSelection();
}

function openModalExpositorForCurrentCategory() {
  const categoryId = AppState.filterCategory === "all" ? null : AppState.filterCategory;
  openModalExpositor(null, categoryId);
}

function populateCategoriaSelect(selectedCategoryId = "") {
  const sel = document.getElementById("exp-categoria");
  if (!sel) return;
  sel.innerHTML = `<option value="">Sin categoría</option>${AppState.categorias.map((category) =>
    `<option value="${escapeHTML(category.id)}">${category.emoji} ${escapeHTML(category.nombre)}</option>`
  ).join("")}`;
  sel.value = selectedCategoryId;
}

// Tipo de espacio (mesa completa / media mesa), color en el plano y costo base sugerido por el precio global.
function updateExpositorMesaTipo(fromUser = false) {
  const media = document.getElementById("exp-mesa-tipo")?.value === "media";
  const group = document.getElementById("exp-mesas-group");
  if (group) group.hidden = media;   // la media mesa siempre es una
  if (media) {
    const select = document.getElementById("exp-mesas-cantidad");
    if (select) select.value = "1";
    toggleOtherTableCount();
  }
  if (fromUser) {
    const porMesa = Number(getActiveBazaar()?.costsConfig?.chairsPerTable ?? 2) || 0;
    const sillas = document.getElementById("exp-sillas-por-mesa");
    if (sillas) sillas.value = media ? Math.max(1, Math.ceil(porMesa / 2)) : porMesa;   // media mesa: la mitad de sillas (ajustable)
  }
  updateExpositorChairPreview();
  refreshExpositorTablePicker();   // cambian las mesas disponibles
  applySuggestedBaseCost(fromUser);
}

const EXP_PLANO_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#0d9488", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];

/** Paleta compacta del color en el plano; el valor real vive en #exp-color (selector libre pequeño). */
function renderExpositorColorSwatches() {
  const box = document.getElementById("exp-color-swatches");
  const input = document.getElementById("exp-color");
  if (!box || !input) return;
  const actual = String(input.value || "").toLowerCase();
  box.innerHTML = EXP_PLANO_COLORS.map((hex) =>
    `<button type="button" class="color-swatch ${hex === actual ? "is-selected" : ""}" style="background:${hex}"
      onclick="pickExpositorColor('${hex}')" aria-label="Color ${hex}" aria-pressed="${hex === actual}" title="${hex}"></button>`).join("");
}

function pickExpositorColor(hex) {
  const input = document.getElementById("exp-color");
  if (!input) return;
  input.value = hex;
  renderExpositorColorSwatches();
  syncExpositorFormData();
}

function updateExpositorColorFields() {
  const on = document.getElementById("exp-color-enabled")?.checked;
  const input = document.getElementById("exp-color");
  const box = document.getElementById("exp-color-swatches");
  if (input) input.hidden = !on;
  if (box) box.hidden = !on;
  if (on) renderExpositorColorSwatches();
}

function applySuggestedBaseCost(fromUser = false) {
  const input = document.getElementById("exp-costo-base");
  const hint = document.getElementById("exp-costo-base-hint");
  if (!input || !hint) return;
  const cfg = getActiveBazaar()?.costsConfig || {};
  const media = document.getElementById("exp-mesa-tipo")?.value === "media";
  const mesas = getExpositorRequestedTableCount({
    mesasCantidad: document.getElementById("exp-mesas-cantidad")?.value,
    mesasCantidadOtro: document.getElementById("exp-mesas-otro")?.value,
    mesaTipo: media ? "media" : "completa"
  });
  const precio = media ? Number(cfg.halfTablePrice || 0) : Number(cfg.tablePrice || 0) * mesas;
  if (!(precio > 0)) {
    hint.textContent = "";
    delete input.dataset.auto;
    return;
  }
  const sugerido = Math.round(precio * 100) / 100;
  const actual = Number(input.value || 0);
  const intacto = input.value === "" || actual === 0 || actual === Number(input.dataset.auto);   // no lo ha cambiado a mano
  if (fromUser && intacto && actual !== sugerido) {
    input.value = sugerido;
    updateExpositorCostPreview();
  }
  input.dataset.auto = String(sugerido);
  const igual = Number(input.value || 0) === sugerido;
  hint.innerHTML = `Precio global ${media ? "de media mesa" : `por mesa × ${mesas}`}: <strong>${formatCurrency(sugerido)}</strong>.${igual ? "" : ' <button type="button" class="link-inline" onclick="useGlobalBaseCost()">Usar precio global</button>'}`;
}

function useGlobalBaseCost() {
  const input = document.getElementById("exp-costo-base");
  if (!input?.dataset.auto) return;
  input.value = input.dataset.auto;
  updateExpositorCostPreview();
  applySuggestedBaseCost(false);
}

// Días de participación (solo si el bazar dura más de 1 día). Sin elegir ninguno = todos los días.
function populateExpositorDias(exp = null, bz = getActiveBazaar()) {
  const group = document.getElementById("exp-dias-group");
  const toggle = document.getElementById("exp-todos-dias");
  const picker = document.getElementById("exp-dias-picker");
  if (!group || !toggle || !picker) return;
  const multi = bazarEsMultiDia(bz);
  group.hidden = !multi;
  if (!multi) return;
  const dias = bz.evento.dias;
  const selected = new Set(exp?.diasParticipacion || []);
  const validos = dias.filter((d) => selected.has(d.id));
  toggle.checked = !(validos.length && validos.length < dias.length);
  picker.innerHTML = dias.map((d, i) => `
    <label class="caract-chip">
      <input type="checkbox" class="exp-dia-option" value="${escapeHTML(d.id)}" ${selected.has(d.id) ? "checked" : ""}
             onchange="updateExpositorDias(true)">
      <span>${escapeHTML(getDiaLabel(d, i))}${formatDiaFecha(d.fecha) ? ` · ${escapeHTML(formatDiaFecha(d.fecha))}` : ""}</span>
    </label>`).join("");
  updateExpositorDias();
}

function updateExpositorDias(fromUser = false) {
  const toggle = document.getElementById("exp-todos-dias");
  const picker = document.getElementById("exp-dias-picker");
  const hint = document.getElementById("exp-dias-hint");
  if (!toggle || !picker) return;
  picker.hidden = toggle.checked;
  const boxes = [...picker.querySelectorAll(".exp-dia-option")];
  boxes.forEach((box) => box.closest(".caract-chip")?.classList.toggle("is-selected", box.checked));
  const count = boxes.filter((box) => box.checked).length;
  if (hint) hint.textContent = toggle.checked ? "Participa en todos los días del evento."
    : count ? `${count} día(s) seleccionado(s).`
    : "Elige los días; si no eliges ninguno, se tomará como todos los días.";
  if (fromUser) updateExpositorTableSelection();   // las mesas de días sin participación se desactivan
}

// Características del expositor: interruptor + selector de chips (se oculta si el interruptor está apagado).
function populateExpositorCaracteristicas(selectedIds = []) {
  const picker = document.getElementById("exp-caracteristicas-picker");
  const toggle = document.getElementById("exp-tiene-caracteristicas");
  if (!picker || !toggle) return;
  const selected = new Set(selectedIds);
  const list = getCaracteristicas();
  picker.innerHTML = list.length
    ? list.map((c) => `
        <label class="caract-chip" style="--chip-color:${escapeHTML(c.color)}" title="${escapeHTML(c.descripcion || c.nombre)}">
          <input type="checkbox" class="exp-carac-option" value="${escapeHTML(c.id)}" ${selected.has(c.id) ? "checked" : ""}
                 onchange="updateExpositorCaracteristicas()">
          <span>${escapeHTML(c.emoji)} ${escapeHTML(c.nombre)}</span>
        </label>`).join("")
    : `<span class="form-hint">Aún no hay características. Créalas en Catálogos → Características.</span>`;
  toggle.checked = list.some((c) => selected.has(c.id));
  updateExpositorCaracteristicas();
}

function updateExpositorCaracteristicas() {
  const toggle = document.getElementById("exp-tiene-caracteristicas");
  const group = document.getElementById("exp-caracteristicas-group");
  if (!toggle || !group) return;
  group.hidden = !toggle.checked;
  const boxes = [...document.querySelectorAll("#exp-caracteristicas-picker .exp-carac-option")];
  boxes.forEach((box) => box.closest(".caract-chip")?.classList.toggle("is-selected", box.checked));
  const count = boxes.filter((box) => box.checked).length;
  const hint = document.getElementById("exp-caracteristicas-hint");
  if (hint) hint.textContent = !boxes.length ? ""
    : count ? `${count} seleccionada(s). En la tarjeta se muestran 2 y el resto en "Ver todas".`
    : "Elige una o más características.";
}

function handleFotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const img = new Image();
    img.onload = () => {
      // Se reduce la foto: una imagen original llena el localStorage (~5 MB) y el guardado falla.
      const MAX = 400;
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const b64 = canvas.toDataURL("image/jpeg", 0.8);
      document.getElementById("exp-foto-base64").value = b64;
      const box = document.getElementById("avatar-preview-box");
      if (box) box.innerHTML = `<img src="${b64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
      syncExpositorFormData();
    };
    img.onerror = () => showToast("No se pudo leer la imagen", "error");
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveExpositorHandler(e, submittedFormData = null) {
  e.preventDefault();
  if (currentStep < 4) {
    nextExpositorStep();
    return;
  }
  const data = submittedFormData || syncExpositorFormData();
  const bz = getActiveBazaar();
  const id = document.getElementById("exp-id").value;
  const existing = id ? bz.expositores.find((x) => x.id === id) : null;
  if (id && !existing) {
    showToast("No se encontró el expositor que intentas editar", "error");
    return;
  }
  const tableIds = [...new Set(data.tableIds)];
  const requestedTableCount = getExpositorRequestedTableCount({
    mesasCantidad: data["exp-mesas-cantidad"],
    mesasCantidadOtro: data["exp-mesas-otro"],
    mesaTipo: data["exp-mesa-tipo"]
  });
  if (!Number.isSafeInteger(requestedTableCount) || requestedTableCount < 1) {
    showToast("La cantidad de mesas compradas debe ser un número entero válido.", "error");
    return;
  }
  const selectedCategoryId = data["exp-categoria"] || "";
  const caracteristicas = data["exp-tiene-caracteristicas"]
    ? [...new Set(data.caracteristicas || [])].filter((cid) => getCaracteristicas().some((c) => c.id === cid))
    : [];
  if (Object.values(mesasPorDia(bz, tableIds)).some((n) => n > requestedTableCount)) {
    showToast(`No puedes asignar más de ${requestedTableCount} mesa(s) a este expositor${bazarEsMultiDia(bz) ? " por día" : ""}.`, "error");
    return;
  }
  const chairsPerTable = Math.floor(Number(data["exp-sillas-por-mesa"]));
  const chairCount = requestedTableCount * chairsPerTable;
  if (!Number.isSafeInteger(chairsPerTable) || chairsPerTable < 0 || !Number.isSafeInteger(chairCount)) {
    showToast("Revisa la cantidad de sillas por mesa; debe ser un número entero válido.", "error");
    return;
  }
  const baseCost = Number(data["exp-costo-base"]);
  const hasExtraChairs = data["exp-sillas-extra-enabled"];
  const hasExtraChairDetails = hasExtraChairs && data["exp-sillas-extra-cantidad"] !== "";
  const extraChairCount = hasExtraChairDetails ? Number(data["exp-sillas-extra-cantidad"]) : 0;
  const extraChairUnitCost = Math.max(0, Number(bz.costsConfig.chairExtraUnitPrice) || 0);
  const extraChairCost = extraChairCount * extraChairUnitCost;
  const finalCost = Math.round((baseCost + extraChairCost) * 100) / 100;
  if (!Number.isFinite(baseCost) || baseCost < 0
      || (hasExtraChairDetails && (!Number.isSafeInteger(extraChairCount) || extraChairCount < 1
        || !Number.isFinite(extraChairUnitCost) || extraChairUnitCost < 0))
      || !Number.isSafeInteger(chairCount + extraChairCount)
      || !Number.isFinite(extraChairCost) || !Number.isFinite(finalCost)) {
    showToast("Revisa el costo base y los datos de las sillas extra.", "error");
    return;
  }
  const multiDia = bazarEsMultiDia(bz);
  let diasParticipacion = existing?.diasParticipacion || [];   // en eventos de un día se conserva lo que ya tenía
  if (multiDia) {
    const validos = [...new Set(data.diasParticipacion || [])].filter((did) => bz.evento.dias.some((d) => d.id === did));
    diasParticipacion = data["exp-todos-dias"] || !validos.length || validos.length === bz.evento.dias.length ? [] : validos;
  }
  const allTables = (bz.floors || []).flatMap((floor) => floor.tables || []);
  if (tableIds.some((tableId) => !allTables.some((table) => table.id === tableId))) {
    showToast("No se encontró una de las mesas seleccionadas en el plano", "error");
    return;
  }
  const esMedia = data["exp-mesa-tipo"] === "media";
  const mesasSeleccionadas = tableIds.map((tableId) => allTables.find((table) => table.id === tableId));
  const estado = (table) => tableAvailability(table, id, esMedia ? "media" : "completa");
  const noDisponibles = mesasSeleccionadas.filter((table) => estado(table).blocked);
  if (noDisponibles.length) {
    showToast(`${noDisponibles.map((table) => table.name).join(", ")}: ${esMedia ? "no tiene una media mesa libre" : "está compartida; quita primero a sus expositores"}.`, "error");
    return;
  }
  const conflictingTables = esMedia ? [] : mesasSeleccionadas.filter((table) => estado(table).others.length);
  if (conflictingTables.length && !await appConfirm(
    `${conflictingTables.map((table) => table.name).join(", ")} ya tienen otro expositor. Se moverán a ${String(data["exp-negocio"]).trim() || "este expositor"}. ¿Continuar?`,
    "Reasignar mesas",
    "Reasignar"
  )) return;
  let areaRoleId = data["exp-area-encargada"];
  let areaRole = bz.roles.find((role) => role.id === areaRoleId);
  if (areaRoleId === "__legacy_area") {
    const legacyArea = existing?.areaEncargada?.trim() || "";
    areaRole = bz.roles.find((role) => role.nombre.trim().toLowerCase() === legacyArea.toLowerCase());
    if (!areaRole && legacyArea) {
      areaRole = { id: `rol-${Date.now()}`, nombre: legacyArea, color: "#0d9488" };
      bz.roles.push(areaRole);
    }
    areaRoleId = areaRole?.id || "";
  }
  const expData = {
    ...(existing || {}),   // conserva campos que el formulario no maneja
    id:             id || "exp-" + Date.now(),
    nombre:         String(data["exp-nombre"]).trim(),
    negocio:        String(data["exp-negocio"]).trim(),
    categoria:      selectedCategoryId,
    caracteristicas,
    diasParticipacion,
    ubicacion:      existing?.ubicacion || "",
    tableId:        "",
    tableIds:       [],
    mesasCantidad:  esMedia ? "1" : data["exp-mesas-cantidad"],
    mesasCantidadOtro: esMedia ? "" : String(data["exp-mesas-otro"]).trim(),
    mesaTipo:       esMedia ? "media" : "completa",
    color:          data["exp-color-enabled"] && /^#[0-9a-f]{6}$/i.test(String(data["exp-color"] || "")) ? data["exp-color"] : "",
    sillasPorMesa: chairsPerTable,
    sillasIncluidas: chairCount,
    sillasExtraCantidad: extraChairCount,
    sillasCantidad: chairCount + extraChairCount,
    costoBase: baseCost,
    costoSillaExtra: extraChairUnitCost,
    costoExtraSillas: Math.round(extraChairCost * 100) / 100,
    areaRolId:      areaRoleId,
    areaEncargada:  areaRole?.nombre || "",
    encargadoId:   data["exp-encargado"],
    tel:            String(data["exp-tel"]).trim(),
    email:          String(data["exp-email"]).trim(),
    costo:          finalCost,
    adelanto:       Number(data["exp-adelanto"] || 0),
    descuento:      Math.max(0, Number(data["exp-descuento"] || 0)),
    notaCredito:    String(data["exp-notas-credito"]).trim(),
    fechaLimitePago: data["exp-fecha-limite"] || "",
    pagado:         data["exp-pagado"],
    notas:          String(data["exp-notas"]).trim(),
    foto:           data["exp-foto-base64"],
    publicationStatus: existing?.publicationStatus || "pendiente",
    banned:         existing?.banned || false,
    checklist:      existing ? existing.checklist : defaultChecklistItems(),
    historial:      [...(existing?.historial || [])],   // copia: si algo falla, el original queda intacto
  };
  if (expData.encargadoId && !bz.responsables.some((person) =>
    person.id === expData.encargadoId && person.rolId === areaRoleId
  )) {
    showToast("El encargado debe pertenecer al área seleccionada.", "error");
    return;
  }

  // ── Instantánea para deshacer si algo falla (asignación de mesas o guardado) ──
  const prevList = bz.expositores.slice();
  const prevTables = allTables.map((table) => ({ table, snap: { exhibitorId: table.exhibitorId, exhibitorId2: table.exhibitorId2, shared: table.shared, color: table.color, attended: table.attended, absent: table.absent, attended2: table.attended2, absent2: table.absent2 } }));
  const prevOwners = bz.expositores.map((item) => ({
    item, tableId: item.tableId, tableIds: [...(item.tableIds || [])], ubicacion: item.ubicacion
  }));
  const rollback = () => {
    bz.expositores = prevList;
    prevTables.forEach(({ table, snap }) => { Object.assign(table, snap); });
    prevOwners.forEach(({ item, tableId, tableIds: ids, ubicacion }) => {
      item.tableId = tableId; item.tableIds = ids; item.ubicacion = ubicacion;
    });
  };

  if (id) {
    const idx = bz.expositores.findIndex((x) => x.id === id);
    if (idx !== -1) {
      const changes = describeExpositorChanges(bz.expositores[idx], expData);
      bz.expositores[idx] = expData;
      if (changes.length) registrarHistorial(expData.id, `Editado — ${changes.join("; ")}`, bz);
    }
  } else {
    bz.expositores.push(expData);
    registrarHistorial(expData.id, "Expositor registrado", bz);
  }

  if (!applyExpositorTableAssignments(bz, expData, tableIds)) { rollback(); return; }
  if (!saveState()) {
    rollback();   // no se pudo guardar: no dejar al expositor "fantasma" en pantalla
    renderAll();
    showToast("⚠️ No se guardó: el almacenamiento está lleno. Quita la foto o exporta un respaldo y libera espacio.", "error");
    return;
  }
  renderAll();
  _expositorFormInitialSnapshot = JSON.stringify(syncExpositorFormData());
  closeModal("modal-expositor");
  const savedMessage = id ? "✅ Expositor actualizado" : "✅ Expositor registrado";
  showToast(hasExtraChairs && !hasExtraChairDetails
    ? `${savedMessage}. Indica cuántas sillas extra requiere para calcular el cargo.`
    : savedMessage);
}

function togglePaymentStatus(id) {
  const exp = getActiveBazaar().expositores.find((e) => e.id === id);
  if (exp) {
    exp.pagado = !exp.pagado;
    registrarHistorial(exp.id, exp.pagado ? "Marcado como pagado" : "Marcado como pendiente de pago");
    saveState();
    renderAll();
    showToast(`${exp.negocio}: marcado como ${exp.pagado ? "pagado ✅" : "pendiente ⏳"}`);
  }
}

async function deleteExpositor(id) {
  if (!await appConfirm("¿Eliminar este expositor del bazar?", "Eliminar expositor")) return;
  const bz = getActiveBazaar();
  (bz.floors || []).forEach((floor) => {
    (floor.tables || []).forEach((table) => {
      const slot = tableSlotOf(table, id);
      if (slot) {
        setTableSlot(table, slot, ""); resetTableSlotAttendance(table, slot);
        if (!tableOwnerIds(table).length) table.shared = false;
      }
    });
  });
  bz.expositores = bz.expositores.filter((e) => e.id !== id);
  saveState();
  renderAll();
  showToast("🗑️ Expositor eliminado");
}
