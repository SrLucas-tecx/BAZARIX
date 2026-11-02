/**
 * EXPOSITORES.COM — finanzas.js
 * Tabla de pagos, stats de finanzas
 * Dependencias: state.js, utils.js
 */

function renderFinanzasTable() {
  const tbody = document.getElementById("payments-table-body");
  if (!tbody) return;
  const bz = getActiveBazaar();
  if (bz.expositores.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--color-text-muted);padding:24px;">Sin expositores en este bazar. <button class="link-inline" onclick="switchTab('expositores')">Registrar expositores</button></td></tr>`;
    return;
  }
  tbody.innerHTML = bz.expositores.map((exp) => {
    const adelanto = Number(exp.adelanto || 0);
    const saldo    = getExpositorPendingBalance(exp);
    return `
      <tr>
        <td>
          <strong>${escapeHTML(exp.negocio)}</strong><br>
          <small style="color:var(--color-text-muted);">${escapeHTML(exp.nombre)}</small>
        </td>
        <td>${escapeHTML(getExpositorLocation(exp, bz))}</td>
        <td class="${exp.pagado ? "amount-paid" : "amount-unpaid"}">${formatCurrency(exp.costo)}</td>
        <td style="color:var(--color-paid);">${formatCurrency(adelanto)}</td>
        <td style="color:${saldo > 0 ? "var(--color-unpaid)" : "var(--color-paid)"};">${formatCurrency(saldo)}</td>
        <td>
          <span class="paid-badge ${exp.pagado ? "paid" : "unpaid"}">
            ${exp.pagado ? "✅ Pagado" : "⏳ Pendiente"}
          </span>
        </td>
        <td>
          <button class="btn-secondary btn-sm" onclick="togglePaymentStatus('${exp.id}')">
            ${exp.pagado ? "Pend." : "Pagado"}
          </button>
          <button class="btn-secondary btn-sm" onclick="generatePDFInvoice('${exp.id}')">📄</button>
        </td>
      </tr>`;
  }).join("");
}

function renderFinanzasStats() {
  const bz = getActiveBazaar();
  let paidTotal = 0, pendingTotal = 0;
  bz.expositores.forEach((e) => {
    if (e.pagado) paidTotal   += Number(e.costo || 0);
    else          pendingTotal += Number(e.costo || 0);
  });
  const totalExps = bz.expositores.length;
  const pct = paidTotal + pendingTotal > 0 ? Math.round((paidTotal / (paidTotal + pendingTotal)) * 100) : 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("stat-total-paid",        formatCurrency(paidTotal));
  set("stat-total-pending",     formatCurrency(pendingTotal));
  set("stat-total-tables",      totalExps);
  set("stat-paid-percentage",   `${pct}%`);
}

// ==========================================
// 12. COSTOS DEL EVENTO
// Ahora usa Costo TOTAL en lugar de Costo Unitario como campo principal.
