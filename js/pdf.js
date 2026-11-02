/**
 * EXPOSITORES.COM — pdf.js
 * Generación de comprobante PDF por expositor (html2pdf)
 * Dependencias: state.js, utils.js
 */

// 15. PDF — Comprobante con adelanto y saldo
// ==========================================
/**
 * Genera un PDF a partir de un elemento YA agregado al documento.
 * Sube la página al inicio antes de capturar (html2canvas usa el scroll de la
 * página: si no estaba arriba, el PDF salía con hueco arriba y cortado abajo) y
 * restaura el scroll al terminar. Nota: html{scroll-behavior:smooth} haría que
 * scrollTo animara, por eso se usa behavior "instant".
 */
function renderElementToPDF(element, opt = {}) {
  const prevX = window.scrollX, prevY = window.scrollY;
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  const restore = () => window.scrollTo({ top: prevY, left: prevX, behavior: "instant" });
  const options = {
    ...opt,
    html2canvas: { backgroundColor: "#ffffff", ...(opt.html2canvas || {}), scrollX: 0, scrollY: 0 }
  };
  return new Promise((resolve, reject) => {
    window.html2pdf().set(options).from(element).save()
      .then(() => { restore(); resolve(); })
      .catch((err) => { restore(); reject(err); });
  });
}

async function generatePDFInvoice(id) {
  const exp = getActiveBazaar()?.expositores.find((e) => e.id === id);
  if (!exp) return;
  const template = document.getElementById("invoice-template");
  if (!template) return;

  if (!window.html2pdf) {
    await appAlert("Librería html2pdf no disponible.", "No se pudo generar el PDF");
    return;
  }

  const adelanto   = Number(exp.adelanto || 0);
  const descuento  = Math.max(0, Number(exp.descuento || 0));
  const saldo      = getExpositorPendingBalance(exp);
  const totalNeto  = Math.max(0, Number(exp.costo || 0) - descuento);
  const mesas      = Math.max(1, Math.floor(Number(exp.mesasCantidad === "otro" ? exp.mesasCantidadOtro : exp.mesasCantidad || 1) || 1));
  const sillas     = Number(exp.sillasCantidad || 0);

  const set = (sid, html) => { const el = document.getElementById(sid); if (el) el.innerHTML = html; };

  set("pdf-invoice-id",    `FOLIO #${String(exp.id).slice(-4).toUpperCase()}`);
  set("pdf-invoice-date",  `Fecha: ${new Date().toLocaleDateString("es-MX")}`);
  set("pdf-exp-negocio",   `<strong>Marca / Negocio:</strong> ${escapeHTML(exp.negocio)}`);
  set("pdf-exp-nombre",    `<strong>Titular:</strong> ${escapeHTML(exp.nombre)}`);
  set("pdf-exp-contact",   `<strong>Contacto:</strong> ${escapeHTML(exp.tel || "—")} | ${escapeHTML(exp.email || "—")}`);
  // Se usa la ubicación vigente en el plano (antes salía el texto guardado, que podía estar desactualizado).
  set("pdf-exp-mesa",      `<strong>Ubicación y mobiliario:</strong> ${escapeHTML(getExpositorLocation(exp))} · ${exp.mesaTipo === "media" ? "media mesa" : `${mesas} mesa(s)`} · ${sillas} silla(s)`);
  const costBreakdown = Number(exp.sillasExtraCantidad || 0) > 0
    ? ` (base ${formatCurrency(exp.costoBase)} + ${Number(exp.sillasExtraCantidad)} silla(s) extra × ${formatCurrency(exp.costoSillaExtra)})`
    : "";
  set("pdf-exp-costo",     `<strong>Costo Total:</strong> ${formatCurrency(exp.costo)}${costBreakdown}`);
  set("pdf-exp-descuento", descuento > 0
    ? `<strong>Descuento aplicado:</strong> -${formatCurrency(descuento)}${exp.notaCredito ? ` (${escapeHTML(exp.notaCredito)})` : ""}`
    : "");
  set("pdf-exp-adelanto",  `<strong>Adelanto Entregado:</strong> ${formatCurrency(adelanto)}`);
  set("pdf-exp-saldo",     `<strong>Saldo Restante:</strong> ${formatCurrency(saldo <= 0 ? 0 : saldo)}`);
  set("pdf-exp-fecha-limite", exp.fechaLimitePago
    ? `<strong>Fecha Límite de Pago:</strong> ${escapeHTML(exp.fechaLimitePago)}`
    : "");
  set("pdf-exp-status",
    exp.pagado
      ? `<strong>Estado:</strong> <span style="color:#10b981;font-weight:800;">✅ PAGO COMPLETO</span>`
      : adelanto > 0
        ? `<strong>Estado:</strong> <span style="color:#f59e0b;font-weight:800;">🕐 CON ADELANTO — SALDO PENDIENTE</span>`
        : `<strong>Estado:</strong> <span style="color:#ef4444;font-weight:800;">⏳ PENDIENTE DE PAGO</span>`
  );

  // Monto principal: si pagó todo = total (con descuento); si no = saldo
  const montoEl = document.getElementById("pdf-exp-monto");
  if (montoEl) {
    montoEl.textContent = formatCurrency(exp.pagado ? totalNeto : (saldo > 0 ? saldo : totalNeto));
    montoEl.title = exp.pagado ? "Pago total" : "Saldo pendiente";
  }

  // Se captura una COPIA con ancho fijo (la plantilla original sigue oculta).
  const copy = template.cloneNode(true);
  copy.removeAttribute("id");
  copy.style.cssText = "display:block;box-sizing:border-box;width:700px;padding:30px;font-family:Arial,sans-serif;background:#fff;color:#333;";
  document.body.appendChild(copy);

  try {
    await renderElementToPDF(copy, {
      margin: 10,
      filename: `Comprobante_${exp.negocio.replace(/\s+/g, "_")}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["avoid-all"] }
    });
    showToast("✅ Comprobante descargado");
  } catch (err) {
    console.error(err);
    showToast("❌ No se pudo generar el comprobante", "error");
  } finally {
    copy.remove();
  }
}

// ==========================================
// 16. CHECKLIST DEL EXPOSITOR (editar texto + eliminar + agregar)
