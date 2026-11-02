/**
 * BAZARIX — metricas.js
 * Sprint 1: Resumen financiero por categoría + ticket promedio
 * Dependencias: state.js, utils.js
 */

// ==========================================
// MÉTRICAS FINANCIERAS
// ==========================================

/** Ticket promedio = ingreso total / número de expositores */
function calcTicketPromedio(bz = getActiveBazaar()) {
  if (!bz || bz.expositores.length === 0) return 0;
  const total = bz.expositores.reduce((s, e) => s + Number(e.costo || 0), 0);
  return total / bz.expositores.length;
}

/** Desglose de ingresos por categoría */
function calcResumenPorCategoria(bz = getActiveBazaar()) {
  if (!bz) return [];
  return getCategoriasPrincipales().map((cat) => {
    const exps    = bz.expositores.filter((e) => e.categoria === cat.id);
    const total   = exps.reduce((s, e) => s + Number(e.costo || 0), 0);
    const cobrado = exps.filter((e) => e.pagado).reduce((s, e) => s + Number(e.costo || 0), 0);
    return { cat, count: exps.length, total, cobrado, pendiente: total - cobrado };
  }).filter((r) => r.count > 0);
}

/** Renderiza la sección de métricas (sec-estadisticas o el widget de finanzas) */
function renderMetricasFinancieras() {
  renderResumenCategorias();
  renderTicketPromedio();
  renderMetricasResumenGeneral();
}

/**
 * Panel "Métricas y Gráficas": las cifras clave del evento juntas en un
 * solo lugar (dinero, pagos, asistencia y confirmación), para no tener
 * que ir a Finanzas, Costos, Día del Evento e Invitados por separado.
 */
function renderMetricasResumenGeneral(bz = getActiveBazaar()) {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  if (!bz) return;

  const ingresos = bz.expositores.reduce((s, e) => s + Number(e.costo || 0), 0);
  const presupuesto = typeof calcPresupuesto === "function" ? calcPresupuesto(bz) : { total: 0 };
  set("metrica-ingresos", formatCurrency(ingresos));
  set("metrica-egresos",  formatCurrency(presupuesto.total));
  set("metrica-balance",  formatCurrency(ingresos - presupuesto.total));

  const paidCount = bz.expositores.filter((e) => e.pagado).length;
  const pagadoPct = bz.expositores.length ? Math.round((paidCount / bz.expositores.length) * 100) : 0;
  set("metrica-pagado-pct", `${pagadoPct}%`);

  if (typeof getDiaEventoTables === "function") {
    const entries = getDiaEventoTables(bz);
    const attended = entries.filter((e) => e.state === "attended").length;
    set("metrica-asistencia-pct", `${entries.length ? Math.round((attended / entries.length) * 100) : 0}%`);
  }

  const invitados = bz.invitados || [];
  const confirmados = invitados.filter((i) => i.confirmado).length;
  set("metrica-confirmacion-pct", `${invitados.length ? Math.round((confirmados / invitados.length) * 100) : 0}%`);
}

function renderResumenCategorias() {
  const container = document.getElementById("resumen-categorias");
  if (!container) return;
  const bz   = getActiveBazaar();
  const rows  = calcResumenPorCategoria(bz);

  if (rows.length === 0) {
    container.innerHTML = `<p style="font-size:var(--fs-xs);color:var(--color-text-muted);">Sin expositores registrados.</p>`;
    return;
  }

  const totalGlobal = rows.reduce((s, r) => s + r.total, 0);

  container.innerHTML = `
    <table class="category-summary-table">
      <thead>
        <tr style="background:var(--color-surface-alt);">
          <th style="padding:8px 10px;text-align:left;font-weight:700;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;">Categoría</th>
          <th style="padding:8px 10px;text-align:center;">Expositores</th>
          <th style="padding:8px 10px;text-align:right;">Total</th>
          <th style="padding:8px 10px;text-align:right;">Cobrado</th>
          <th style="padding:8px 10px;text-align:right;">Pendiente</th>
          <th style="padding:8px 10px;text-align:left;">%</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r) => {
          const pct = totalGlobal > 0 ? Math.round((r.total / totalGlobal) * 100) : 0;
          return `
            <tr style="border-top:1px solid var(--color-border);">
              <td style="padding:8px 10px;">
                <span style="display:inline-flex;align-items:center;gap:6px;">
                  <span style="width:10px;height:10px;border-radius:50%;background:${r.cat.color};display:inline-block;flex-shrink:0;"></span>
                  <strong>${r.cat.emoji} ${escapeHTML(r.cat.nombre)}</strong>
                </span>
              </td>
              <td style="padding:8px 10px;text-align:center;">${r.count}</td>
              <td style="padding:8px 10px;text-align:right;font-weight:700;">${formatCurrency(r.total)}</td>
              <td style="padding:8px 10px;text-align:right;color:var(--color-success);">${formatCurrency(r.cobrado)}</td>
              <td style="padding:8px 10px;text-align:right;color:${r.pendiente > 0 ? "var(--color-danger)" : "var(--color-success)"};">${formatCurrency(r.pendiente)}</td>
              <td style="padding:8px 10px;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <div style="flex:1;height:6px;background:var(--color-border);border-radius:3px;overflow:hidden;">
                    <div style="width:${pct}%;height:100%;background:${r.cat.color};border-radius:3px;transition:width .3s;"></div>
                  </div>
                  <span style="font-weight:700;min-width:28px;">${pct}%</span>
                </div>
              </td>
            </tr>`;
        }).join("")}
      </tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--color-accent);background:var(--color-surface-alt);">
          <td style="padding:8px 10px;font-weight:800;">TOTAL</td>
          <td style="padding:8px 10px;text-align:center;font-weight:800;">${rows.reduce((s, r) => s + r.count, 0)}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:800;">${formatCurrency(totalGlobal)}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:800;color:var(--color-success);">${formatCurrency(rows.reduce((s, r) => s + r.cobrado, 0))}</td>
          <td style="padding:8px 10px;text-align:right;font-weight:800;color:var(--color-danger);">${formatCurrency(rows.reduce((s, r) => s + r.pendiente, 0))}</td>
          <td style="padding:8px 10px;font-weight:800;">100%</td>
        </tr>
      </tfoot>
    </table>`;
}

function renderTicketPromedio() {
  const el = document.getElementById("stat-ticket-promedio");
  if (!el) return;
  el.textContent = formatCurrency(calcTicketPromedio());
}

// ==========================================