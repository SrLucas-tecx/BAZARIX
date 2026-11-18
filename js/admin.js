/**
 * BAZARIX — admin.js (Sprint 5)
 * Pantalla "Administración" del modo Equipo: miembros (quién está activo, quién solo canjeó el código, roles),
 * actividad reciente, códigos de invitación y —solo para el dueño— resumen de todos los bazares y cuentas.
 * Todo se pide al servidor, que valida el rol; aquí solo se muestra y se manda.
 * Dependencias: storage.js (TeamAdapter, teamMe, teamIsAdmin, teamIsOwner), permisos.js (teamIsAnyAdmin), utils.js, dialogs.js
 */
const _ad = { bazarId: "", tab: "miembros", members: [], codes: [], activity: [], overview: null, ownerCodes: [],
  q: "", rol: "all", estado: "all", loaded: false, busy: false, error: "" };
const _adBody = () => document.getElementById("admin-body");
const _adTx = () => TeamAdapter.tx();
const _AD_COL = { expositores: "Expositor", pisos: "Piso", mesas: "Mesa", tareas: "Tarea", compras: "Compra", invitados: "Asistencia", actividades: "Minuto a minuto",
  responsables: "Staff", roles: "Rol de staff", gastos: "Gasto", extras: "Actividad extra", cajamovs: "Movimiento de caja", bazares: "Ficha del bazar", costos: "Costos" };

