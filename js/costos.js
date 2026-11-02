/**
 * EXPOSITORES.COM — costos.js
 * Panel de costos / Presupuesto del evento: mobiliario, gastos extra (concepto, comentario,
 * costo unitario × cantidad), IVA opcional y balance.
 * Dependencias: state.js, utils.js
 */

/**
 * Mobiliario: mesas, sillas y manteles. Se puede capturar por concepto o como un
 * PRECIO CONJUNTO (un solo costo por todo) que se puede desglosar en cualquier momento.
 */
const MOBILIARIO_ITEMS = [
  { key: "tables",   label: "mesas" },
  { key: "chairs",   label: "sillas" },
  { key: "manteles", label: "manteles" },
];

function _round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/** Costo de mobiliario sin IVA: el precio conjunto, o la suma de los conceptos incluidos. */
function calcMobiliarioSinIva(cfg) {
  if (cfg.conjuntoEnabled) return Math.max(0, Number(cfg.conjuntoTotal || 0));
  return MOBILIARIO_ITEMS.reduce((sum, { key }) =>
    sum + (cfg[`${key}Enabled`] ? Number(cfg[`${key}Total`] || 0) : 0), 0);
}

/**
 * Totales del presupuesto de un bazar.
 * Mobiliario nunca incluye IVA en el dato capturado (si el IVA global está
 * activo, se le suma). Cada gasto extra decide por su cuenta si su "costo
 * unitario" YA trae IVA (c.ivaIncluido = true, se calcula el sin-IVA hacia
 * atrás) o si aún no lo trae (false, se le suma si el IVA global está activo).
 */
function calcPresupuesto(bz = getActiveBazaar()) {
  const cfg = bz.costsConfig;
  const rate = cfg.ivaEnabled ? Number(cfg.ivaRate || 0) / 100 : 0;

  const mobiliarioSinIva = calcMobiliarioSinIva(cfg);
  const mobiliarioConIva = mobiliarioSinIva * (1 + rate);

  let extrasSinIva = 0, extrasConIva = 0;
  (cfg.extraCosts || []).forEach((c) => {
    const cost = Number(c.cost || 0);
    if (cfg.ivaEnabled && c.ivaIncluido) {
      extrasConIva += cost;
      extrasSinIva += rate > 0 ? cost / (1 + rate) : cost;
    } else {
      extrasSinIva += cost;
      extrasConIva += cost * (1 + rate);
    }
  });

  const subtotal = mobiliarioSinIva + extrasSinIva;
  const total = mobiliarioConIva + extrasConIva;
  return { mobiliario: mobiliarioSinIva, extras: extrasSinIva, subtotal, rate, iva: total - subtotal, total };
}

