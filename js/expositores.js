/**
 * EXPOSITORES.COM — expositores.js
 * Render de tarjetas de expositores con filtros
 * Dependencias: state.js, utils.js
 */

// 9. EXPOSITORES — Renderizado
// ==========================================
/** Apartado de color de la tarjeta: solo un chip, la tarjeta no se pinta. */
function colorChipHTML(exp) {
  return /^#[0-9a-f]{6}$/i.test(String(exp.color || ""))
    ? `<span class="exp-color-chip" title="Color propio del expositor"><i style="background:${exp.color}"></i>Color en plano</span>` : "";
}

function renderExpositorDayFilters(bz) {
  const container = document.getElementById("expositor-day-filters");
  if (!container) return;
  const multiDia = bazarEsMultiDia(bz);
  container.hidden = !multiDia;
  if (!multiDia) {
    AppState.filterExpositorDay = "all";
    container.innerHTML = "";
    return;
  }
  if (AppState.filterExpositorDay !== "all" && !bz.evento.dias.some((dia) => dia.id === AppState.filterExpositorDay)) {
    AppState.filterExpositorDay = "all";
  }
  const button = (id, label) => `
    <button type="button" class="filter-chip ${AppState.filterExpositorDay === id ? "active" : ""}"
      onclick="setFilterExpositorDay('${escapeHTML(id)}')">${escapeHTML(label)}</button>`;
  container.innerHTML = `<span class="expositor-day-filters-label">Filtrar por día:</span>
    ${button("all", "Todos los días")}
    ${bz.evento.dias.map((dia, index) => button(dia.id, getDiaLabel(dia, index))).join("")}`;
}

function setFilterExpositorDay(dayId) {
  AppState.filterExpositorDay = dayId;
  renderExpositores();
}

