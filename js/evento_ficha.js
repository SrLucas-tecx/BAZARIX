/**
 * BAZARIX — evento_ficha.js
 * Ficha descriptiva del evento (equivale a la hoja "Ficha descriptiva" de la plantilla de logística)
 * y tablero resumen: días para el evento, avance de tareas, compras, presupuesto.
 * Datos: bz.evento = { fecha, objetivo, lideres, publico, asistentes, lugar, staff } (+ bz.name = nombre del evento)
 * Dependencias: state.js, utils.js, tareas.js, compras.js, costos.js
 */

// Mapa campo → id del input en index.html
const FICHA_INPUTS = {
  nombre:      "ficha-nombre",
  fecha:       "ficha-fecha",
  objetivo:    "ficha-objetivo",
  lideres:     "ficha-lideres",
  publico:     "ficha-publico",
  asistentes:  "ficha-asistentes",
  lugar:       "ficha-lugar",
  staff:       "ficha-staff",
  presupuestoBase: "ficha-presupuesto-base",
};

/** Días entre hoy y la fecha "YYYY-MM-DD" (negativo si ya pasó). null si no hay fecha válida. */
function diasParaEvento(fecha) {
  const date = typeof parseAlertDate === "function" ? parseAlertDate(fecha) : null;
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date - today) / 86400000);
}

function renderFicha() {
  const bz = getActiveBazaar();
  if (!bz || !document.getElementById("sec-ficha")) return;
  ensureEventoFields(bz);
  Object.entries(FICHA_INPUTS).forEach(([field, id]) => {
    const el = document.getElementById(id);
    if (!el || document.activeElement === el) return; // no pisar lo que se está escribiendo
    el.value = field === "nombre" ? bz.name : (bz.evento[field] ?? "");
  });
  renderFichaDias(bz);
  renderFichaResumen(bz);
  renderPanelMetricas(bz);
  renderFichaDatos(bz);
}

function updateFichaField(field, value) {
  const bz = getActiveBazaar();
  if (!bz || !(field in FICHA_INPUTS)) return;
  ensureEventoFields(bz);
  if (field === "nombre") {
    const name = String(value).trim();
    if (!name) {
      showToast("El nombre del evento no puede estar vacío", "error");
      renderFicha();
      return;
    }
    bz.name = name;
    saveState();
    renderAll(); // el nombre aparece en selector, tablas y encabezados
    return;
  }
  if (field === "presupuestoBase") {
    bz.evento[field] = value === "" ? "" : Math.max(0, Number(value) || 0);
  } else {
    bz.evento[field] = ["asistentes", "staff"].includes(field) && value !== "" ? Math.max(0, Number(value) || 0) : value;
  }
  saveState();
  renderFichaResumen(bz);
  renderFichaDatos(bz);
}

// Autoguardado mientras se escribe (campos de texto libre), sin esperar a
// que el campo pierda el foco. updateFichaField ya evita repintar el
// input activo, así que no interrumpe lo que el usuario está tecleando.
const debouncedUpdateFichaField = debounce(updateFichaField, 500);

function renderFichaResumen(bz = getActiveBazaar()) {
  const box = document.getElementById("ficha-resumen");
  if (!bz) return;
  ensureEventoFields(bz);

  const presupuesto = calcPresupuesto(bz);
  const presupuestoBase = bz.evento.presupuestoBase === "" ? null : Number(bz.evento.presupuestoBase);
  const ingresos = bz.expositores.reduce((s, e) => s + Number(e.costo || 0), 0);
  const balance = ingresos - presupuesto.total;
  const disponible = presupuestoBase === null ? null : presupuestoBase - presupuesto.total;
  if (box) {
    const item = (label, value, className = "") => `
      <div class="panel-kpi ${className}">
        <span class="panel-kpi-label">${label}</span>
        <strong class="panel-kpi-value">${escapeHTML(String(value))}</strong>
      </div>`;
    box.innerHTML =
      item("Presupuesto base", presupuestoBase === null ? "Sin definir" : formatCurrency(presupuestoBase)) +
      item("Dinero ganado", formatCurrency(ingresos), ingresos > 0 ? "panel-kpi-positive" : "") +
      item("Dinero invertido", formatCurrency(presupuesto.total)) +
      item("Saldo del presupuesto", disponible === null ? "—" : formatCurrency(disponible),
        disponible === null ? "" : disponible < 0 ? "panel-kpi-negative" : "panel-kpi-positive") +
      item("Ganancia neta", formatCurrency(balance), balance < 0 ? "panel-kpi-negative" : "panel-kpi-positive");
  }
  const status = document.getElementById("panel-budget-status");
  if (status) {
    if (presupuestoBase === null) {
      status.className = "panel-budget-status";
      status.textContent = "Define el presupuesto base en la ficha para saber si los gastos están dentro del límite.";
    } else if (disponible < 0) {
      status.className = "panel-budget-status is-over";
      status.textContent = `Presupuesto excedido por ${formatCurrency(Math.abs(disponible))}.`;
    } else if (disponible === 0) {
      status.className = "panel-budget-status is-at-limit";
      status.textContent = "Presupuesto base agotado; no queda saldo disponible.";
    } else {
      status.className = "panel-budget-status is-within";
      status.textContent = `Dentro del presupuesto; quedan ${formatCurrency(disponible)} disponibles.`;
    }
  }
  renderPanelChecklist(bz);
}