function renderCostosUI() {
  const bz  = getActiveBazaar();
  ensureEventoFields(bz);
  const cfg = bz.costsConfig;

  const get = (id) => document.getElementById(id);
  // No se pisa el campo que la persona está escribiendo.
  const setVal = (id, value) => { const el = get(id); if (el && document.activeElement !== el) el.value = value; };

  MOBILIARIO_ITEMS.forEach(({ key }) => {
    const toggle = get(`cost-toggle-${key}`);
    if (toggle) toggle.checked = Boolean(cfg[`${key}Enabled`]);
    setVal(`cost-qty-${key}`, cfg[`${key}Qty`]);
    setVal(`cost-total-${key}`, cfg[`${key}Total`]);
    const totalInput = get(`cost-total-${key}`);
    if (totalInput) totalInput.disabled = Boolean(cfg.conjuntoEnabled);   // en paquete, el costo va en el total conjunto
  });
  setVal("chairs-per-table-default", cfg.chairsPerTable);
  setVal("chair-extra-unit-price", cfg.chairExtraUnitPrice);
  setVal("table-price-default", cfg.tablePrice);
  setVal("half-table-price-default", cfg.halfTablePrice);
  const globalPricesToggle = get("global-prices-toggle");
  const globalPricesDetails = get("global-prices-details");
  const globalPricesSummary = get("global-prices-summary");
  const editingGlobalPrices = Boolean(globalPricesToggle?.checked);
  if (globalPricesDetails) globalPricesDetails.hidden = !editingGlobalPrices;
  if (globalPricesSummary) {
    globalPricesSummary.hidden = editingGlobalPrices || !cfg.globalPricesConfigured;
    globalPricesSummary.innerHTML = cfg.globalPricesConfigured ? `
      <div class="card-meta-item" style="margin-top:12px;font-size:var(--fs-sm);">
        <div><strong>Sillas incluidas por mesa:</strong> ${Number(cfg.chairsPerTable) || 0}</div>
        <div><strong>Precio por silla extra:</strong> ${formatCurrency(cfg.chairExtraUnitPrice)}</div>
        <div><strong>Precio por mesa completa:</strong> ${formatCurrency(cfg.tablePrice)}</div>
        <div><strong>Precio por media mesa:</strong> ${formatCurrency(cfg.halfTablePrice)}</div>
      </div>` : "";
  }

  // Precio conjunto
  const conjuntoToggle = get("cost-toggle-conjunto");
  if (conjuntoToggle) conjuntoToggle.checked = Boolean(cfg.conjuntoEnabled);
  const conjuntoBox = get("costos-conjunto-box");
  if (conjuntoBox) conjuntoBox.hidden = !cfg.conjuntoEnabled;
  setVal("cost-total-conjunto", cfg.conjuntoTotal);
  const incluye = get("costos-conjunto-incluye");
  if (incluye) {
    const parts = MOBILIARIO_ITEMS.filter(({ key }) => cfg[`${key}Enabled`])
      .map(({ key, label }) => `${Number(cfg[`${key}Qty`] || 0)} ${label}`);
    incluye.textContent = parts.length
      ? `El paquete incluye: ${parts.join(", ")}.`
      : "Marca en la tabla qué incluye el paquete (mesas, sillas o manteles).";
  }

  if (get("cost-toggle-iva")) get("cost-toggle-iva").checked = cfg.ivaEnabled;
  setVal("cost-iva-rate", cfg.ivaRate);

  _updateCostosCalculations(cfg);

  const extraContainer = get("extra-costs-list");
  if (extraContainer) extraContainer.innerHTML = _extraCostsTableHTML(cfg);

  const totalIncome = bz.expositores.reduce((s, e) => s + Number(e.costo || 0), 0);
  const p = calcPresupuesto(bz);
  const netBalance = totalIncome - p.total;

  const summary = get("cost-summary");
  if (summary) {
    const line = (label, value, strong) => `<div style="display:flex;justify-content:space-between;${strong ? "font-weight:800;border-top:1px solid var(--color-border);padding-top:6px;margin-top:4px;" : ""}"><span>${label}</span><span>${formatCurrency(value)}</span></div>`;
    summary.innerHTML = `
      <div class="card-meta-item" style="margin-top:12px;font-size:var(--fs-sm);">
        ${line("Subtotal sin IVA", p.subtotal, false)}
        ${cfg.ivaEnabled ? line(`IVA (${Number(cfg.ivaRate || 0)}%)`, p.iva, false) : ""}
        ${line(cfg.ivaEnabled ? "Total con IVA" : "Total egresos", p.total, true)}
      </div>`;
  }

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("cost-stat-income",   formatCurrency(totalIncome));
  set("cost-stat-expenses", formatCurrency(p.total));
  set("cost-stat-balance",  formatCurrency(netBalance));
}

function toggleGlobalPrices(editing) {
  const bz = getActiveBazaar();
  const toggle = document.getElementById("global-prices-toggle");
  if (!bz || !toggle) return;
  toggle.checked = Boolean(editing);
  if (editing) bz.costsConfig.globalPricesConfigured = true;
  saveState();
  renderCostosUI();
}

function _updateCostosCalculations(cfg) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  MOBILIARIO_ITEMS.forEach(({ key }) => {
    const enabled = Boolean(cfg[`${key}Enabled`]);
    if (cfg.conjuntoEnabled) {
      // En paquete no hay costo por concepto: solo se indica si está incluido.
      set(`unit-${key}`,     "—");
      set(`subtotal-${key}`, enabled ? "En paquete" : "—");
      return;
    }
    const qty = Number(cfg[`${key}Qty`] || 0);
    const subtotal = enabled ? Number(cfg[`${key}Total`] || 0) : 0;
    set(`unit-${key}`,     formatCurrency(qty > 0 ? subtotal / qty : 0));
    set(`subtotal-${key}`, formatCurrency(subtotal));
  });
}