// ── Helpers ──
const _adNorm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
const _adRoles = () => (teamMe()?.roles || []).filter((r) => r.bazarId === _ad.bazarId).sort((a, b) => b.rank - a.rank);
function _adRoleLabel(rol) {
  return rol === "admin" ? "Administrador" : rol === "vista" ? "Vista" : (_adRoles().find((r) => r.id === rol)?.nombre || "Rol eliminado");
}
function _adRoleOptions(selected) {
  return [["vista", "Vista (solo lectura)"], ["admin", "Administrador"]].concat(_adRoles().map((r) => [r.id, r.nombre]))
    .map(([v, l]) => `<option value="${escapeHTML(v)}" ${selected === v ? "selected" : ""}>${escapeHTML(l)}</option>`).join("");
}
function _adAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || Number.isNaN(ms)) return "nunca";
  const m = Math.floor(ms / 60000);
  return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`;
}
const _adDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }); };
const _adDateTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }); };

/** suspendido · activo (ahora) · sinvolver (solo canjeó el código) · inactivo */
function _adEstado(m) { return m.cuenta === "suspendido" ? "suspendido" : m.activo ? "activo" : m.sinVolver ? "sinvolver" : "inactivo"; }
function _adEstadoHTML(m) {
  const e = _adEstado(m);
  return e === "suspendido" ? "⛔ Cuenta suspendida" : e === "activo" ? "🟢 Activo ahora" : e === "sinvolver" ? "🕓 Solo canjeó el código" : `⚪ Visto ${_adAgo(m.visto)}`;
}

function _adConteos(list) {
  const out = { total: list.length, activos: 0, sinVolver: 0, suspendidos: 0, porRol: {} };
  list.forEach((m) => {
    const e = _adEstado(m);
    if (e === "activo") out.activos++; else if (e === "sinvolver") out.sinVolver++; else if (e === "suspendido") out.suspendidos++;
    const label = m.rol === "admin" ? "Administrador" : m.rolNombre || _adRoleLabel(m.rol);
    out.porRol[label] = (out.porRol[label] || 0) + 1;
  });
  return out;
}

function _adMiembrosFiltrados() {
  const q = _adNorm(_ad.q);
  const peso = { activo: 0, sinvolver: 2, inactivo: 1, suspendido: 3 };
  return _ad.members.filter((m) => {
    if (q && !_adNorm(m.nombre).includes(q)) return false;
    if (_ad.rol !== "all" && m.rol !== _ad.rol) return false;
    if (_ad.estado !== "all" && _adEstado(m) !== _ad.estado) return false;
    return true;
  }).sort((a, b) => peso[_adEstado(a)] - peso[_adEstado(b)] || String(a.nombre).localeCompare(String(b.nombre), "es"));
}

// ── Carga ──
function updateAdminNav() {
  const b = document.getElementById("nav-admin");
  if (!b) return;
  b.hidden = !(StorageAdapter.mode() === "team" && teamMe() && teamIsAnyAdmin());
}

async function renderAdmin() {
  const box = _adBody();
  if (!box) return;
  if (StorageAdapter.mode() !== "team") {
    box.innerHTML = `<div class="catalog-empty"><span class="catalog-empty-icon">👥</span><h3>Solo en modo Equipo</h3><p>Cambia a modo Equipo en ⚙️ → Almacenamiento para administrar miembros.</p></div>`;
    return;
  }
  _ad.bazarId = getActiveBazaar()?.id || "";
  if (!_ad.loaded) box.innerHTML = `<p class="form-hint">Cargando…</p>`;
  await refreshAdmin();
}

async function refreshAdmin() {
  if (_ad.busy) return;
  _ad.busy = true;
  try {
    await TeamAdapter.loadMe();
    const id = _ad.bazarId, jobs = [];
    Object.assign(_ad, { members: [], codes: [], activity: [], overview: null, ownerCodes: [] });
    if (id && teamIsAdmin(id)) {
      jobs.push(_adTx().call("members", { bazarId: id }).then((r) => { _ad.members = r.members; }));
      jobs.push(_adTx().call("codes", { bazarId: id }).then((r) => { _ad.codes = r.codes; }));
      jobs.push(_adTx().call("activity", { bazarId: id, limit: 40 }).then((r) => { _ad.activity = r.items; }));
    }
    if (teamIsOwner()) {
      jobs.push(_adTx().call("overview").then((r) => { _ad.overview = r; }));
      jobs.push(_adTx().call("codes", {}).then((r) => { _ad.ownerCodes = r.codes.filter((c) => c.tipo === "crear"); }));
    }
    await Promise.all(jobs);
    _ad.error = "";
    _ad.loaded = true;
  } catch (err) {
    _ad.error = err.message;
  } finally {
    _ad.busy = false;
  }
  drawAdmin();
}

// ── Dibujo ──
function _adTabs() {
  const id = _ad.bazarId, tabs = [];
  if (id && teamIsAdmin(id)) tabs.push({ id: "miembros", label: "👥 Miembros" }, { id: "actividad", label: "🕘 Actividad" }, { id: "codigos", label: "🔑 Códigos" });
  if (teamIsOwner()) tabs.push({ id: "dueno", label: "👑 Todos los bazares" });
  return tabs;
}

function drawAdmin() {
  const box = _adBody();
  if (!box) return;
  const me = teamMe();
  if (!me) { box.innerHTML = `<p class="form-hint">Conecta un equipo primero.</p>`; return; }
  if (_ad.error) { box.innerHTML = `<p class="form-hint">❌ No se pudo cargar: ${escapeHTML(_ad.error)}</p>`; return; }
  const tabs = _adTabs(), bz = AppState.bazaars[_ad.bazarId];
  if (!tabs.length) {
    box.innerHTML = `<p class="form-hint">${_ad.bazarId ? "Solo los administradores del bazar ven esta pantalla." : "Abre un bazar para administrar sus miembros."}</p>`;
    return;
  }
  if (!tabs.some((t) => t.id === _ad.tab)) _ad.tab = tabs[0].id;
  const head = `<p><strong>${escapeHTML(me.user.nombre)}</strong> · ${me.user.owner ? "Dueño de la hoja" : `Administrador${bz ? ` de «${escapeHTML(bz.name)}»` : ""}`}</p>
    <div class="ad-tabs" role="tablist">${tabs.map((t) => `<button type="button" class="filter-chip ${t.id === _ad.tab ? "active" : ""}" role="tab" aria-selected="${t.id === _ad.tab}" onclick="adSetTab('${t.id}')">${t.label}</button>`).join("")}</div>`;
  const body = _ad.tab === "miembros" ? _adMiembrosHTML() : _ad.tab === "actividad" ? _adActividadHTML() : _ad.tab === "codigos" ? _adCodigosHTML() : _adDuenoHTML();
  box.innerHTML = head + body;
}

function adSetTab(tab) { _ad.tab = tab; drawAdmin(); }

function _adKpi(icon, value, label, cls) {
  return `<div class="stat-card ${cls || "accent-teal"}"><div class="stat-icon">${icon}</div><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