function renderExpositores() {
  const container = document.getElementById("expositores-grid");
  if (!container) return;
  const bz = getActiveBazaar();
  const view = ["cards", "compact", "list", "table"].includes(AppState.expositorView) ? AppState.expositorView : "cards";
  container.classList.toggle("is-compact-view", view === "compact");
  container.classList.toggle("is-list-view", view === "list");
  if (document.getElementById("modal-expositor-detalle")?.classList.contains("open")) drawExpositorDetalle();   // «Ver más» abierto: se mantiene al día
  syncExpositorViewButtons();
  renderExpositorDayFilters(bz);
  const sortSelect = document.getElementById("expositor-sort");
  if (sortSelect) sortSelect.value = AppState.expositorSort || "recent";

  const list = [...bz.expositores].reverse().filter((exp) => {
    const q = AppState.searchQuery;
    const matchQ = !q || exp.nombre.toLowerCase().includes(q) ||
                   exp.negocio.toLowerCase().includes(q) || getExpositorLocation(exp, bz).toLowerCase().includes(q);
    const matchC = AppState.filterCategory === "all" || exp.categoria === AppState.filterCategory;
    let matchS = true;
    if (AppState.filterStatus === "paid")   matchS = exp.pagado === true;
    if (AppState.filterStatus === "unpaid") matchS = exp.pagado === false;
    const matchDay = AppState.filterExpositorDay === "all" ||
      !(exp.diasParticipacion || []).length ||
      exp.diasParticipacion.includes(AppState.filterExpositorDay);
    return matchQ && matchC && matchS && matchDay;
  });
  if (AppState.expositorSort === "az" || AppState.expositorSort === "za") {
    const direction = AppState.expositorSort === "az" ? 1 : -1;
    list.sort((a, b) => direction * String(a.negocio || "").localeCompare(String(b.negocio || ""), "es", { sensitivity: "base" }));
  }

  if (list.length === 0) {
    const sinDatos = bz.expositores.length === 0;
    container.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">🗂️</span>
        <h3>${sinDatos ? "Aún no hay expositores" : "Sin resultados"}</h3>
        <p>${sinDatos
          ? `Registra al primer expositor de "${escapeHTML(bz.name)}".`
          : `No hay expositores que coincidan con los filtros en "${escapeHTML(bz.name)}".`}</p>
        ${sinDatos ? `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:16px;">
          <button class="btn-primary" onclick="openModalExpositorForCurrentCategory()">+ Nuevo expositor</button>
          ${AppState.expositorPlantillas.length ? `<button class="btn-secondary" onclick="openPickerGuardados()">💾 Traer de guardados</button>` : ""}
        </div>` : ""}
      </div>`;
    return;
  }

  if (view === "table") {
    container.innerHTML = renderExpositoresTabla(list);
    return;
  }
  if (view === "compact" || view === "list") {   // tarjeta compacta o lista en filas (mismos datos, más aire)
    container.innerHTML = renderExpositoresMini(list, bz);
    return;
  }

  container.innerHTML = renderExpositorCardsHTML(list, bz);
}

/** HTML de las tarjetas completas. Lo usan la vista Tarjetas y la ventana «Ver más». */
function renderExpositorCardsHTML(list, bz = getActiveBazaar()) {
  // Todas las tarjetas muestran los mismos campos (con "Sin dato" cuando falta uno),
  // así tienen la misma estructura y altura aunque el expositor esté incompleto.
  const meta = (label, value) => `
          <div class="card-meta-item">
            <div class="card-meta-label">${label}</div>
            <div class="card-meta-value">${value}</div>
          </div>`;

  return list.map((exp) => {
    const cat = AppState.categorias.find((c) => c.id === exp.categoria);
    const catName = getExpositorCategoryLabel(exp);
    const checklist = exp.checklist || [];
    const doneCount = checklist.filter((i) => i.done).length;
    const adelanto = Number(exp.adelanto || 0);
    const descuento = Math.max(0, Number(exp.descuento || 0));
    const saldo = getExpositorPendingBalance(exp);
    const mesas = escapeHTML(exp.mesasCantidad === "otro" ? exp.mesasCantidadOtro : exp.mesasCantidad || "1");
    const sillasExtra = Number(exp.sillasExtraCantidad || 0);
    const area = getExpositorAreaName(exp) || "Por asignar";
    const persona = exp.encargadoId ? getExpositorResponsibleName(exp) : "";
    const encargado = escapeHTML(area) + (persona ? ` · ${escapeHTML(persona)}` : "");
    const status = exp.publicationStatus || "pendiente";

    return `
      <div class="expositor-card exp-card ${exp.banned ? "banned-card" : (exp.pagado ? "paid-card" : "unpaid-card")}">
        <div class="card-top">
          <div class="avatar-wrap">
            <div class="expositor-avatar">
              ${exp.foto ? `<img src="${exp.foto}" alt="${escapeHTML(exp.nombre)}">` : escapeHTML((exp.negocio || "?").charAt(0).toUpperCase())}
            </div>
            <button class="avatar-edit-btn" onclick="openModalExpositor('${exp.id}')" title="Editar expositor" aria-label="Editar expositor">✏️</button>
          </div>
          <div class="card-info">
            <div class="card-name" title="${escapeHTML(exp.negocio)}">${escapeHTML(exp.negocio)}</div>
            <span class="card-category keep-emoji" title="${escapeHTML([cat?.descripcion].filter(Boolean).join(" · "))}">${escapeHTML(catName)}</span>
            <div class="card-contact">${escapeHTML(exp.nombre)}</div>
          </div>
        </div>

        <div class="card-badges">
          <span class="paid-badge ${exp.pagado ? "paid" : "unpaid"}">
            ${exp.pagado ? "✅ Pagado" : "⏳ Pendiente"}
          </span>
          <button class="publication-status status-${escapeHTML(status)}" onclick="cyclePublicationStatus('${exp.id}')">
            📣 Publicación: ${publicationStatusLabel(exp.publicationStatus)}
          </button>
          ${diasBadgeHTML(exp, bz)}
          ${colorChipHTML(exp)}
          ${exp.banned ? `<span class="banned-badge">🚫 Expositor baneado</span>` : ""}
        </div>

        ${caracteristicasChipsHTML(exp)}

        <div class="card-meta">
          ${meta("Ubicación", escapeHTML(getExpositorLocation(exp)))}
          ${meta(exp.mesaTipo === "media" ? "Espacio solicitado" : "Mesas solicitadas", exp.mesaTipo === "media" ? "Media mesa" : `${mesas} mesa(s)`)}
          ${meta("Sillas asignadas", `${Number(exp.sillasCantidad ?? 0)} silla(s)${sillasExtra ? `<small>incluye ${sillasExtra} extra (${formatCurrency(exp.costoExtraSillas)})</small>` : ""}`)}
          ${meta("Costo total", `${formatCurrency(exp.costo)}${descuento ? `<small>Descuento −${formatCurrency(descuento)}</small>` : ""}`)}
          ${meta("Adelanto", adelanto > 0 ? `<span style="color:var(--color-paid);">${formatCurrency(adelanto)}</span>` : `<span class="is-muted">${formatCurrency(0)}</span>`)}
          ${meta("Saldo", `<span style="color:${saldo > 0 ? "var(--color-unpaid)" : "var(--color-paid)"};">${formatCurrency(saldo)}</span>`)}
          ${meta("Fecha límite de pago", exp.fechaLimitePago ? `📅 ${escapeHTML(exp.fechaLimitePago)}` : `<span class="is-muted">Sin fecha</span>`)}
          ${meta("Encargado", encargado)}
        </div>

        <div class="card-contact exp-contact">
          <span title="${escapeHTML(exp.tel || "")}">📞 ${escapeHTML(exp.tel || "N/A")}</span>
          <span title="${escapeHTML(exp.email || "")}">✉️ ${escapeHTML(exp.email || "N/A")}</span>
          <span class="exp-notes">📝 ${notePreviewHTML(exp.notas, "expositor", exp.id)}</span>
        </div>

        <div class="card-actions">
          <div class="card-actions-main">
            <button class="btn-pay-toggle ${exp.pagado ? "mark-unpaid" : "mark-paid"}" onclick="togglePaymentStatus('${exp.id}')">
              ${exp.pagado ? "Marcar Pendiente" : "Marcar Pagado"}
            </button>
            <button class="btn-secondary btn-sm" onclick="openExpositorChecklist('${exp.id}')" title="Checklist" aria-label="Checklist">☑️ (${doneCount}/${checklist.length})</button>
          </div>
          <div class="card-actions-tools">
            <button class="btn-secondary btn-sm btn-recibo" onclick="generatePDFInvoice('${exp.id}')">📄 Recibo</button>
            <button class="btn-secondary btn-sm" onclick="openHistorial('${exp.id}')" title="Ver historial de cambios" aria-label="Ver historial de cambios">🕘</button>
            <button class="btn-secondary btn-sm" onclick="guardarComoPlantilla('${exp.id}')" title="Guardar expositor como plantilla" aria-label="Guardar expositor como plantilla">💾</button>
            <button class="${exp.banned ? "btn-secondary" : "btn-danger"} btn-sm" onclick="toggleExpositorBan('${exp.id}')">${exp.banned ? "✅ Quitar baneo" : "🚫 Banear"}</button>
            <button class="btn-danger btn-sm" onclick="deleteExpositor('${exp.id}')" title="Eliminar expositor" aria-label="Eliminar expositor">🗑️</button>
          </div>
        </div>
      </div>`;
  }).join("");
}

// ==========================================
// VISTA TARJETAS / TABLA
// ==========================================
function setExpositorView(view) {
  AppState.expositorView = ["table", "compact", "list"].includes(view) ? view : "cards";
  saveState();
  renderExpositores();
}

function setExpositorSort(sort) {
  AppState.expositorSort = ["az", "za"].includes(sort) ? sort : "recent";
  saveState();
  renderExpositores();
}

function syncExpositorViewButtons() {
  document.querySelectorAll(".view-toggle-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === (AppState.expositorView || "cards"));
  });
}

function renderExpositoresTabla(list) {
  const rows = list.map((exp) => {
    const catName = getExpositorCategoryLabel(exp);
    const saldo = getExpositorPendingBalance(exp);
    const checklist = exp.checklist || [];
    const doneCount = checklist.filter((i) => i.done).length;
    const status = exp.publicationStatus || "pendiente";
    return `
      <tr${exp.banned ? ' style="opacity:.72;"' : ""}>
        <td>
          <strong>${escapeHTML(exp.negocio)}</strong>${exp.banned ? ` <span style="color:var(--color-danger);font-weight:800;font-size:var(--fs-xs);">🚫 Baneado</span>` : ""}<br>
          <small style="color:var(--color-text-muted);">${escapeHTML(exp.nombre)}</small>${bazarEsMultiDia() ? `<br>${diasBadgeHTML(exp)}` : ""}
        </td>
        <td class="keep-emoji">${escapeHTML(catName)}${caracteristicasChipsHTML(exp)}</td>
        <td>${escapeHTML(getExpositorLocation(exp))}</td>
        <td>${formatCurrency(exp.costo)}</td>
        <td style="color:${saldo > 0 ? "var(--color-unpaid)" : "var(--color-paid)"};">${formatCurrency(saldo)}</td>
        <td><span class="paid-badge ${exp.pagado ? "paid" : "unpaid"}">${exp.pagado ? "✅ Pagado" : "⏳ Pendiente"}</span></td>
        <td><button class="publication-status status-${escapeHTML(status)}" onclick="cyclePublicationStatus('${exp.id}')">📣 ${publicationStatusLabel(status)}</button></td>
        <td class="row-actions-cell">
          <div class="row-actions">
            <button class="btn-secondary btn-sm row-action-main" onclick="togglePaymentStatus('${exp.id}')" title="${exp.pagado ? "Marcar como pendiente" : "Marcar como pagado"}">${exp.pagado ? "Pendiente" : "Pagado"}</button>
            <div class="row-actions-icons">
              <button class="btn-secondary btn-sm" onclick="openModalExpositor('${exp.id}')" title="Editar" aria-label="Editar expositor">✏️</button>
              <button class="btn-secondary btn-sm row-icon-wide" onclick="openExpositorChecklist('${exp.id}')" title="Checklist" aria-label="Checklist">☑️ ${doneCount}/${checklist.length}</button>
              <button class="btn-secondary btn-sm" onclick="generatePDFInvoice('${exp.id}')" title="Recibo" aria-label="Recibo en PDF">📄</button>
              <button class="btn-secondary btn-sm" onclick="openHistorial('${exp.id}')" title="Ver historial de cambios" aria-label="Ver historial de cambios">🕘</button>
              <button class="btn-secondary btn-sm" onclick="guardarComoPlantilla('${exp.id}')" title="Guardar expositor como plantilla" aria-label="Guardar expositor como plantilla">💾</button>
              <button class="${exp.banned ? "btn-secondary" : "btn-danger"} btn-sm" onclick="toggleExpositorBan('${exp.id}')" title="${exp.banned ? "Quitar baneo" : "Banear"}" aria-label="${exp.banned ? "Quitar baneo" : "Banear"}">${exp.banned ? "✅" : "🚫"}</button>
              <button class="btn-danger btn-sm" onclick="deleteExpositor('${exp.id}')" title="Eliminar expositor" aria-label="Eliminar expositor">🗑️</button>
            </div>
          </div>
        </td>
      </tr>`;
  }).join("");

  return `
    <div class="payments-table-wrap" style="grid-column:1/-1;">
      <table class="payments-table expositor-directory-table">
        <thead>
          <tr>
            <th>Negocio / Titular</th><th>Categoría</th><th>Ubicación</th>
            <th>Costo</th><th>Saldo</th><th>Pago</th><th>Publicación</th><th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ==========================================
// 10. CATEGORÍAS
// ==========================================

// ==========================================
// VISTAS COMPACTA Y LISTA + «VER MÁS»
// Mismos datos, filtros y orden que las demás vistas. «Ver más» abre la tarjeta completa con todas sus acciones.
// ==========================================
function renderExpositoresMini(list, bz = getActiveBazaar()) {
  return list.map((exp) => {
    const saldo = getExpositorPendingBalance(exp);
    const catName = getExpositorCategoryLabel(exp);
    const stat = (label, value) => `<div class="exp-mini-stat"><span>${label}</span><strong>${value}</strong></div>`;
    return `
      <div class="exp-mini ${exp.banned ? "banned-card" : ""}">
        <div class="exp-mini-head">
          <div class="expositor-avatar exp-mini-avatar">${exp.foto ? `<img src="${exp.foto}" alt="${escapeHTML(exp.nombre)}">` : escapeHTML((exp.negocio || "?").charAt(0).toUpperCase())}</div>
          <div class="exp-mini-title">
            <div class="exp-mini-name" title="${escapeHTML(exp.negocio)}">${escapeHTML(exp.negocio)}</div>
            <div class="exp-mini-sub keep-emoji" title="${escapeHTML(exp.nombre)}">${escapeHTML(exp.nombre)} · ${escapeHTML(catName)}</div>
            <div class="exp-mini-badges">
              <span class="exp-pill ${exp.pagado ? "ok" : "warn"}">${exp.pagado ? "✅ Pagado" : "⏳ Pendiente"}</span>
              ${exp.banned ? `<span class="exp-pill bad">🚫 Baneado</span>` : ""}
              ${diasBadgeHTML(exp, bz)}
            </div>
          </div>
        </div>
        <div class="exp-mini-stats">
          ${stat("Ubicación", escapeHTML(getExpositorLocation(exp, bz)))}
          ${stat("Costo total", formatCurrency(exp.costo))}
          ${stat("Saldo", `<span style="color:${saldo > 0 ? "var(--color-unpaid)" : "var(--color-paid)"};">${formatCurrency(saldo)}</span>`)}
        </div>
        <div class="exp-mini-actions">
          <button class="btn-primary btn-sm" onclick="openExpositorDetalle('${exp.id}')">Ver más</button>
          <button class="btn-secondary btn-sm btn-edit" onclick="openModalExpositor('${exp.id}')" title="Editar expositor" aria-label="Editar expositor">✏️</button>
        </div>
      </div>`;
  }).join("");
}

let _expDetalleId = "";

/** Dibuja (o redibuja) la tarjeta completa dentro de la ventana «Ver más». Devuelve false si ya no existe. */
function drawExpositorDetalle() {
  const body = document.getElementById("expositor-detalle-body");
  const bz = getActiveBazaar();
  const exp = bz?.expositores.find((item) => item.id === _expDetalleId);
  if (!body) return false;
  if (!exp) { closeModal("modal-expositor-detalle"); return false; }
  const title = document.getElementById("expositor-detalle-title");
  if (title) title.textContent = exp.negocio;
  body.innerHTML = renderExpositorCardsHTML([exp], bz);
  return true;
}

function openExpositorDetalle(id) {
  _expDetalleId = id;
  if (drawExpositorDetalle()) openModal("modal-expositor-detalle");
}