function updateEventCostsUI() {
  const bz = getActiveBazaar();
  const cfg = bz.costsConfig;
  const get = (id) => document.getElementById(id);
  const previousChairPrice = Number(cfg.chairExtraUnitPrice) || 0;

  MOBILIARIO_ITEMS.forEach(({ key }) => {
    const toggle = get(`cost-toggle-${key}`);
    const qty = get(`cost-qty-${key}`);
    const total = get(`cost-total-${key}`);
    if (toggle) cfg[`${key}Enabled`] = toggle.checked;
    if (qty)    cfg[`${key}Qty`]     = Math.max(0, Number(qty.value || 0));
    if (total)  cfg[`${key}Total`]   = Math.max(0, Number(total.value || 0));
  });
  const conjunto = get("cost-total-conjunto");
  if (conjunto) cfg.conjuntoTotal = Math.max(0, Number(conjunto.value || 0));

  const chairsPerTable = Number(get("chairs-per-table-default")?.value);
  cfg.chairsPerTable = Number.isSafeInteger(chairsPerTable) && chairsPerTable >= 0 ? chairsPerTable : 2;
  const chairPrice = Number(get("chair-extra-unit-price")?.value);
  cfg.chairExtraUnitPrice = Number.isFinite(chairPrice) ? Math.round(Math.max(0, chairPrice) * 100) / 100 : 0;
  const precioMesa = Number(get("table-price-default")?.value);
  cfg.tablePrice = Number.isFinite(precioMesa) ? Math.round(Math.max(0, precioMesa) * 100) / 100 : 0;
  const precioMedia = Number(get("half-table-price-default")?.value);
  cfg.halfTablePrice = Number.isFinite(precioMedia) ? Math.round(Math.max(0, precioMedia) * 100) / 100 : 0;
  const chairPriceChanged = cfg.chairExtraUnitPrice !== previousChairPrice;
  if (chairPriceChanged) applyGlobalChairExtraPrice(bz);

  cfg.ivaEnabled = get("cost-toggle-iva")?.checked || false;
  const rate = Number(get("cost-iva-rate")?.value);
  cfg.ivaRate = Number.isFinite(rate) ? Math.max(0, Math.min(100, rate)) : 16;

  saveState();
  renderCostosUI();
  renderFichaResumen();
  if (chairPriceChanged) {
    renderExpositores();
    renderFinanzasTable();
    renderFinanzasStats();
    renderFichaResumen(bz);
  }
}

// Alta en ventana emergente. El gasto nuevo se inserta al INICIO de la lista.
function addExtraCostRow() {
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  document.getElementById("form-gasto").reset();
  updateGastoUnitHint();
  const ivaGroup = document.getElementById("gasto-iva-group");
  if (ivaGroup) ivaGroup.style.display = bz.costsConfig.ivaEnabled ? "" : "none";   // solo tiene sentido con IVA activo
  openModal("modal-gasto");
  setTimeout(() => document.getElementById("gasto-nombre")?.focus(), 50);
}

// Muestra en vivo el costo unitario (total ÷ cantidad) mientras se llena el formulario.
function updateGastoUnitHint() {
  const hint = document.getElementById("gasto-unit-hint");
  if (!hint) return;
  const total = Math.max(0, Number(document.getElementById("gasto-total")?.value) || 0);
  const qty = Math.max(1, Number(document.getElementById("gasto-qty")?.value) || 1);
  hint.textContent = `Costo unitario: ${formatCurrency(total / qty)}`;
}

