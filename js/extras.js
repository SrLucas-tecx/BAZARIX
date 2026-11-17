/**
 * BAZARIX — extras.js
 * Actividades extra del bazar (talleres, shows, rifas, concursos…).
 *  - Cada una tiene su FICHA. Puede o no generar remuneración para el bazar.
 *  - Si genera ingreso: lleva su CAJA (fondo, ingresos, egresos, conteo de efectivo y corte).
 *  - Si no: es solo una actividad.
 *  - Se puede agregar al Minuto a Minuto (el vínculo se deduce de minuteByMinute[].extraId).
 * Datos: bz.extras = [{ id, nombre, tipo, descripcion, estado, dia, horaInicio, horaFin, lugar, responsableId, areaRolId,
 *                      genera, precioUnit, metaIngreso, fondoInicial, conteo:{denoms,at,nota}, cajaCerrada, cajaCerradaAt, notas }]
 *        bz.cajaMovs = [{ id, extraId, ts, tipo:"ingreso"|"egreso", concepto, monto }]   (una fila por movimiento: varios cajeros a la vez)
 * Dependencias: state.js, utils.js, responsables.js, evento_ficha.js, eventos.js
 */

const EXTRA_ESTADOS = { planeada: "Planeada", enCurso: "En curso", terminada: "Terminada", cancelada: "Cancelada" };
const EXTRA_TIPOS = ["Taller", "Show / Música", "Concurso", "Rifa", "Venta / Snack", "Juegos", "Otro"];
const CAJA_DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];   // billetes y monedas MXN

const _r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const _xid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// ==========================================
// LÓGICA (sin pantalla: se prueba en test_extras.js)
// ==========================================
function getExtra(bz, id) { return (bz?.extras || []).find((x) => x.id === id) || null; }
function extraMovs(bz, id) { return (bz?.cajaMovs || []).filter((m) => m.extraId === id); }

/** Fondo + ingresos − egresos = lo que debería haber en caja; se compara con el efectivo contado. */
function extraCajaStats(bz, e) {
  const movs = extraMovs(bz, e.id);
  const sum = (tipo) => _r2(movs.filter((m) => m.tipo === tipo).reduce((s, m) => s + (Number(m.monto) || 0), 0));
  const ingresos = sum("ingreso"), egresos = sum("egreso"), fondo = _r2(e.fondoInicial);
  const esperado = _r2(fondo + ingresos - egresos);
  const denoms = e.conteo?.denoms || {};
  const contado = _r2(CAJA_DENOMS.reduce((s, d) => s + d * (Number(denoms[d]) || 0), 0));
  const hayConteo = Boolean(e.conteo?.at);
  return { movs: movs.length, fondo, ingresos, egresos, neto: _r2(ingresos - egresos), esperado, contado, hayConteo,
    diferencia: hayConteo ? _r2(contado - esperado) : null };
}

/** Resumen del bazar: la remuneración neta es lo que dejaron las actividades con ingreso (sin contar el fondo). */
function getExtrasResumen(bz) {
  const list = bz?.extras || [];
  const conIngreso = list.filter((x) => x.genera && x.estado !== "cancelada");
  return {
    total: list.length,
    generan: list.filter((x) => x.genera).length,
    neto: _r2(conIngreso.reduce((s, x) => s + extraCajaStats(bz, x).neto, 0)),
    cajasAbiertas: list.filter((x) => x.genera && !x.cajaCerrada && extraMovs(bz, x.id).length > 0).length,
  };
}

function extraMinuteRowOf(bz, extra) { return (bz.minuteByMinute || []).find((r) => r.extraId === extra.id) || null; }

/** Crea (o actualiza) la fila del Minuto a Minuto ligada a la actividad extra. */
function extraLinkMinuto(bz, extra) {
  if (!Array.isArray(bz.minuteByMinute)) bz.minuteByMinute = [];
  const dia = (bz.evento?.dias || []).some((d) => d.id === extra.dia) ? extra.dia : "";
  const fields = {
    extraId: extra.id, dia, time: extra.horaInicio || "", horaFin: extra.horaFin || "", activity: extra.nombre, lugar: extra.lugar || "",
    responsableId: extra.responsableId || "", areaRolId: extra.responsableId ? "" : (extra.areaRolId || ""),
  };
  let row = extraMinuteRowOf(bz, extra);
  if (row) Object.assign(row, fields);
  else { row = { id: _xid("minute"), notes: extra.descripcion || "", ...fields }; bz.minuteByMinute.push(row); }
  row.area = getItemRolNombre(row, bz);
  return row;
}

