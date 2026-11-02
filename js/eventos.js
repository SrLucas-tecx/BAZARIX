/**
 * EXPOSITORES.COM — eventos.js
 * Estado de publicación del bazar, ban de expositores, Minuto a Minuto (agenda del evento)
 * Dependencias: state.js, utils.js
 */

const PUBLICATION_STATUSES = ["pendiente", "parcial", "lista", "publicada"];
const PUBLICATION_LABELS = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  lista: "Lista",
  publicada: "Publicada"
};

function publicationStatusLabel(status) {
  return PUBLICATION_LABELS[status] || PUBLICATION_LABELS.pendiente;
}

function cyclePublicationStatus(id) {
  const exp = getActiveBazaar()?.expositores.find((item) => item.id === id);
  if (!exp) return;
  const currentIndex = PUBLICATION_STATUSES.indexOf(exp.publicationStatus || "pendiente");
  exp.publicationStatus = PUBLICATION_STATUSES[(currentIndex + 1) % PUBLICATION_STATUSES.length];
  registrarHistorial(exp.id, `Publicación: ${publicationStatusLabel(exp.publicationStatus)}`);
  saveState();
  renderExpositores();
  showToast(`📣 ${exp.negocio}: ${publicationStatusLabel(exp.publicationStatus)}`);
}

async function toggleExpositorBan(id) {
  const exp = getActiveBazaar()?.expositores.find((item) => item.id === id);
  if (!exp) return;
  const action = exp.banned ? "quitar el baneo a" : "banear a";
  if (!await appConfirm(`¿Deseas ${action} "${exp.negocio}"?`, exp.banned ? "Quitar baneo" : "Banear expositor")) return;
  exp.banned = !exp.banned;
  registrarHistorial(exp.id, exp.banned ? "Expositor baneado" : "Baneo retirado");
  saveState();
  renderExpositores();
  showToast(exp.banned ? "🚫 Expositor baneado" : "✅ Baneo retirado");
}