// — Miembros —
function _adMiembrosHTML() {
  const c = _adConteos(_ad.members);
  const roles = [["all", "Todos los roles"], ["admin", "Administrador"], ["vista", "Vista"]].concat(_adRoles().map((r) => [r.id, r.nombre]));
  const estados = [["all", "Todos los estados"], ["activo", "🟢 Activos ahora"], ["inactivo", "⚪ Inactivos"], ["sinvolver", "🕓 Solo canjearon el código"], ["suspendido", "⛔ Suspendidos"]];
  const opts = (list, sel) => list.map(([v, l]) => `<option value="${escapeHTML(v)}" ${v === sel ? "selected" : ""}>${escapeHTML(l)}</option>`).join("");
  const porRol = Object.entries(c.porRol).map(([r, n]) => `${escapeHTML(r)}: <strong>${n}</strong>`).join(" · ") || "Sin miembros";
  return `<div class="stats-row">${_adKpi("👥", c.total, "Miembros")}${_adKpi("🟢", c.activos, "Activos ahora", "accent-green")}${_adKpi("🕓", c.sinVolver, "Solo canjearon el código", "accent-gold")}${_adKpi("⛔", c.suspendidos, "Cuentas suspendidas", "accent-red")}</div>
    <p class="form-hint">${porRol}</p>
    <div class="ad-filters">
      <input id="ad-q" class="form-input" type="search" placeholder="Buscar por nombre…" aria-label="Buscar miembro" value="${escapeHTML(_ad.q)}" oninput="adFilterChanged()">
      <select id="ad-rol" class="form-select" aria-label="Filtrar por rol" onchange="adFilterChanged()">${opts(roles, _ad.rol)}</select>
      <select id="ad-estado" class="form-select" aria-label="Filtrar por estado" onchange="adFilterChanged()">${opts(estados, _ad.estado)}</select>
      <button class="btn-secondary" onclick="adExportCSV()">📥 Exportar CSV</button>
      <button class="btn-secondary" onclick="refreshAdmin()">🔄 Actualizar</button>
    </div>
    <div id="ad-miembros-tabla">${_adMiembrosTablaHTML()}</div>
    <p class="form-hint">«Solo canjeó el código» = la cuenta se creó y no ha vuelto a conectarse. Para cambiar permisos crea roles en ⚙️ → Miembros y roles.</p>`;
}

function _adMiembrosTablaHTML() {
  const list = _adMiembrosFiltrados();
  const rows = list.length ? list.map((m) => `<tr>
      <td><strong>${escapeHTML(m.nombre)}</strong><br><small style="color:var(--color-text-muted);">desde ${_adDate(m.desde)}</small></td>
      <td>${_adEstadoHTML(m)}</td>
      <td><select class="form-select" aria-label="Rol de ${escapeHTML(m.nombre)}" onchange="adSetRol('${escapeHTML(m.userId)}',this.value)">${_adRoleOptions(m.rol)}</select></td>
      <td>${m.rank}</td>
      <td><button class="btn-danger btn-sm" onclick="adRemove('${escapeHTML(m.userId)}')" aria-label="Quitar a ${escapeHTML(m.nombre)}">🗑️</button></td></tr>`).join("")
    : `<tr><td colspan="5" style="color:var(--color-text-muted);padding:16px;text-align:center;">${_ad.members.length ? "Nadie coincide con los filtros." : "Aún no hay miembros."}</td></tr>`;
  return `<div class="payments-table-wrap"><table class="payments-table" style="min-width:34rem;"><thead><tr><th>Persona</th><th>Estado</th><th>Rol</th><th>Rango</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="form-hint">Mostrando ${list.length} de ${_ad.members.length}.</p>`;
}

function adFilterChanged() {
  _ad.q = document.getElementById("ad-q")?.value || "";
  _ad.rol = document.getElementById("ad-rol")?.value || "all";
  _ad.estado = document.getElementById("ad-estado")?.value || "all";
  const t = document.getElementById("ad-miembros-tabla");
  if (t) t.innerHTML = _adMiembrosTablaHTML();   // solo la tabla: el campo de búsqueda conserva el foco
}