function extraUnlinkMinuto(bz, extra) {
  const before = (bz.minuteByMinute || []).length;
  bz.minuteByMinute = (bz.minuteByMinute || []).filter((r) => r.extraId !== extra.id);
  return before - bz.minuteByMinute.length;
}

/** Borra la actividad, sus movimientos de caja y su fila del Minuto a Minuto. */
function extraRemove(bz, id) {
  bz.extras = (bz.extras || []).filter((x) => x.id !== id);
  bz.cajaMovs = (bz.cajaMovs || []).filter((m) => m.extraId !== id);
  bz.minuteByMinute = (bz.minuteByMinute || []).filter((r) => r.extraId !== id);
}

/** Registra un movimiento de caja. Devuelve null si el monto no es válido. */
function extraAddMov(bz, extraId, { tipo, concepto, monto }) {
  const amount = _r2(monto);
  if (!(amount > 0) || !Number.isFinite(amount) || !getExtra(bz, extraId)) return null;
  const mov = { id: _xid("mov"), extraId, ts: new Date().toISOString(), tipo: tipo === "egreso" ? "egreso" : "ingreso",
    concepto: String(concepto || "").trim().slice(0, 120), monto: amount };
  (bz.cajaMovs || (bz.cajaMovs = [])).push(mov);
  return mov;
}

// ==========================================
// PANTALLA: lista de actividades
// ==========================================
function _extraDiaLabel(bz, e) {
  const i = (bz.evento?.dias || []).findIndex((d) => d.id === e.dia);
  return i >= 0 ? getDiaLabel(bz.evento.dias[i], i) : "Todos los días";
}