let _panelChecklistTab = "tareas";

function setPanelChecklistTab(tab) {
  if (!["tareas", "alertas"].includes(tab)) return;
  _panelChecklistTab = tab;
  ["tareas", "alertas"].forEach((name) => {
    const button = document.getElementById(`panel-tab-${name}`);
    const content = document.getElementById(`panel-content-${name}`);
    const active = name === tab;
    if (button) {
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    if (content) content.hidden = !active;
  });
}

function handlePanelTabKey(event) {
  const tabs = ["tareas", "alertas"];
  const current = tabs.indexOf(event.target.id.replace("panel-tab-", ""));
  if (current < 0) return;
  let next = current;
  if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;
  event.preventDefault();
  const tab = tabs[next];
  setPanelChecklistTab(tab);
  document.getElementById(`panel-tab-${tab}`)?.focus();
}

/** Lista hasta cuatro pendientes y alertas, priorizando los vencimientos cercanos. */
function renderPanelChecklist(bz = getActiveBazaar()) {
  const alertBox = document.getElementById("panel-alertas");
  const checklist = document.getElementById("panel-checklist");
  if (!bz || !alertBox || !checklist) return;

  const alerts = getTodasLasAlertas(bz);
  const pendingAlerts = alerts.slice(0, 4);
  const overdueAlerts = alerts.filter((alert) => alert.isOverdue).length;
  updateAlertBadge();
  alertBox.innerHTML = pendingAlerts.length
    ? pendingAlerts.map(({ tipo, exp, t, c, label, isOverdue }) => {
        let title, detail, action;
        if (tipo === "pago") {
          title = exp.negocio || "Expositor sin nombre";
          detail = `Pago pendiente · ${label}`;
          action = `<button type="button" class="btn-secondary btn-sm" onclick="togglePaymentStatus('${exp.id}')">Marcar pagado</button>`;
        } else if (tipo === "tarea") {
          title = t.actividad || "Tarea sin nombre";
          detail = `Tarea ${TAREAS_FASES[t.fase]?.label || t.fase} · ${label}`;
          action = `<button type="button" class="btn-secondary btn-sm" onclick="toggleTarea('${t.id}')">Marcar lista</button>`;
        } else {
          title = c.articulo || "Artículo sin nombre";
          detail = `Artículo por comprar · ${label}`;
          action = `<button type="button" class="btn-secondary btn-sm" onclick="toggleCompra('${c.id}')">Marcar comprado</button>`;
        }
        return `
          <div class="panel-alert-row ${isOverdue ? "panel-alert-overdue" : ""}">
            <span class="panel-alert-icon" aria-hidden="true">!</span>
            <div class="panel-alert-copy">
              <strong>${escapeHTML(title)}</strong>
              <span>${escapeHTML(detail)}</span>
            </div>
            ${action}
          </div>`;
      }).join("")
    : `<p class="panel-empty-state">No hay alertas activas.</p>`;

  const taskItems = (bz.tareas || []).filter((t) => !t.hecho).map((t) => ({
    id: t.id,
    label: t.actividad || "Tarea sin nombre",
    typeLabel: TAREAS_FASES[t.fase]?.label || t.fase,
    dueDate: t.fecha,
    type: "tarea",
    overdue: diasParaEvento(t.fecha) !== null && diasParaEvento(t.fecha) < 0
  }));
  const purchaseItems = (bz.compras || []).filter((c) => !c.comprado).map((c) => ({
    id: c.id,
    label: c.articulo || "Artículo sin nombre",
    typeLabel: "Artículo por comprar",
    dueDate: c.fecha,
    type: "compra",
    overdue: diasParaEvento(c.fecha) !== null && diasParaEvento(c.fecha) < 0
  }));
  const items = [...taskItems, ...purchaseItems].sort((a, b) => {
    const dateA = parseAlertDate(a.dueDate)?.getTime() ?? Infinity;
    const dateB = parseAlertDate(b.dueDate)?.getTime() ?? Infinity;
    return dateA - dateB;
  });
  const visibleItems = items.slice(0, 4);
  const overdueTasks = items.filter((item) => item.overdue).length;
  const updateOverdueBadge = (id, count, label) => {
    const badge = document.getElementById(id);
    const tab = badge?.closest(".panel-work-tab");
    if (!badge || !tab) return;
    badge.hidden = count === 0;
    badge.textContent = String(count);
    badge.setAttribute("aria-label", `${count} ${label} vencidas`);
    tab.classList.toggle("has-overdue", count > 0);
  };
  updateOverdueBadge("panel-alertas-overdue", overdueAlerts, "alertas");
  updateOverdueBadge("panel-tareas-overdue", overdueTasks, "tareas o artículos");

  checklist.innerHTML = visibleItems.length
    ? visibleItems.map((item) => {
        const days = diasParaEvento(item.dueDate);
        const dueLabel = days === null ? "Sin vencimiento"
          : days < 0 ? `Venció hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}`
            : days === 0 ? "Vence hoy" : `Vence en ${days} día${days === 1 ? "" : "s"}`;
        const detail = item.dueDate ? `${item.typeLabel} · ${dueLabel}` : item.typeLabel;
        return `
          <label class="panel-checklist-row ${item.overdue ? "panel-checklist-overdue" : ""}">
            <input type="checkbox"
                   onchange="${item.type === "tarea" ? "toggleTarea" : "toggleCompra"}('${item.id}')"
                   aria-label="Marcar listo: ${escapeHTML(item.label)}">
            <span class="panel-checklist-copy">
              <strong>${escapeHTML(item.label)}</strong>
              <small>${escapeHTML(detail)}</small>
            </span>
          </label>`;
      }).join("")
    : `<p class="panel-empty-state">No hay tareas ni artículos pendientes.</p>`;
  setPanelChecklistTab(_panelChecklistTab);
}

/** Muestra el avance en pagos, asistencia y confirmación de invitados. */
function renderPanelMetricas(bz = getActiveBazaar()) {
  const box = document.getElementById("panel-metricas");
  if (!box || !bz) return;
  ensureEventoFields(bz);
  const pct = (a, t) => (t ? Math.round((a / t) * 100) : 0);
  const pagados = bz.expositores.filter((e) => e.pagado).length;
  const mesas = typeof getDiaEventoTables === "function" ? getDiaEventoTables(bz) : [];
  const asistieron = mesas.filter((e) => e.state === "attended").length;
  const invitados = bz.invitados || [];
  const confirmados = invitados.filter((i) => i.confirmado).length;
  const progress = (label, completed, total) => {
    const percentage = pct(completed, total);
    return `
      <div class="panel-progress-item">
        <div class="panel-progress-heading">
          <span>${label}</span>
          <strong>${completed}/${total} <span>· ${percentage}%</span></strong>
        </div>
        <div class="panel-progress-track" role="progressbar" aria-label="${label}"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percentage}">
          <span class="panel-progress-fill" style="width:${percentage}%"></span>
        </div>
      </div>`;
  };
  box.innerHTML =
    progress("Expositores al corriente", pagados, bz.expositores.length) +
    progress("Asistencia de mesas asignadas", asistieron, mesas.length) +
    progress("Confirmación de invitados", confirmados, invitados.length);
}

// ==========================================
// EVENTOS DE VARIOS DÍAS
// bz.evento.multiDia (interruptor) + bz.evento.dias [{ id, nombre, fecha }].
// Apagar el interruptor conserva la lista de días por si se vuelve a activar.
// ==========================================
function bazarEsMultiDia(bz = getActiveBazaar()) {
  return Boolean(bz?.evento?.multiDia) && (bz.evento.dias || []).length > 1;
}

function getDiaLabel(dia, index) {
  return (dia?.nombre || "").trim() || `Día ${index + 1}`;
}

function formatDiaFecha(fecha) {
  const d = fecha ? new Date(`${fecha}T00:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "";
}

/** Suma n días a "YYYY-MM-DD" (cadena vacía si la fecha no es válida). */
function _fechaMasDias(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
  return d.toISOString().slice(0, 10);
}

/** Texto de los días en que participa un expositor ("" si el bazar es de un solo día). */
function getExpositorDiasLabel(exp, bz = getActiveBazaar()) {
  if (!bazarEsMultiDia(bz)) return "";
  const dias = bz.evento.dias;
  const elegidos = dias.filter((d) => (exp.diasParticipacion || []).includes(d.id));
  if (!elegidos.length || elegidos.length === dias.length) return "Todos los días";
  return elegidos.map((d) => getDiaLabel(d, dias.indexOf(d))).join(", ");
}

function diasBadgeHTML(exp, bz = getActiveBazaar()) {
  const label = getExpositorDiasLabel(exp, bz);
  return label ? `<span class="dias-badge" title="Días de participación">📅 ${escapeHTML(label)}</span>` : "";
}

/** Día (id) al que pertenece un plano; "" si no tiene o el bazar es de un solo día. */
function floorDiaId(floor, bz = getActiveBazaar()) {
  return bazarEsMultiDia(bz) && floor?.dia && bz.evento.dias.some((d) => d.id === floor.dia) ? floor.dia : "";
}

/** Nombre del plano para mostrar: "Planta baja · Día 2" en eventos de varios días. */
function floorLabel(floor, bz = getActiveBazaar()) {
  const id = floorDiaId(floor, bz);
  if (!id) return floor?.name || "";
  const i = bz.evento.dias.findIndex((d) => d.id === id);
  return `${floor.name} · ${getDiaLabel(bz.evento.dias[i], i)}`;
}

function tableDiaId(table, bz = getActiveBazaar()) {
  const floor = (bz?.floors || []).find((f) => (f.tables || []).some((t) => t.id === table?.id));
  return floor ? floorDiaId(floor, bz) : "";
}

/** ¿El expositor participa en ese día? (sin día, o sin días elegidos = sí). */
function expositorParticipaEnDia(exp, diaId, bz = getActiveBazaar()) {
  if (!diaId) return true;
  const elegidos = (exp.diasParticipacion || []).filter((id) => bz.evento.dias.some((d) => d.id === id));
  return !elegidos.length || elegidos.includes(diaId);
}

/** Punto de limpieza al borrar un día: otras secciones (agenda, planos) se enganchan aquí. */
function cleanupDiaRefs(bz, diaId) {
  (bz.expositores || []).forEach((e) => { e.diasParticipacion = (e.diasParticipacion || []).filter((id) => id !== diaId); });
  bz.minuteByMinute = (bz.minuteByMinute || []).filter((row) => row.dia !== diaId);   // actividades exclusivas de ese día
  (bz.floors || []).forEach((floor) => { if (floor.dia === diaId) floor.dia = ""; });   // los planos se conservan, sin día
}

function toggleMultiDia(on) {
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  if (on && bz.evento.dias.length < 2) {
    const stamp = Date.now();
    if (bz.evento.dias.length === 1) {   // ya hay un día guardado: se le suma el segundo
      bz.evento.dias.push({ id: `dia-${stamp}-2`, nombre: "Día 2", fecha: _fechaMasDias(bz.evento.dias[0].fecha, 1) });
    } else {
      const base = bz.evento.fecha;
      bz.evento.dias = [
        { id: `dia-${stamp}-1`, nombre: "Día 1", fecha: base },
        { id: `dia-${stamp}-2`, nombre: "Día 2", fecha: _fechaMasDias(base, 1) }
      ];
    }
  }
  bz.evento.multiDia = Boolean(on);
  saveState();
  renderAll();
}

function addDiaEvento() {
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  const dias = bz.evento.dias;
  dias.push({ id: `dia-${Date.now()}`, nombre: `Día ${dias.length + 1}`, fecha: _fechaMasDias(dias[dias.length - 1]?.fecha, 1) });
  saveState();
  renderAll();
}

function updateDiaEvento(id, field, value) {
  const dia = getActiveBazaar()?.evento?.dias.find((d) => d.id === id);
  if (!dia || !["nombre", "fecha"].includes(field)) return;
  dia[field] = String(value).trim();
  saveState();
  renderAll();
}

async function removeDiaEvento(id) {
  const bz = getActiveBazaar();
  if (!bz) return;
  const dia = bz.evento.dias.find((d) => d.id === id);
  const actividades = dia ? (bz.minuteByMinute || []).filter((row) => row.dia === id).length : 0;
  const planos = dia ? (bz.floors || []).filter((floor) => floor.dia === id).length : 0;
  const quedaUno = bz.evento.dias.length <= 2;   // al borrar uno solo queda un día: deja de ser multi-día
  if (!dia || !await appConfirm(
    `¿Eliminar "${getDiaLabel(dia, bz.evento.dias.indexOf(dia))}"? Se quitará de la participación de los expositores${actividades ? ` y se eliminarán sus ${actividades} actividad(es) exclusivas del Minuto a Minuto` : ""}.${planos ? `\n\nSus ${planos} plano(s) se conservan, pero quedarán sin día asignado.` : ""}${quedaUno ? "\n\nAl quedar un solo día, el evento pasará a ser de 1 día." : ""}`,
    "Eliminar día")) return;
  bz.evento.dias = bz.evento.dias.filter((d) => d.id !== id);
  cleanupDiaRefs(bz, id);
  if (quedaUno) bz.evento.multiDia = false;
  saveState();
  renderAll();
  showToast("🗑️ Día eliminado");
}

function renderFichaDias(bz = getActiveBazaar()) {
  const toggle = document.getElementById("ficha-multidia");
  const box = document.getElementById("ficha-dias-box");
  const list = document.getElementById("ficha-dias-list");
  if (!toggle || !box || !list || !bz) return;
  toggle.checked = Boolean(bz.evento.multiDia);
  box.hidden = !bz.evento.multiDia;
  if (!bz.evento.multiDia || list.contains(document.activeElement)) return;   // no pisar lo que se está editando
  const dias = bz.evento.dias;
  list.innerHTML = dias.map((d, i) => `
    <div class="dia-row">
      <input type="text" class="form-input" value="${escapeHTML(d.nombre)}" placeholder="Día ${i + 1}" aria-label="Nombre del día ${i + 1}"
             onchange="updateDiaEvento('${d.id}','nombre',this.value)">
      <input type="date" class="form-input" value="${escapeHTML(d.fecha)}" aria-label="Fecha del día ${i + 1}"
             onchange="updateDiaEvento('${d.id}','fecha',this.value)">
      <button type="button" class="dia-remove" onclick="removeDiaEvento('${d.id}')"
              title="Eliminar día" aria-label="Eliminar día ${i + 1}">🗑️</button>
    </div>`).join("");
}

/** Resumen de solo lectura de la ficha (se muestra cuando el formulario está oculto). */
function renderFichaDatos(bz = getActiveBazaar()) {
  const box = document.getElementById("ficha-datos");
  if (!box || !bz) return;
  ensureEventoFields(bz);
  const ev = bz.evento;
  let fecha = "";
  if (ev.fecha) {
    const d = new Date(`${ev.fecha}T00:00:00`);
    fecha = Number.isNaN(d.getTime()) ? ev.fecha : d.toLocaleDateString("es-MX", { dateStyle: "long" });
  }
  const diasTxt = ev.multiDia && ev.dias.length > 1
    ? ev.dias.map((d, i) => `${getDiaLabel(d, i)}${formatDiaFecha(d.fecha) ? ` (${formatDiaFecha(d.fecha)})` : ""}`).join(" · ") : "";
  const rows = [["Fecha", fecha], ["Días", diasTxt], ["Lugar", ev.lugar], ["Líderes", ev.lideres], ["Público", ev.publico],
                ["Asistentes esperados", ev.asistentes], ["Staff considerado", ev.staff]]
    .filter(([, v]) => v !== "" && v !== null && v !== undefined);
  box.innerHTML = `
    <div class="ficha-resumen-nombre">${escapeHTML(bz.name)}</div>
    ${ev.objetivo ? `<p class="ficha-objetivo">${escapeHTML(ev.objetivo)}</p>` : ""}
    ${rows.length || ev.objetivo
      ? `<div class="panel-event-meta">${rows.map(([label, value]) => `
          <span><strong>${label}</strong> ${escapeHTML(String(value))}</span>`).join("")}</div>`
      : `<p class="panel-event-hint">Aún no hay datos del evento. Completa la ficha para compartir los detalles.</p>`}`;
}

/** Muestra u oculta el formulario de la ficha. Sin argumento alterna; true/false fuerza el estado. */
function toggleFichaForm(forceOpen) {
  const card = document.getElementById("ficha-form-card");
  if (!card) return;
  const open = typeof forceOpen === "boolean" ? forceOpen : card.hidden;
  card.hidden = !open;
  const datos = document.getElementById("ficha-datos");
  if (datos) datos.hidden = open;
  const btn = document.getElementById("btn-toggle-ficha");
  if (btn) {
    btn.textContent = open ? "Listo" : "Editar ficha";
    btn.setAttribute("aria-expanded", String(open));
  }
  if (open) {
    renderFicha();
    document.getElementById("ficha-nombre")?.focus();
    document.getElementById("ficha-card")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } else {
    document.activeElement?.blur();   // dispara el guardado del campo en edición
    renderFichaDatos();
  }
}
