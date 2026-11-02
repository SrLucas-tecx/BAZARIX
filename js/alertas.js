/**
 * BAZARIX — alertas.js
 * Notificaciones de vencimientos: pagos de expositores, tareas (Previo/Post)
 * y artículos de la lista de compras. Badge en sidebar, panel de alertas activas.
 * Dependencias: state.js, utils.js, tareas.js, compras.js
 */

// ==========================================
// ALERTAS Y FECHAS LÍMITE
// ==========================================

// Días de anticipación para mostrar alerta
const ALERT_DAYS_AHEAD = 3;

function parseAlertDate(dateValue) {
  if (!dateValue) return null;
  const parts = String(dateValue).split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setHours(0, 0, 0, 0);
  return date;
}

function _alertLabel(diffDays) {
  return diffDays < 0
    ? `Venció hace ${Math.abs(diffDays)} día${Math.abs(diffDays) !== 1 ? "s" : ""}`
    : diffDays === 0
      ? "Vence hoy"
      : `Vence en ${diffDays} día${diffDays !== 1 ? "s" : ""}`;
}

/** Vencidas o dentro de ALERT_DAYS_AHEAD, respecto a hoy. */
function _dentroDeRango(fecha, now, ahead) {
  const limit = parseAlertDate(fecha);
  if (!limit) return null;
  if (limit > ahead) return null;
  const diffDays = Math.ceil((limit - now) / 86400000);
  return { diffDays, isOverdue: diffDays < 0, label: _alertLabel(diffDays) };
}

/**
 * Devuelve los expositores con fecha límite en los próximos N días
 * o ya vencida, que no han pagado.
 */
function getExpositorAlerts(bz = getActiveBazaar()) {
  if (!bz) return [];
  const now   = new Date(); now.setHours(0,0,0,0);
  const ahead = new Date(now); ahead.setDate(now.getDate() + ALERT_DAYS_AHEAD);

  return bz.expositores
    .map((exp) => {
      if (exp.pagado || !exp.fechaLimitePago) return null;
      const r = _dentroDeRango(exp.fechaLimitePago, now, ahead);
      return r && { tipo: "pago", exp, ...r };
    })
    .filter(Boolean)
    .sort((a, b) => a.diffDays - b.diffDays);
}

/** Tareas (Previo / Post) sin terminar con fecha de entrega vencida o próxima. */
function getTareaAlerts(bz = getActiveBazaar()) {
  if (!bz) return [];
  const now   = new Date(); now.setHours(0,0,0,0);
  const ahead = new Date(now); ahead.setDate(now.getDate() + ALERT_DAYS_AHEAD);

  return (bz.tareas || [])
    .map((t) => {
      if (t.hecho || !t.fecha) return null;
      const r = _dentroDeRango(t.fecha, now, ahead);
      return r && { tipo: "tarea", t, ...r };
    })
    .filter(Boolean)
    .sort((a, b) => a.diffDays - b.diffDays);
}

/** Artículos de la lista de compras sin comprar con fecha de entrega vencida o próxima. */
function getCompraAlerts(bz = getActiveBazaar()) {
  if (!bz) return [];
  const now   = new Date(); now.setHours(0,0,0,0);
  const ahead = new Date(now); ahead.setDate(now.getDate() + ALERT_DAYS_AHEAD);

  return (bz.compras || [])
    .map((c) => {
      if (c.comprado || !c.fecha) return null;
      const r = _dentroDeRango(c.fecha, now, ahead);
      return r && { tipo: "compra", c, ...r };
    })
    .filter(Boolean)
    .sort((a, b) => a.diffDays - b.diffDays);
}

/** Las tres listas juntas, ordenadas de lo más vencido a lo más próximo. */
function getTodasLasAlertas(bz = getActiveBazaar()) {
  return [...getExpositorAlerts(bz), ...getTareaAlerts(bz), ...getCompraAlerts(bz)]
    .sort((a, b) => a.diffDays - b.diffDays);
}

/** Actualiza el badge de alertas en el sidebar */
function updateAlertBadge() {
  const alerts = getTodasLasAlertas();
  ["alert-badge", "alert-badge-nav"].forEach((id) => {
    const badge = document.getElementById(id);
    if (!badge) return;
    badge.style.display = alerts.length === 0 ? "none" : "inline-flex";
    badge.textContent = alerts.length;
  });
}

function _alertaRow({ tipo, exp, t, c, label, isOverdue }) {
  const color = isOverdue ? "var(--color-danger)" : "var(--color-accent2)";
  const icon  = isOverdue ? "🚨" : "⚠️";
  const alertClass = isOverdue ? "notification-card notification-card-overdue" : "notification-card notification-card-upcoming";

  let tipoIcon, titulo, subtitulo, detalle, acciones;
  if (tipo === "pago") {
    const saldo = getExpositorPendingBalance(exp);
    tipoIcon = "💰"; titulo = exp.negocio; subtitulo = `${exp.nombre} · ${getExpositorLocation(exp)}`;
    detalle = `${label} · Saldo: ${formatCurrency(saldo)}`;
    acciones = `
      <button class="btn-secondary btn-sm" onclick="togglePaymentStatus('${exp.id}')">💰 Marcar Pagado</button>
      <button class="btn-secondary btn-sm" onclick="openModalExpositor('${exp.id}')">✏️ Editar</button>`;
  } else if (tipo === "tarea") {
    tipoIcon = "✅"; titulo = t.actividad || "Tarea sin nombre";
    subtitulo = `Tarea ${TAREAS_FASES[t.fase]?.label || t.fase}${t.responsable ? " · " + t.responsable : ""}`;
    detalle = label;
    acciones = `
      <button class="btn-secondary btn-sm" onclick="toggleTarea('${t.id}')">✅ Marcar lista</button>
      <button class="btn-secondary btn-sm" onclick="setTareasFase('${t.fase}'); switchTab('tareas')">✏️ Editar</button>`;
  } else {
    tipoIcon = "🛒"; titulo = c.articulo || "Artículo sin nombre";
    subtitulo = `Lista de compras${c.responsable ? " · " + c.responsable : ""}`;
    detalle = label;
    acciones = `
      <button class="btn-secondary btn-sm" onclick="toggleCompra('${c.id}')">🛒 Marcar comprado</button>
      <button class="btn-secondary btn-sm" onclick="switchTab('compras')">✏️ Editar</button>`;
  }

  return `
    <div class="${alertClass}" style="border-left-color:${color};">
      <div style="min-width:0;">
        <div class="notification-card-title">
          ${icon} ${tipoIcon} ${escapeHTML(titulo)}
        </div>
        <div class="notification-card-subtitle">
          ${escapeHTML(subtitulo)}
        </div>
        <div class="notification-card-detail">
          ${escapeHTML(detalle)}
        </div>
      </div>
      <div class="notification-card-actions">
        ${acciones}
      </div>
    </div>`;
}

/** Renderiza el panel de alertas (sec-alertas) */
function renderAlertas() {
  const container = document.getElementById("alertas-list");
  if (!container) return;
  const alerts = getTodasLasAlertas();

  updateAlertBadge();

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("alertas-count-pago",  getExpositorAlerts().length);
  set("alertas-count-tarea", getTareaAlerts().length);
  set("alertas-count-compra", getCompraAlerts().length);

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="catalog-empty" style="padding:var(--space-8);">
        <span class="catalog-empty-icon">✅</span>
        <h3>Sin alertas</h3>
        <p>Pagos, tareas y compras están al día o sin fecha asignada.</p>
      </div>`;
    return;
  }

  container.innerHTML = alerts.map(_alertaRow).join("");
}

// ==========================================