// "HH:MM" → minutos desde medianoche (null si no es válido)
function _minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Duración legible entre hora inicio y hora fin: "3 min", "1 h 30 min". "" si falta alguna, "—" si es inválida. */
function minuteDuration(start, end) {
  const a = _minutesOf(start), b = _minutesOf(end);
  if (a === null || b === null) return "";
  const diff = b - a;
  if (diff < 0) return "—";
  if (diff < 60) return `${diff} min`;
  const h = Math.floor(diff / 60), m = diff % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function minuteAreaOptionsHTML(selectedArea) {
  const categories = getCategoriasPrincipales();
  const selectedCategory = categories.find((category) =>
    category.id === selectedArea || category.nombre === selectedArea
  );
  const selectedValue = selectedCategory?.nombre || selectedArea || "";
  const options = categories.map((category) =>
    `<option value="${escapeHTML(category.nombre)}" ${category.nombre === selectedValue ? "selected" : ""}>${escapeHTML(`${category.emoji || ""} ${category.nombre}`.trim())}</option>`
  );

  if (selectedValue && !selectedCategory) {
    options.unshift(`<option value="${escapeHTML(selectedValue)}" selected>${escapeHTML(selectedValue)} (actual)</option>`);
  }
  return `<option value="" ${selectedValue ? "" : "selected"}>-- Seleccionar área --</option>${options.join("")}`;
}

// ==========================================
// MINUTO A MINUTO POR DÍA
// row.dia = id de un día de bz.evento.dias; "" = se repite todos los días.
// Si el bazar dura 1 día, la columna y las pestañas no existen.
// ==========================================
function minutoDiaId(row, bz = getActiveBazaar()) {
  return row?.dia && bz?.evento?.dias?.some((d) => d.id === row.dia) ? row.dia : "";
}

function minutoDiaIndex(row, bz = getActiveBazaar()) {
  const id = minutoDiaId(row, bz);
  return id ? bz.evento.dias.findIndex((d) => d.id === id) : -1;
}

function minutoDiaLabel(row, bz = getActiveBazaar()) {
  const index = minutoDiaIndex(row, bz);
  return index < 0 ? "Todos los días" : getDiaLabel(bz.evento.dias[index], index);
}

/** Pestaña activa: "all" (todo el evento) o el id de un día. */
function minutoDiaActual(bz = getActiveBazaar()) {
  if (!bazarEsMultiDia(bz)) return "all";
  return bz.evento.dias.some((d) => d.id === AppState.minutoDia) ? AppState.minutoDia : "all";
}

function minuteRowsVisible(bz = getActiveBazaar()) {
  const rows = bz?.minuteByMinute || [];
  const selected = minutoDiaActual(bz);
  return selected === "all" ? rows : rows.filter((row) => !minutoDiaId(row, bz) || row.dia === selected);
}

function setMinutoDia(id) {
  AppState.minutoDia = id || "all";
  saveState();
  renderMinuteByMinute();
}

function renderMinuteTabs(bz) {
  const box = document.getElementById("minuto-dias-tabs");
  if (!box) return;
  const multi = bazarEsMultiDia(bz);
  box.hidden = !multi;
  if (!multi) return;
  const selected = minutoDiaActual(bz);
  const rows = bz.minuteByMinute || [];
  const tab = (id, label, count) =>
    `<button type="button" class="filter-chip ${selected === id ? "active" : ""}" onclick="setMinutoDia('${id}')">${escapeHTML(label)} (${count})</button>`;
  box.innerHTML = tab("all", "Todo el evento", rows.length) + bz.evento.dias.map((d, i) =>
    tab(d.id, getDiaLabel(d, i), rows.filter((row) => !minutoDiaId(row, bz) || row.dia === d.id).length)).join("");
}

function minuteDiaOptionsHTML(selectedId, bz = getActiveBazaar()) {
  return `<option value="">Todos los días</option>` + (bz?.evento?.dias || []).map((d, i) =>
    `<option value="${escapeHTML(d.id)}" ${d.id === selectedId ? "selected" : ""}>${escapeHTML(getDiaLabel(d, i))}</option>`).join("");
}

function renderMinuteByMinute() {
  const container = document.getElementById("minute-by-minute-list");
  const bz = getActiveBazaar();
  if (!container || !bz) return;
  if (!Array.isArray(bz.minuteByMinute)) bz.minuteByMinute = [];
  const multi = bazarEsMultiDia(bz);
  const diaHeader = document.getElementById("minuto-dia-th");
  if (diaHeader) diaHeader.hidden = !multi;
  renderMinuteTabs(bz);

  const rows = minuteRowsVisible(bz);
  if (!rows.length) {
    container.innerHTML = `<tr><td colspan="${multi ? 9 : 8}" style="text-align:center;color:var(--color-text-muted);padding:24px;">Sin actividades programadas${multi && minutoDiaActual(bz) !== "all" ? " para este día" : ""}.</td></tr>`;
    return;
  }
  container.innerHTML = rows.map((row) => {
    const duration = minuteDuration(row.time, row.horaFin);
    return `
    <tr>
      ${multi ? `<td class="minute-dia-cell"><select class="form-select" aria-label="Día de la actividad" onchange="updateMinuteRow('${row.id}','dia',this.value)">${minuteDiaOptionsHTML(minutoDiaId(row, bz), bz)}</select></td>` : ""}
      <td><input class="form-input" type="time" value="${escapeHTML(row.time)}" onchange="updateMinuteRow('${row.id}','time',this.value)"></td>
      <td><input class="form-input" type="time" value="${escapeHTML(row.horaFin || "")}" onchange="updateMinuteRow('${row.id}','horaFin',this.value)"></td>
      <td>
        <input class="form-input" type="text" value="${escapeHTML(duration)}" placeholder="—"
          readonly aria-label="Duración calculada"
          style="font-weight:700;color:${duration === "—" ? "var(--color-danger)" : "var(--color-accent)"};cursor:default;"
          title="${duration === "—" ? "La hora fin es anterior a la de inicio" : "Calculada automáticamente"}">
      </td>
      <td><input class="form-input" value="${escapeHTML(row.activity)}" onchange="updateMinuteRow('${row.id}','activity',this.value)"></td>
      <td><input class="form-input" value="${escapeHTML(row.lugar || "")}" placeholder="Ej. Auditorio" onchange="updateMinuteRow('${row.id}','lugar',this.value)"></td>
      <td>${responsableCellHTML("minuto", row, bz)}</td>
      <td>${notePreviewHTML(row.notes, "actividad", row.id)}</td>
      <td><button class="btn-danger btn-sm" onclick="deleteMinuteRow('${row.id}')">🗑️</button></td>
    </tr>`;
  }).join("");
}

// Alta en ventana emergente (la edición posterior sigue siendo en la propia fila).
function addMinuteRow() {
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  document.getElementById("form-actividad").reset();
  fillModalResponsable("act", bz);
  const group = document.getElementById("act-dia-group");
  const select = document.getElementById("act-dia");
  const multi = bazarEsMultiDia(bz);
  if (group) group.hidden = !multi;
  if (select && multi) {
    select.innerHTML = minuteDiaOptionsHTML("", bz);
    const actual = minutoDiaActual(bz);
    select.value = actual === "all" ? "" : actual;   // la actividad nace en el día que estás viendo
  }
  openModal("modal-actividad");
  setTimeout(() => document.getElementById("act-actividad")?.focus(), 50);
}

function saveActividadHandler(e) {
  e.preventDefault();
  const bz = getActiveBazaar();
  if (!bz) return;
  if (!Array.isArray(bz.minuteByMinute)) bz.minuteByMinute = [];
  const respAct = readModalResponsable("act");
  const dia = bazarEsMultiDia(bz) ? (document.getElementById("act-dia")?.value || "") : "";
  bz.minuteByMinute.push({
    id: `minute-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    dia: bz.evento.dias.some((d) => d.id === dia) ? dia : "",
    time: document.getElementById("act-inicio").value,
    horaFin: document.getElementById("act-fin").value,
    activity: document.getElementById("act-actividad").value.trim(),
    lugar: document.getElementById("act-lugar").value.trim(),
    ...respAct,
    area: getItemRolNombre(respAct, bz),
    notes: document.getElementById("act-notas").value.trim()
  });
  saveState();
  closeModal("modal-actividad");
  renderMinuteByMinute();
  showToast("✅ Actividad agregada");
}

function updateMinuteRow(id, field, value) {
  const row = (getActiveBazaar()?.minuteByMinute || []).find((item) => item.id === id);
  if (!row) return;
  row[field] = value;
  saveState();
  if (["time", "horaFin", "dia"].includes(field)) renderMinuteByMinute(); // refresca duración, pestañas y contadores
}

function deleteMinuteRow(id) {
  const bz = getActiveBazaar();
  if (!bz) return;
  bz.minuteByMinute = (bz.minuteByMinute || []).filter((row) => row.id !== id);
  saveState();
  renderMinuteByMinute();
}

/** Filas de la vista actual, ordenadas por hora (en «Todo el evento», primero por día). */
function minuteRowsForExport(bz = getActiveBazaar()) {
  const byDay = bazarEsMultiDia(bz) && minutoDiaActual(bz) === "all";
  return minuteRowsVisible(bz).slice().sort((a, b) =>
    (byDay ? minutoDiaIndex(a, bz) - minutoDiaIndex(b, bz) : 0) || (a.time || "").localeCompare(b.time || ""));
}

function _minuteExportName(bz) {
  const actual = minutoDiaActual(bz);
  const i = bz.evento.dias.findIndex((d) => d.id === actual);
  return `${bz.name}${i >= 0 ? `_${getDiaLabel(bz.evento.dias[i], i)}` : ""}`.replace(/[^a-z0-9]+/gi, "_");
}

function exportarMinutoAMinutoCSV() {
  const bz = getActiveBazaar();
  if (!bz) return;
  const multi = bazarEsMultiDia(bz);
  const rows = minuteRowsForExport(bz);
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [
    [...(multi ? ["Día"] : []), "Hora inicio", "Hora fin", "Duración", "Actividad", "Lugar", "Área encargada", "Responsable", "Notas"],
    ...rows.map((row) => [...(multi ? [minutoDiaLabel(row, bz)] : []), row.time, row.horaFin, minuteDuration(row.time, row.horaFin), row.activity, row.lugar, getItemRolNombre(row, bz), getResponsableNombre(row.responsableId, bz), row.notes])
  ].map((row) => row.map(quote).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `minuto_a_minuto_${_minuteExportName(bz)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("✅ Minuto a Minuto exportado a Excel");
}

function exportarMinutoAMinutoPDF() {
  const bz = getActiveBazaar();
  if (!bz || !window.html2pdf) {
    showToast("❌ Librería PDF no disponible", "error");
    return;
  }
  const multi = bazarEsMultiDia(bz);
  const rows = minuteRowsForExport(bz);
  const actual = minutoDiaActual(bz);
  const diaIndex = bz.evento.dias.findIndex((d) => d.id === actual);
  const vista = multi ? (diaIndex >= 0 ? getDiaLabel(bz.evento.dias[diaIndex], diaIndex) : "Todo el evento") : "";
  const issuedAt = new Date().toLocaleDateString("es-MX");
  const headers = [...(multi ? ["Día"] : []), "Inicio", "Fin", "Duración", "Actividad", "Lugar", "Área", "Responsable", "Notas"];
  const widths = multi ? [8, 8, 7, 8, 18, 11, 11, 12, 17] : [9, 9, 9, 19, 13, 13, 13, 15];
  const wrapper = document.createElement("div");
  wrapper.id = "minuto-a-minuto-pdf-wrapper";
  // [FIX-3] "opacity:0" hacía que html2canvas capturara los píxeles TAL
  // COMO SE VEN — y con opacidad 0 son transparentes, por eso el PDF salía
  // en blanco. Se usa el mismo método que ya funciona en el comprobante de
  // pago (generatePDFInvoice): display:none por defecto, y display:block
  // solo un instante antes de capturar. Sin position:fixed, sin opacity,
  // sin coordenadas negativas — nada que interfiera con la captura.
  wrapper.style.cssText = "display:none;box-sizing:border-box;width:700px;padding:30px;font-family:Arial,sans-serif;background:#fff;color:#333;";
  wrapper.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0d9488;padding-bottom:15px;margin-bottom:20px;">
      <div>
        <h1 style="color:#0d9488;margin:0;font-size:22px;">PROGRAMA DEL EVENTO</h1>
        <p style="margin:5px 0 0;color:#666;font-size:13px;">BAZARIX — Gestión de Eventos</p>
      </div>
      <div style="text-align:right;">
        <div style="font-weight:bold;font-size:15px;color:#0d9488;">MINUTO A MINUTO</div>
        <div style="font-size:12px;color:#777;">Fecha: ${issuedAt}</div>
      </div>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;font-size:13px;">
      <div style="font-weight:bold;color:#0d9488;margin-bottom:5px;">Evento</div>
      <div>${escapeHTML(bz.name)}${vista ? ` — ${escapeHTML(vista)}` : ""}</div>
      <div style="color:#64748b;margin-top:4px;">Actividades programadas: ${rows.length}</div>
    </div>
    <table style="width:100%;table-layout:fixed;font-size:12px;border-collapse:collapse;">
      <colgroup>${widths.map((w) => `<col style="width:${w}%">`).join("")}</colgroup>
      <thead><tr>${headers.map((label) => `<th style="text-align:left;background:#ccfbf1;color:#0f766e;padding:9px;border-bottom:2px solid #0d9488;">${label}</th>`).join("")}</tr></thead>
      <tbody>${rows.length ? rows.map((row, index) => `<tr style="${index % 2 ? "background:#f8fafc;" : ""}page-break-inside:avoid;">${[...(multi ? [minutoDiaLabel(row, bz)] : []), row.time, row.horaFin, minuteDuration(row.time, row.horaFin), row.activity, row.lugar, getItemRolNombre(row, bz), getResponsableNombre(row.responsableId, bz), row.notes].map((value) => `<td style="padding:9px;border-bottom:1px solid #e2e8f0;vertical-align:top;word-wrap:break-word;">${escapeHTML(value || "—")}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}" style="padding:18px;text-align:center;color:#64748b;">Sin actividades programadas.</td></tr>`}</tbody>
    </table>
    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;color:#64748b;font-size:11px;text-align:center;">Documento generado por BAZARIX</div>`;
  document.body.appendChild(wrapper);
  wrapper.style.display = "block";
  window.html2pdf().set({
    margin: 10,
    filename: `minuto_a_minuto_${_minuteExportName(bz)}.pdf`,
    html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    // Evita que una fila de la tabla se corte entre dos páginas del PDF.
    pagebreak: { mode: ["css", "legacy"], avoid: ["tr"] }
  }).from(wrapper).save().then(() => wrapper.remove()).catch(() => {
    wrapper.remove();
    showToast("❌ No se pudo generar el PDF", "error");
  });
}

// ==========================================
