/**
 * EXPOSITORES.COM — charts.js
 * Gráficas Chart.js: categorías, pagos, asistencia, confirmación
 * Dependencias: state.js, utils.js
 */

// 22. GRÁFICAS (Chart.js)
// [EDITABLE: agrega más gráficas aquí siguiendo el mismo patrón]
// ==========================================
let chartCategoriesInstance   = null;
let chartPaymentsInstance     = null;
let chartCustomInstance       = null;
let chartAttendanceInstance   = null;
let chartConfirmationInstance = null;

function updateCharts() {
  if (typeof Chart === "undefined") return;
  const bz = getActiveBazaar();

  const ctxCat = document.getElementById("chart-categorias");
  if (ctxCat) {
    const categories = getCategoriasPrincipales();
    const labels = categories.map((c) => `${c.emoji} ${c.nombre}`);
    const data   = categories.map((c) => bz.expositores.filter((e) => e.categoria === c.id).length);
    const colors = categories.map((c) => c.color);
    if (chartCategoriesInstance) chartCategoriesInstance.destroy();
    chartCategoriesInstance = new Chart(ctxCat, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });
  }

  const ctxPay = document.getElementById("chart-pagos");
  if (ctxPay) {
    let paid = 0, pending = 0;
    bz.expositores.forEach((e) => {
      if (e.pagado) paid    += Number(e.costo || 0);
      else          pending += Number(e.costo || 0);
    });
    if (chartPaymentsInstance) chartPaymentsInstance.destroy();
    chartPaymentsInstance = new Chart(ctxPay, {
      type: "pie",
      data: { labels: ["Recaudado", "Pendiente"], datasets: [{ data: [paid, pending], backgroundColor: ["#10b981", "#f59e0b"] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });
  }

  // [NUEVO] Porcentaje de asistentes (invitados que asistieron vs no)
  const ctxAsist = document.getElementById("chart-asistencia");
  if (ctxAsist) {
    const invitados  = bz.invitados || [];
    const total      = invitados.length;
    const asistieron = invitados.filter((i) => i.asistio).length;
    const noAsist    = total - asistieron;
    const pct        = total ? Math.round((asistieron / total) * 100) : 0;
    const titleEl = document.getElementById("chart-asistencia-title");
    if (titleEl) titleEl.textContent = `Porcentaje de Asistencia (${pct}%)`;
    if (chartAttendanceInstance) chartAttendanceInstance.destroy();
    chartAttendanceInstance = new Chart(ctxAsist, {
      type: "doughnut",
      data: {
        labels: ["Asistieron", "No asistieron"],
        datasets: [{ data: total ? [asistieron, noAsist] : [0, 1], backgroundColor: [getAccentColor(), "#e2e8f0"] }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} (${total ? Math.round((ctx.raw / total) * 100) : 0}%)` } }
        }
      }
    });
  }

  // [NUEVO] Porcentaje de confirmación de invitados
  const ctxConf = document.getElementById("chart-confirmacion");
  if (ctxConf) {
    const invitados  = bz.invitados || [];
    const total       = invitados.length;
    const confirmados = invitados.filter((i) => i.confirmado).length;
    const sinConfirmar = total - confirmados;
    const pct = total ? Math.round((confirmados / total) * 100) : 0;
    const titleEl = document.getElementById("chart-confirmacion-title");
    if (titleEl) titleEl.textContent = `Confirmación de Invitados (${pct}%)`;
    if (chartConfirmationInstance) chartConfirmationInstance.destroy();
    chartConfirmationInstance = new Chart(ctxConf, {
      type: "doughnut",
      data: {
        labels: ["Confirmados", "Sin confirmar"],
        datasets: [{ data: total ? [confirmados, sinConfirmar] : [0, 1], backgroundColor: ["#f59e0b", "#e2e8f0"] }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom" },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} (${total ? Math.round((ctx.raw / total) * 100) : 0}%)` } }
        }
      }
    });
  }

}

// ==========================================