// — Actividad —
function _adActividadHTML() {
  const rows = _ad.activity.length ? _ad.activity.map((a) => {
    const accion = a.deleted ? "eliminó" : a.version === 1 ? "creó" : "editó";
    const tipo = _AD_COL[a.coleccion] || a.coleccion;
    return `<tr><td>${_adDateTime(a.updatedAt)}</td><td><strong>${escapeHTML(a.updatedBy)}</strong></td><td>${accion} · ${escapeHTML(tipo)}${a.etiqueta ? ` «${escapeHTML(a.etiqueta)}»` : ""}</td></tr>`;
  }).join("") : `<tr><td colspan="3" style="color:var(--color-text-muted);padding:16px;text-align:center;">Aún no hay cambios registrados.</td></tr>`;
  return `<div class="ad-filters"><button class="btn-secondary" onclick="refreshAdmin()">🔄 Actualizar</button></div>
    <div class="payments-table-wrap"><table class="payments-table" style="min-width:30rem;"><thead><tr><th>Cuándo</th><th>Quién</th><th>Qué</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="form-hint">Muestra el último cambio de cada registro (no el historial completo), los más recientes primero.</p>`;
}

// — Códigos —
function _adEstadoCodigo(c) { return { activo: "🟢 Activo", agotado: "✔️ Usado", vencido: "⌛ Vencido", revocado: "⛔ Revocado" }[c.estado] || c.estado; }
function _adCodesTable(list, withRol) {
  const rows = list.length ? list.map((c) => `<tr>
      ${withRol ? `<td>${escapeHTML(_adRoleLabel(c.rol))}</td>` : ""}<td>${_adEstadoCodigo(c)}</td><td>${c.usos}</td><td>${_adDate(c.expira)}</td>
      <td>${escapeHTML(c.creadoPorNombre || "—")}</td><td>${escapeHTML(c.nota || "")}</td>
      <td>${c.estado === "activo" ? `<button class="btn-secondary btn-sm" onclick="adRevoke('${escapeHTML(c.id)}')">Revocar</button>` : ""}</td></tr>`).join("")
    : `<tr><td colspan="${withRol ? 7 : 6}" style="color:var(--color-text-muted);padding:16px;text-align:center;">Sin códigos.</td></tr>`;
  return `<div class="payments-table-wrap"><table class="payments-table" style="min-width:34rem;"><thead><tr>${withRol ? "<th>Rol</th>" : ""}<th>Estado</th><th>Usos restantes</th><th>Vence</th><th>Creó</th><th>Nota</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function _adCodigosHTML() {
  return `<h3 class="caja-h">Invitar con un código</h3>
    <div class="caja-add" style="grid-template-columns:minmax(0,1.2fr) 6rem 6rem minmax(0,1fr) auto;">
      <select id="ad-inv-rol" class="form-select" aria-label="Rol de quien se une">${_adRoleOptions("vista")}</select>
      <input id="ad-inv-usos" class="form-input" type="number" min="1" max="100" value="1" aria-label="Usos" title="Cuántas personas pueden usarlo">
      <input id="ad-inv-dias" class="form-input" type="number" min="1" max="60" value="7" aria-label="Días de validez" title="Días de validez">
      <input id="ad-inv-nota" class="form-input" type="text" maxlength="80" placeholder="Nota (opcional)" aria-label="Nota">
      <button class="btn-primary" onclick="adInvite()">Generar</button>
    </div>
    <p class="form-hint">Rol · usos · días de validez. El código completo solo se muestra al crearlo.</p>
    <div id="ad-code-result"></div>
    <h3 class="caja-h">Códigos de este bazar</h3>${_adCodesTable(_ad.codes, true)}
    <p class="form-hint">Un código «Activo» con todos sus usos aún disponibles es una invitación que nadie ha usado.</p>`;
}

// — Dueño —
function _adDuenoHTML() {
  const o = _ad.overview;
  if (!o) return `<p class="form-hint">Sin datos.</p>`;
  const activas = o.cuentas.filter((u) => u.activo).length;
  const bazares = o.bazares.length ? o.bazares.slice().sort((a, b) => String(b.ultimo).localeCompare(String(a.ultimo))).map((b) => `<tr>
      <td><strong>${escapeHTML(b.nombre)}</strong></td><td>${escapeHTML(b.admins.join(", ") || "—")}</td><td>${b.miembros}</td><td>${b.filas}</td>
      <td>${b.ultimo ? `${_adAgo(b.ultimo)}<br><small style="color:var(--color-text-muted);">${escapeHTML(b.ultimoPor)}</small>` : "—"}</td>
      <td>${AppState.bazaars[b.bazarId] ? `<button class="btn-secondary btn-sm" onclick="adOpenBazar('${escapeHTML(b.bazarId)}')">Administrar</button>` : ""}</td></tr>`).join("")
    : `<tr><td colspan="6" style="color:var(--color-text-muted);padding:16px;text-align:center;">Aún no hay bazares.</td></tr>`;
  const cuentas = o.cuentas.length ? o.cuentas.slice().sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")).map((u) => `<tr>
      <td><strong>${escapeHTML(u.nombre)}</strong></td>
      <td>${u.estado === "suspendido" ? "⛔ Suspendida" : u.activo ? "🟢 Activa ahora" : u.sinVolver ? "🕓 Solo canjeó el código" : `⚪ Vista ${_adAgo(u.visto)}`}</td>
      <td>${u.bazares}</td><td>${u.creditos}</td>
      <td><button class="${u.estado === "suspendido" ? "btn-secondary" : "btn-danger"} btn-sm" onclick="adSetUserStatus('${escapeHTML(u.id)}')">${u.estado === "suspendido" ? "Reactivar" : "Suspender"}</button></td></tr>`).join("")
    : `<tr><td colspan="5" style="color:var(--color-text-muted);padding:16px;text-align:center;">Aún no hay cuentas.</td></tr>`;
  return `<div class="stats-row">${_adKpi("🏪", o.bazares.length, "Bazares")}${_adKpi("👤", o.cuentas.length, "Cuentas")}${_adKpi("🟢", activas, "Activas ahora", "accent-green")}</div>
    <h3 class="caja-h">Bazares</h3>
    <div class="payments-table-wrap"><table class="payments-table" style="min-width:38rem;"><thead><tr><th>Bazar</th><th>Administradores</th><th>Miembros</th><th>Registros</th><th>Último cambio</th><th></th></tr></thead><tbody>${bazares}</tbody></table></div>
    <h3 class="caja-h">Cuentas</h3>
    <div class="payments-table-wrap"><table class="payments-table" style="min-width:34rem;"><thead><tr><th>Persona</th><th>Estado</th><th>Bazares</th><th>Créditos</th><th></th></tr></thead><tbody>${cuentas}</tbody></table></div>
    <p class="form-hint">Suspender una cuenta le corta el acceso en su siguiente consulta; no borra sus datos ni sus membresías. Reactivarla lo restaura.</p>
    <h3 class="caja-h">👑 Códigos para crear bazares</h3>
    <div class="caja-add" style="grid-template-columns:6rem 6rem minmax(0,1fr) auto;">
      <input id="ad-own-usos" class="form-input" type="number" min="1" max="50" value="1" aria-label="Bazares que permite crear" title="Bazares que permite crear">
      <input id="ad-own-dias" class="form-input" type="number" min="1" max="90" value="7" aria-label="Días de validez" title="Días de validez">
      <input id="ad-own-nota" class="form-input" type="text" maxlength="80" placeholder="Nota (opcional)" aria-label="Nota">
      <button class="btn-primary" onclick="adOwnerCode()">Generar</button>
    </div>
    <div id="ad-owner-result"></div>
    ${_adCodesTable(_ad.ownerCodes, false)}`;
}

// ── Acciones ──
async function _adDo(fn, okMsg) {
  try { await fn(); if (okMsg) showToast(okMsg); await refreshAdmin(); }
  catch (err) { showToast(`❌ ${err.message}`, "error"); }
}
function adSetRol(userId, rol) { return _adDo(() => _adTx().call("setRole", { bazarId: _ad.bazarId, userId, rol }), "✅ Rol actualizado"); }
async function adRemove(userId) {
  const m = _ad.members.find((x) => x.userId === userId);
  if (!m || !await appConfirm(`¿Quitar a ${m.nombre} de este bazar? Dejará de ver sus datos.`, "Quitar miembro", "Quitar")) return;
  return _adDo(() => _adTx().call("removeMember", { bazarId: _ad.bazarId, userId }), "Miembro quitado");
}
function adRevoke(id) { return _adDo(() => _adTx().call("revokeCode", { id }), "Código revocado"); }
async function adSetUserStatus(userId) {
  const u = _ad.overview?.cuentas.find((x) => x.id === userId);
  if (!u) return;
  const suspender = u.estado !== "suspendido";
  if (!await appConfirm(suspender ? `¿Suspender la cuenta de ${u.nombre}? Perderá el acceso a todos sus bazares hasta que la reactives.` : `¿Reactivar la cuenta de ${u.nombre}?`,
    suspender ? "Suspender cuenta" : "Reactivar cuenta", suspender ? "Suspender" : "Reactivar")) return;
  return _adDo(() => _adTx().call("setUserStatus", { userId, estado: suspender ? "suspendido" : "activo" }), suspender ? "Cuenta suspendida" : "Cuenta reactivada");
}
async function adOpenBazar(id) {
  if (!AppState.bazaars[id]) return;
  switchBazaar(id);
  _ad.tab = "miembros";
  await renderAdmin();
}
function _adShowCode(targetId, res) {
  const el = document.getElementById(targetId);
  if (!el) return;
  el.innerHTML = `<div class="caja-preview"><strong style="font-size:1.25rem;letter-spacing:.06em;">${escapeHTML(res.code)}</strong>
    <button class="btn-secondary btn-sm" onclick="adCopy('${escapeHTML(res.code)}')">📋 Copiar</button><br>
    <small>${res.usos} uso(s) · vence el ${_adDate(res.expira)}. Guárdalo ahora: no se vuelve a mostrar completo.</small></div>`;
}
async function adInvite() {
  try {
    const res = await _adTx().call("invite", { bazarId: _ad.bazarId, rol: document.getElementById("ad-inv-rol").value,
      usos: Number(document.getElementById("ad-inv-usos").value), dias: Number(document.getElementById("ad-inv-dias").value), nota: document.getElementById("ad-inv-nota").value });
    await refreshAdmin();
    _adShowCode("ad-code-result", res);
  } catch (err) { showToast(`❌ ${err.message}`, "error"); }
}
async function adOwnerCode() {
  try {
    const res = await _adTx().call("ownerCode", { usos: Number(document.getElementById("ad-own-usos").value), dias: Number(document.getElementById("ad-own-dias").value), nota: document.getElementById("ad-own-nota").value });
    await refreshAdmin();
    _adShowCode("ad-owner-result", res);
  } catch (err) { showToast(`❌ ${err.message}`, "error"); }
}
function adCopy(text) {
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => showToast("📋 Código copiado"), () => showToast("Selecciona y copia el código a mano", "error"));
}

/** CSV de los miembros que se ven con los filtros actuales (separador ; y BOM, igual que los demás CSV de la app). */
function adCSV() {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = _adMiembrosFiltrados().map((m) => [m.nombre, m.rol === "admin" ? "Administrador" : m.rolNombre || _adRoleLabel(m.rol), m.rank,
    _adEstadoHTML(m).replace(/^\S+\s/, ""), m.desde, m.visto]);
  return "\ufeff" + [["Nombre", "Rol", "Rango", "Estado", "Miembro desde", "Última conexión"], ...rows].map((r) => r.map(q).join(";")).join("\n");
}
function adExportCSV() {
  const bz = AppState.bazaars[_ad.bazarId];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([adCSV()], { type: "text/csv;charset=utf-8" }));
  a.download = `miembros_${(bz?.name || "bazar").replace(/[^a-z0-9]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  showToast("✅ Miembros exportados");
}

if (typeof module !== "undefined") module.exports = { _adConteos, _adEstado };