function renderExtras() {
  const grid = document.getElementById("extras-grid");
  const bz = getActiveBazaar();
  if (!grid || !bz) return;
  ensureEventoFields(bz);
  const res = getExtrasResumen(bz);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("extras-stat-total", res.total);
  set("extras-stat-generan", res.generan);
  set("extras-stat-neto", formatCurrency(res.neto));
  set("extras-stat-cajas", res.cajasAbiertas);

  if (!bz.extras.length) {
    grid.innerHTML = `<div class="catalog-empty"><span class="catalog-empty-icon">⭐</span><h3>Aún no hay actividades extra</h3>
      <p>Talleres, shows, rifas, concursos… Pueden generar ingreso para el bazar (con su caja) o ser solo una actividad.</p>
      <button class="btn-primary" style="margin-top:16px;" onclick="openModalExtra()">+ Nueva actividad extra</button></div>`;
    return;
  }

  const diaIdx = (x) => { const i = (bz.evento?.dias || []).findIndex((d) => d.id === x.dia); return i < 0 ? -1 : i; };
  const list = [...bz.extras].sort((a, b) => diaIdx(a) - diaIdx(b) || (a.horaInicio || "99:99").localeCompare(b.horaInicio || "99:99") || a.nombre.localeCompare(b.nombre, "es"));
  const multi = bazarEsMultiDia(bz);

  grid.innerHTML = list.map((x) => {
    const st = x.genera ? extraCajaStats(bz, x) : null;
    const linked = Boolean(extraMinuteRowOf(bz, x));
    const quien = getResponsableNombre(x.responsableId, bz) || getItemRolNombre(x, bz) || "Sin asignar";
    const horario = x.horaInicio ? `${x.horaInicio}${x.horaFin ? ` – ${x.horaFin}` : ""}` : "Sin horario";
    const meta = (label, value) => `<div class="card-meta-item"><div class="card-meta-label">${label}</div><div class="card-meta-value">${value}</div></div>`;
    return `
    <div class="expositor-card exp-card extra-card ${x.estado === "cancelada" ? "banned-card" : x.genera ? "paid-card" : ""}">
      <div class="card-top">
        <div class="avatar-wrap"><div class="expositor-avatar" aria-hidden="true">⭐</div></div>
        <div class="card-info">
          <div class="card-name" title="${escapeHTML(x.nombre)}">${escapeHTML(x.nombre)}</div>
          <span class="card-category">${escapeHTML(x.tipo || "Otro")}</span>
        </div>
      </div>
      <div class="card-badges">
        <span class="paid-badge ${x.genera ? "paid" : "unpaid"}">${x.genera ? "💰 Genera ingreso" : "Sin ingreso"}</span>
        <select class="form-select extra-estado" aria-label="Estado de ${escapeHTML(x.nombre)}" onchange="setExtraEstado('${x.id}',this.value)">
          ${Object.entries(EXTRA_ESTADOS).map(([k, v]) => `<option value="${k}" ${x.estado === k ? "selected" : ""}>${v}</option>`).join("")}
        </select>
        ${linked ? `<span class="dias-badge">🕒 En el Minuto a Minuto</span>` : ""}
      </div>
      <div class="card-meta">
        ${meta("Horario", escapeHTML(horario))}
        ${meta(multi ? "Día" : "Lugar", escapeHTML(multi ? _extraDiaLabel(bz, x) : (x.lugar || "Sin lugar")))}
        ${multi ? meta("Lugar", escapeHTML(x.lugar || "Sin lugar")) : ""}
        ${meta("Responsable", escapeHTML(quien))}
        ${st ? meta("Remuneración neta", `<span style="color:${st.neto >= 0 ? "var(--color-paid)" : "var(--color-danger)"};">${formatCurrency(st.neto)}</span>`) : ""}
        ${st ? meta("Esperado en caja", formatCurrency(st.esperado)) : ""}
        ${st && x.metaIngreso > 0 ? meta("Meta de ingreso", `${formatCurrency(x.metaIngreso)}<small>${Math.min(100, Math.round((st.ingresos / x.metaIngreso) * 100))}% logrado</small>`) : ""}
        ${st && x.cajaCerrada ? meta("Caja", "🔒 Cerrada") : ""}
      </div>
      ${x.descripcion ? `<div class="card-contact exp-contact"><span class="exp-notes">📝 ${notePreviewHTML(x.descripcion, "extra", x.id)}</span></div>` : ""}
      <div class="card-actions">
        <div class="card-actions-main">
          ${x.genera ? `<button class="btn-primary btn-sm" onclick="openCaja('${x.id}')">🧾 Caja</button>` : ""}
          <button class="btn-secondary btn-sm" onclick="openModalExtra('${x.id}')">📝 Ficha</button>
        </div>
        <div class="card-actions-tools">
          <button class="btn-secondary btn-sm" onclick="toggleExtraMinuto('${x.id}')">${linked ? "➖ Quitar del Minuto a Minuto" : "🕒 Agregar al Minuto a Minuto"}</button>
          <button class="btn-danger btn-sm" onclick="deleteExtra('${x.id}')" title="Eliminar" aria-label="Eliminar actividad extra">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

function setExtraEstado(id, estado) {
  const bz = getActiveBazaar();
  const x = getExtra(bz, id);
  if (!x || !EXTRA_ESTADOS[estado]) return;
  x.estado = estado;
  saveState();
  renderExtras();
}

function toggleExtraMinuto(id) {
  const bz = getActiveBazaar();
  const x = getExtra(bz, id);
  if (!x) return;
  if (extraMinuteRowOf(bz, x)) { extraUnlinkMinuto(bz, x); showToast("Quitada del Minuto a Minuto"); }
  else {
    if (!x.horaInicio) showToast("Agregada sin horario: ponle la hora en el Minuto a Minuto");
    extraLinkMinuto(bz, x);
    if (x.horaInicio) showToast("🕒 Agregada al Minuto a Minuto");
  }
  saveState();
  renderExtras();
  renderMinuteByMinute();
}

async function deleteExtra(id) {
  const bz = getActiveBazaar();
  const x = getExtra(bz, id);
  if (!x) return;
  const movs = extraMovs(bz, id).length;
  const aviso = movs ? `\n\nTambién se borrarán sus ${movs} movimiento(s) de caja.` : "";
  if (!await appConfirm(`¿Eliminar la actividad extra "${x.nombre}"?${aviso}`, "Eliminar actividad extra")) return;
  extraRemove(bz, id);
  saveState();
  renderExtras();
  renderMinuteByMinute();
  showToast("🗑️ Actividad eliminada");
}

// ==========================================
// FICHA (alta y edición)
// ==========================================
function updateExtraGenera() {
  const on = document.getElementById("extra-genera").checked;
  document.getElementById("extra-caja-fields").hidden = !on;
}

function openModalExtra(id = null) {
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  const x = id ? getExtra(bz, id) : null;
  if (id && !x) return;
  document.getElementById("form-extra").reset();
  const $ = (k) => document.getElementById(`extra-${k}`);
  $("tipo").innerHTML = EXTRA_TIPOS.map((t) => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join("");
  $("estado").innerHTML = Object.entries(EXTRA_ESTADOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");
  const multi = bazarEsMultiDia(bz);
  document.getElementById("extra-dia-group").hidden = !multi;
  $("dia").innerHTML = minuteDiaOptionsHTML(x?.dia || "", bz);

  const rol = x ? getItemRol(x, bz) : "";
  $("rol").innerHTML = rolOptionsHTML(rol, bz);
  $("responsable").innerHTML = personaOptionsHTML(rol, x?.responsableId || "", bz);
  $("responsable").disabled = !rol;

  document.getElementById("modal-extra-title").textContent = x ? "Ficha de la actividad extra" : "Nueva actividad extra";
  $("id").value = x?.id || "";
  $("nombre").value = x?.nombre || "";
  $("tipo").value = x?.tipo && EXTRA_TIPOS.includes(x.tipo) ? x.tipo : "Otro";
  $("estado").value = x?.estado || "planeada";
  $("descripcion").value = x?.descripcion || "";
  $("inicio").value = x?.horaInicio || "";
  $("fin").value = x?.horaFin || "";
  $("lugar").value = x?.lugar || "";
  $("genera").checked = Boolean(x?.genera);
  $("precio").value = x?.precioUnit || "";
  $("meta").value = x?.metaIngreso || "";
  $("fondo").value = x?.fondoInicial || "";
  $("notas").value = x?.notas || "";
  $("minuto").checked = x ? Boolean(extraMinuteRowOf(bz, x)) : false;
  updateExtraGenera();
  openModal("modal-extra");
  setTimeout(() => $("nombre")?.focus(), 50);
}

function saveExtraHandler(e) {
  e.preventDefault();
  const bz = getActiveBazaar();
  if (!bz) return;
  const $ = (k) => document.getElementById(`extra-${k}`);
  const nombre = $("nombre").value.trim();
  if (!nombre) return;
  const inicio = $("inicio").value, fin = $("fin").value;
  if (inicio && fin && fin < inicio) { showToast("La hora de fin es anterior a la de inicio", "error"); return; }

  const id = $("id").value;
  const existing = id ? getExtra(bz, id) : null;
  const genera = $("genera").checked;
  const money = (el) => Math.max(0, _r2(el.value));
  const resp = readModalResponsable("extra");
  const data = {
    nombre, tipo: $("tipo").value, estado: $("estado").value, descripcion: $("descripcion").value.trim(),
    dia: bazarEsMultiDia(bz) ? $("dia").value : "", horaInicio: inicio, horaFin: fin, lugar: $("lugar").value.trim(),
    ...resp, genera, precioUnit: genera ? money($("precio")) : 0, metaIngreso: genera ? money($("meta")) : 0,
    fondoInicial: genera ? money($("fondo")) : 0, notas: $("notas").value.trim(),
  };
  let x;
  if (existing) { Object.assign(existing, data); x = existing; }
  else {
    x = { id: _xid("extra"), conteo: { denoms: {}, at: "", nota: "" }, cajaCerrada: false, cajaCerradaAt: "", ...data };
    bz.extras.push(x);
  }
  if ($("minuto").checked) extraLinkMinuto(bz, x);
  else extraUnlinkMinuto(bz, x);
  saveState();
  closeModal("modal-extra");
  renderExtras();
  renderMinuteByMinute();
  showToast(existing ? "✅ Ficha actualizada" : "✅ Actividad extra creada");
}

// ==========================================
// CAJA (solo actividades que generan ingreso)
// ==========================================
function openCaja(id) {
  const bz = getActiveBazaar();
  const x = getExtra(bz, id);
  if (!x) return;
  document.getElementById("caja-extra-id").value = id;
  document.getElementById("caja-title").textContent = `🧾 Caja — ${x.nombre}`;
  document.getElementById("caja-concepto").value = "";
  document.getElementById("caja-monto").value = "";
  document.getElementById("caja-tipo").value = "ingreso";
  document.getElementById("caja-conteo-nota").value = x.conteo?.nota || "";
  renderCajaDenoms(x);
  renderCaja();
  openModal("modal-caja");
}

function _cajaActual() {
  const bz = getActiveBazaar();
  const x = getExtra(bz, document.getElementById("caja-extra-id")?.value);
  return x ? { bz, x } : null;
}

function renderCaja() {
  const ctx = _cajaActual();
  if (!ctx) return;
  const { bz, x } = ctx;
  const st = extraCajaStats(bz, x);
  const card = (label, value, cls = "") => `<div class="caja-kpi ${cls}"><span>${label}</span><strong>${value}</strong></div>`;
  document.getElementById("caja-summary").innerHTML =
    card("Fondo inicial", formatCurrency(st.fondo)) +
    card("Ingresos", formatCurrency(st.ingresos), "is-pos") +
    card("Egresos", formatCurrency(st.egresos), st.egresos ? "is-neg" : "") +
    card("Esperado en caja", formatCurrency(st.esperado)) +
    card("Remuneración neta", formatCurrency(st.neto), st.neto >= 0 ? "is-pos" : "is-neg");

  const movs = extraMovs(bz, x.id).slice().sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  document.getElementById("caja-movs-list").innerHTML = movs.length
    ? movs.map((m) => {
        const d = new Date(m.ts);
        const hora = Number.isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
        return `<tr>
          <td>${hora}</td><td>${escapeHTML(m.concepto || (m.tipo === "ingreso" ? "Ingreso" : "Egreso"))}</td>
          <td style="font-weight:800;color:${m.tipo === "ingreso" ? "var(--color-paid)" : "var(--color-danger)"};">${m.tipo === "ingreso" ? "+" : "−"}${formatCurrency(m.monto)}</td>
          <td><button class="btn-danger btn-sm" ${x.cajaCerrada ? "disabled" : ""} onclick="deleteCajaMov('${m.id}')" aria-label="Quitar movimiento">🗑️</button></td></tr>`;
      }).join("")
    : `<tr><td colspan="4" style="text-align:center;color:var(--color-text-muted);padding:16px;">Sin movimientos todavía.</td></tr>`;

  const quick = document.getElementById("caja-quick");
  quick.innerHTML = x.precioUnit > 0 ? `<button type="button" class="btn-primary" ${x.cajaCerrada ? "disabled" : ""} onclick="addCajaVentaRapida()">＋ Cobro de ${formatCurrency(x.precioUnit)}</button>` : "";

  document.getElementById("caja-closed-note").textContent = x.cajaCerrada
    ? `🔒 Caja cerrada${x.cajaCerradaAt ? ` el ${new Date(x.cajaCerradaAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}` : ""}. Reábrela para registrar más movimientos.` : "";
  document.getElementById("caja-cierre-btn").textContent = x.cajaCerrada ? "🔓 Reabrir caja" : "🔒 Cerrar caja";
  document.getElementById("caja-add-btn").disabled = Boolean(x.cajaCerrada);
  updateCajaConteoPreview();
}

function addCajaMov() {
  const ctx = _cajaActual();
  if (!ctx) return;
  const { bz, x } = ctx;
  if (x.cajaCerrada) { showToast("La caja está cerrada", "error"); return; }
  const mov = extraAddMov(bz, x.id, {
    tipo: document.getElementById("caja-tipo").value,
    concepto: document.getElementById("caja-concepto").value,
    monto: document.getElementById("caja-monto").value,
  });
  if (!mov) { showToast("Escribe un monto mayor a 0", "error"); return; }
  document.getElementById("caja-concepto").value = "";
  document.getElementById("caja-monto").value = "";
  saveState();
  renderCaja();
  renderExtras();
  document.getElementById("caja-monto").focus();
}

function addCajaVentaRapida() {
  const ctx = _cajaActual();
  if (!ctx || ctx.x.cajaCerrada) return;
  extraAddMov(ctx.bz, ctx.x.id, { tipo: "ingreso", concepto: "Cobro", monto: ctx.x.precioUnit });
  saveState();
  renderCaja();
  renderExtras();
}

async function deleteCajaMov(movId) {
  const ctx = _cajaActual();
  if (!ctx || ctx.x.cajaCerrada) return;
  const mov = ctx.bz.cajaMovs.find((m) => m.id === movId);
  if (!mov || !await appConfirm(`¿Quitar este movimiento de ${formatCurrency(mov.monto)}?`, "Quitar movimiento", "Quitar")) return;
  ctx.bz.cajaMovs = ctx.bz.cajaMovs.filter((m) => m.id !== movId);
  saveState();
  renderCaja();
  renderExtras();
}

function renderCajaDenoms(x) {
  const denoms = x.conteo?.denoms || {};
  document.getElementById("caja-denoms").innerHTML = CAJA_DENOMS.map((d) => `
    <label class="caja-denom">
      <span>${d >= 20 ? "Billete" : "Moneda"} $${d}</span>
      <input type="number" class="form-input" min="0" step="1" inputmode="numeric" data-denom="${d}" value="${Number(denoms[d]) || ""}" placeholder="0" oninput="updateCajaConteoPreview()">
    </label>`).join("");
}

function _cajaContadoForm() {
  return CAJA_DENOMS.reduce((s, d) => {
    const el = document.querySelector(`#caja-denoms input[data-denom="${d}"]`);
    return s + d * Math.max(0, Math.floor(Number(el?.value) || 0));
  }, 0);
}