function saveGastoHandler(e) {
  e.preventDefault();
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  const cfg = bz.costsConfig;
  const total = Math.max(0, Number(document.getElementById("gasto-total").value) || 0);
  const qty = Math.max(1, Number(document.getElementById("gasto-qty").value) || 1);
  const unit = total / qty;
  cfg.extraCosts.unshift({
    id: `cost-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: document.getElementById("gasto-nombre").value.trim(),
    comment: document.getElementById("gasto-comentario").value.trim(),
    unit, qty, cost: total,
    ivaIncluido: cfg.ivaEnabled && document.getElementById("gasto-iva-incluido").checked
  });
  saveState();
  closeModal("modal-gasto");
  renderCostosUI();
  renderFichaResumen();
  showToast("✅ Gasto agregado al inicio de la lista");
}

function updateExtraCost(id, field, value) {
  const item = getActiveBazaar().costsConfig.extraCosts.find((c) => c.id === id);
  if (!item || !["name", "comment", "cost", "unit", "qty", "ivaIncluido"].includes(field)) return;
  if (field === "cost") {
    // El usuario captura el COSTO TOTAL; el unitario se calcula (total ÷ cantidad).
    item.cost = Math.max(0, Number(value) || 0);
    item.qty = Math.max(1, Number(item.qty) || 1);
    item.unit = item.cost / item.qty;
  } else if (field === "qty") {
    // Al cambiar la cantidad el total se conserva y cambia el unitario.
    item.qty = Math.max(1, Number(value) || 1);
    item.unit = Number(item.cost || 0) / item.qty;
  } else if (field === "unit") {   // compatibilidad: unitario × cantidad
    item.qty = Math.max(1, Number(item.qty) || 1);
    item.unit = Math.max(0, Number(value) || 0);
    item.cost = item.unit * item.qty;
  } else if (field === "ivaIncluido") {
    item.ivaIncluido = Boolean(value);
  } else {
    item[field] = value;
  }
  saveState();
  if (["cost", "unit", "qty", "ivaIncluido"].includes(field)) renderCostosUI(); // recalcula totales y balance
  else renderFichaResumen();
}

// Autoguardado mientras se escribe (concepto y comentario), sin esperar a perder el foco.
const debouncedUpdateExtraCost = debounce(updateExtraCost, 500);

function removeExtraCostRow(id) {
  const cfg = getActiveBazaar().costsConfig;
  cfg.extraCosts = cfg.extraCosts.filter((c) => c.id !== id);
  saveState();
  renderCostosUI();
  renderCompras();      // si venía de la lista de compras, vuelve a poder enviarse
  renderFichaResumen();
}

/** Otros gastos como tabla de filas compactas (en vez de una tarjeta por gasto). */
function _extraCostsTableHTML(cfg) {
  if (!cfg.extraCosts.length) {
    return `<p class="form-hint" style="padding:var(--space-3) 0;">Aún no hay gastos adicionales. Pulsa “+ Agregar” para registrar el primero.</p>`;
  }
  const rate = cfg.ivaEnabled ? Number(cfg.ivaRate || 0) / 100 : 0;
  const rows = cfg.extraCosts.map((c) => {
    const cost = Number(c.cost || 0);
    const qty = Math.max(1, Number(c.qty) || 1);
    const unit = cost / qty;                       // el unitario siempre se calcula
    const included = cfg.ivaEnabled && !!c.ivaIncluido;
    const sinIva = included ? (rate > 0 ? cost / (1 + rate) : cost) : cost;
    const conIva = included ? cost : cost * (1 + rate);
    return `
      <tr>
        <td><input type="text" class="form-input" value="${escapeHTML(c.name)}" placeholder="Concepto" aria-label="Concepto" oninput="debouncedUpdateExtraCost('${c.id}','name',this.value)"></td>
        <td>${notePreviewHTML(c.comment, "gasto", c.id)}</td>
        <td><input type="number" class="form-input costos-num" min="0" step="0.01" value="${cost}" aria-label="Costo total" onchange="updateExtraCost('${c.id}','cost',this.value)"></td>
        <td><input type="number" class="form-input costos-num" min="1" step="1" value="${qty}" aria-label="Cantidad" onchange="updateExtraCost('${c.id}','qty',this.value)"></td>
        <td class="costos-total costos-unit" title="Costo total ÷ cantidad">${formatCurrency(unit)}</td>
        ${cfg.ivaEnabled ? `
        <td style="text-align:center;"><input type="checkbox" class="costos-check" ${c.ivaIncluido ? "checked" : ""} title="El costo total ya incluye IVA" aria-label="El costo total ya incluye IVA" onchange="updateExtraCost('${c.id}','ivaIncluido',this.checked)"></td>
        <td class="costos-total">${formatCurrency(conIva)}<small>sin IVA ${formatCurrency(sinIva)}</small></td>` : ""}
        <td><button class="btn-danger btn-sm" onclick="removeExtraCostRow('${c.id}')" title="Eliminar gasto" aria-label="Eliminar gasto">🗑️</button></td>
      </tr>`;
  }).join("");
  return `
    <div class="costos-table-scroll">
      <table class="payments-table costos-table">
        <thead><tr><th>Concepto</th><th>Comentario</th><th>Costo total</th><th>Cant.</th><th title="Costo total ÷ cantidad">Unitario</th>${cfg.ivaEnabled ? `<th title="El costo total ya incluye IVA">IVA incl.</th><th>Total con IVA</th>` : ""}<th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ==========================================
// PRECIO CONJUNTO DE MOBILIARIO (mesas + sillas + manteles)
// Agrupar: suma los conceptos incluidos en un solo costo.
// Desglosar: reparte el costo conjunto entre los conceptos, proporcional a su cantidad.
// ==========================================
function agruparMobiliario() {
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  const cfg = bz.costsConfig;
  cfg.conjuntoTotal = _round2(MOBILIARIO_ITEMS.reduce((sum, { key }) =>
    sum + (cfg[`${key}Enabled`] ? Number(cfg[`${key}Total`] || 0) : 0), 0));
  cfg.conjuntoEnabled = true;
  saveState();
  renderCostosUI();
  renderFichaResumen(bz);
  showToast("📦 Mobiliario agrupado en un solo costo conjunto");
}

/** Devuelve true si se desglosó; false si no había nada que repartir o se canceló. */
async function desglosarMobiliario() {
  const bz = getActiveBazaar();
  if (!bz) return false;
  ensureEventoFields(bz);
  const cfg = bz.costsConfig;
  const items = MOBILIARIO_ITEMS.filter(({ key }) => cfg[`${key}Enabled`]);
  if (!items.length) {
    showToast("Marca qué incluye el paquete (mesas, sillas o manteles) para poder desglosarlo", "error");
    return false;
  }
  const total = _round2(cfg.conjuntoTotal);
  const names = items.map((item) => item.label).join(", ");
  if (total > 0 && !await appConfirm(
    `Se repartirán ${formatCurrency(total)} entre ${names}, de forma proporcional a su cantidad. Después podrás ajustar el costo de cada concepto.`,
    "Desglosar paquete", "Desglosar"
  )) return false;

  const weights = items.map(({ key }) => Math.max(0, Number(cfg[`${key}Qty`] || 0)));
  const sumWeights = weights.reduce((a, b) => a + b, 0);
  let rest = total;
  items.forEach(({ key }, i) => {
    const weight = sumWeights > 0 ? weights[i] / sumWeights : 1 / items.length;
    const share = i === items.length - 1 ? Math.max(0, rest) : _round2(total * weight);
    cfg[`${key}Total`] = share;
    rest = _round2(rest - share);
  });
  cfg.conjuntoEnabled = false;
  saveState();
  renderCostosUI();
  renderFichaResumen(bz);
  showToast("✂️ Paquete desglosado: ajusta el costo de cada concepto si hace falta");
  return true;
}

async function toggleMobiliarioConjunto(checked) {
  if (checked) agruparMobiliario();
  else if (!await desglosarMobiliario()) renderCostosUI();   // cancelado: el interruptor vuelve a su estado
}


/** Pone el costo base de los expositores según los precios globales (mesa completa × mesas, o media mesa). */
async function applyGlobalTablePricesToExpositores() {
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  const cfg = bz.costsConfig;
  const precioDe = (exp) => _round2(exp.mesaTipo === "media"
    ? Number(cfg.halfTablePrice || 0)
    : Number(cfg.tablePrice || 0) * getExpositorRequestedTableCount(exp));
  const afectados = bz.expositores.filter((exp) => precioDe(exp) > 0 && precioDe(exp) !== _round2(exp.costoBase));
  if (!afectados.length) {
    showToast("No hay expositores por actualizar con los precios actuales");
    return;
  }
  if (!await appConfirm(
    `Se actualizará el costo base de ${afectados.length} expositor(es) con los precios globales de mesa y media mesa. Los descuentos, adelantos y sillas extra se conservan.`,
    "Aplicar precios globales", "Aplicar")) return;
  afectados.forEach((exp) => {
    const antes = exp.costoBase;
    exp.costoBase = precioDe(exp);
    exp.costo = _round2(exp.costoBase + Number(exp.costoExtraSillas || 0));
    registrarHistorial(exp.id, `Costo base: ${formatCurrency(antes)} → ${formatCurrency(exp.costoBase)} (precio global)`, bz);
  });
  saveState();
  renderAll();
  showToast(`✅ Costo base actualizado en ${afectados.length} expositor(es)`);
}