function updateCajaConteoPreview() {
  const ctx = _cajaActual();
  const out = document.getElementById("caja-conteo-preview");
  if (!ctx || !out) return;
  const contado = _r2(_cajaContadoForm());
  const esperado = extraCajaStats(ctx.bz, ctx.x).esperado;
  const dif = _r2(contado - esperado);
  out.innerHTML = `Contado: <strong>${formatCurrency(contado)}</strong> · Esperado: <strong>${formatCurrency(esperado)}</strong> · ` +
    `<strong style="color:${dif === 0 ? "var(--color-paid)" : "var(--color-danger)"};">${dif === 0 ? "Cuadra ✅" : dif > 0 ? `Sobrante ${formatCurrency(dif)}` : `Faltante ${formatCurrency(-dif)}`}</strong>`;
}

function saveCajaConteo() {
  const ctx = _cajaActual();
  if (!ctx) return;
  const denoms = {};
  CAJA_DENOMS.forEach((d) => {
    const n = Math.max(0, Math.floor(Number(document.querySelector(`#caja-denoms input[data-denom="${d}"]`)?.value) || 0));
    if (n) denoms[d] = n;
  });
  ctx.x.conteo = { denoms, at: new Date().toISOString(), nota: document.getElementById("caja-conteo-nota").value.trim().slice(0, 300) };
  saveState();
  renderCaja();
  renderExtras();
  showToast("✅ Conteo guardado");
}

async function toggleCierreCaja() {
  const ctx = _cajaActual();
  if (!ctx) return;
  const { x } = ctx;
  if (x.cajaCerrada) { x.cajaCerrada = false; x.cajaCerradaAt = ""; }
  else {
    if (!x.conteo?.at && !await appConfirm("Aún no guardas el conteo de efectivo. ¿Cerrar la caja de todos modos?", "Cerrar caja", "Cerrar")) return;
    x.cajaCerrada = true;
    x.cajaCerradaAt = new Date().toISOString();
  }
  saveState();
  renderCaja();
  renderExtras();
}

if (typeof module !== "undefined") module.exports = { extraCajaStats, getExtrasResumen, extraLinkMinuto, extraUnlinkMinuto, extraRemove, extraAddMov, extraMinuteRowOf, CAJA_DENOMS };
