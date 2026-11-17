/**
 * BAZARIX — equipo.js (Sprint 3)
 * Ventana "Miembros y roles" del modo Equipo: miembros, códigos de invitación y roles personalizados.
 * Todo se pide al servidor (que valida que seas administrador): aquí solo se muestra y se manda.
 * Dependencias: storage.js (TeamAdapter, teamMe, teamIsAdmin…), utils.js, dialogs.js, modales.js
 */
const _eq = { bazarId: "", members: [], codes: [], ownerCodes: [], editingRole: null };

function _eqBody() { return document.getElementById("equipo-body"); }
const _eqTx = () => TeamAdapter.tx();

async function openEquipo() {
  if (StorageAdapter.mode() !== "team") { showToast("Esto es del modo Equipo", "error"); return; }
  const bz = getActiveBazaar();
  if (!bz && !teamIsOwner()) { showToast("Abre un bazar primero", "error"); return; }
  _eq.bazarId = bz?.id || "";
  _eq.editingRole = null;
  document.getElementById("settings-menu")?.classList.remove("open");
  _eqBody().innerHTML = `<p class="form-hint">Cargando…</p>`;
  openModal("modal-equipo");
  await refreshEquipo();
}

async function refreshEquipo() {
  try {
    await TeamAdapter.loadMe();
    const id = _eq.bazarId;
    _eq.members = []; _eq.codes = []; _eq.ownerCodes = [];
    if (id && teamIsAdmin(id)) {
      const [m, c] = await Promise.all([_eqTx().call("members", { bazarId: id }), _eqTx().call("codes", { bazarId: id })]);
      _eq.members = m.members;
      _eq.codes = c.codes;
    }
    if (teamIsOwner()) _eq.ownerCodes = (await _eqTx().call("codes", {})).codes.filter((c) => c.tipo === "crear");
    renderEquipo();
  } catch (err) {
    _eqBody().innerHTML = `<p class="form-hint">❌ No se pudo cargar: ${escapeHTML(err.message)}</p>`;
  }
}

const _eqRoles = () => (teamMe()?.roles || []).filter((r) => r.bazarId === _eq.bazarId).sort((a, b) => b.rank - a.rank);
function _eqRoleOptions(selected) {
  return `<option value="vista" ${selected === "vista" ? "selected" : ""}>Vista (solo lectura)</option>
    <option value="admin" ${selected === "admin" ? "selected" : ""}>Administrador</option>` +
    _eqRoles().map((r) => `<option value="${escapeHTML(r.id)}" ${selected === r.id ? "selected" : ""}>${escapeHTML(r.nombre)}</option>`).join("");
}
function _eqRoleLabel(rol) {
  return rol === "admin" ? "Administrador" : rol === "vista" ? "Vista" : (_eqRoles().find((r) => r.id === rol)?.nombre || "Rol eliminado");
}
function _eqAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!iso || Number.isNaN(ms)) return "nunca";
  const m = Math.floor(ms / 60000);
  return m < 1 ? "hace un momento" : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.floor(m / 60)} h` : `hace ${Math.floor(m / 1440)} d`;
}
const _eqDate = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-MX", { day: "numeric", month: "short" }); };

function renderEquipo() {
  const me = teamMe(), id = _eq.bazarId, bz = AppState.bazaars[id];
  const mine = teamRoleFor(id);
  const admin = id && teamIsAdmin(id);
  let html = `<p><strong>${escapeHTML(me.user.nombre)}</strong> · ${me.user.owner ? "Dueño de la hoja" : `Tu rol${bz ? ` en «${escapeHTML(bz.name)}»` : ""}: <strong>${escapeHTML(mine?.rolNombre || "Sin acceso")}</strong>`}</p>`;
  if (!id) html += `<p class="form-hint">Abre un bazar para administrar sus miembros.</p>`;
  else if (!admin) html += `<p class="form-hint">Solo los administradores del bazar ven y cambian miembros, códigos y roles. Pídele a uno que te asigne el rol que necesitas.</p>`;
  else html += _eqMembersHTML() + _eqInviteHTML() + _eqCodesHTML() + _eqRolesHTML();
  if (me.user.owner) html += _eqOwnerHTML();
  _eqBody().innerHTML = html;
}

function _eqMembersHTML() {
  const rows = _eq.members.length ? _eq.members.map((m) => `<tr>
      <td>${m.activo ? "🟢" : "⚪"} <strong>${escapeHTML(m.nombre)}</strong><br><small style="color:var(--color-text-muted);">${m.activo ? "activo ahora" : `visto ${_eqAgo(m.visto)}`} · desde ${_eqDate(m.desde)}</small></td>
      <td><select class="form-select" aria-label="Rol de ${escapeHTML(m.nombre)}" onchange="equipoSetRol('${escapeHTML(m.userId)}',this.value)">${_eqRoleOptions(m.rol)}</select></td>
      <td><button class="btn-danger btn-sm" onclick="equipoRemove('${escapeHTML(m.userId)}','${escapeHTML(m.nombre)}')" aria-label="Quitar a ${escapeHTML(m.nombre)}">🗑️</button></td></tr>`).join("")
    : `<tr><td colspan="3" style="color:var(--color-text-muted);padding:16px;text-align:center;">Aún no hay miembros.</td></tr>`;
  return `<h3 class="caja-h">Miembros</h3><div class="payments-table-wrap"><table class="payments-table" style="min-width:26rem;"><thead><tr><th>Persona</th><th>Rol</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function _eqInviteHTML() {
  return `<h3 class="caja-h">Invitar con un código</h3>
    <div class="caja-add" style="grid-template-columns:minmax(0,1.2fr) 6rem 6rem minmax(0,1fr) auto;">
      <select id="eq-inv-rol" class="form-select" aria-label="Rol de quien se une">${_eqRoleOptions("vista")}</select>
      <input id="eq-inv-usos" class="form-input" type="number" min="1" max="100" value="1" aria-label="Usos del código" title="Cuántas personas pueden usarlo">
      <input id="eq-inv-dias" class="form-input" type="number" min="1" max="60" value="7" aria-label="Días de validez" title="Días de validez">
      <input id="eq-inv-nota" class="form-input" type="text" maxlength="80" placeholder="Nota (opcional)" aria-label="Nota">
      <button class="btn-primary" onclick="equipoInvite()">Generar</button>
    </div>
    <p class="form-hint">Rol · usos · días de validez. Quien lo use entra con ese rol (por defecto, Vista).</p>
    <div id="eq-code-result"></div>`;
}

function _eqCodesHTML() {
  const rows = _eq.codes.filter((c) => c.estado === "activo").map((c) => `<tr>
    <td>${escapeHTML(_eqRoleLabel(c.rol))}</td><td>${c.usos}</td><td>${_eqDate(c.expira)}</td><td>${escapeHTML(c.nota || "")}</td>
    <td><button class="btn-secondary btn-sm" onclick="equipoRevoke('${escapeHTML(c.id)}')">Revocar</button></td></tr>`).join("");
  return rows ? `<h3 class="caja-h">Códigos activos</h3><div class="payments-table-wrap"><table class="payments-table" style="min-width:26rem;"><thead><tr><th>Rol</th><th>Usos</th><th>Vence</th><th>Nota</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="form-hint">Por seguridad el código completo solo se muestra al crearlo.</p>` : "";
}

function _eqRolesHTML() {
  const roles = _eqRoles();
  const list = roles.length ? roles.map((r) => `<tr>
      <td><span class="bz-dot" style="background:${escapeHTML(r.color)}"></span><strong>${escapeHTML(r.nombre)}</strong></td><td>${r.rank}</td><td>${r.permisos.length}</td>
      <td><button class="btn-secondary btn-sm" onclick="equipoEditRole('${escapeHTML(r.id)}')">✏️</button> <button class="btn-danger btn-sm" onclick="equipoDeleteRole('${escapeHTML(r.id)}','${escapeHTML(r.nombre)}')">🗑️</button></td></tr>`).join("")
    : `<tr><td colspan="4" style="color:var(--color-text-muted);padding:16px;text-align:center;">Sin roles personalizados.</td></tr>`;
  const presets = (me => me.catalogo.plantillas)(teamMe()).map((p, i) => `<button class="btn-secondary btn-sm" onclick="equipoPreset(${i})">${escapeHTML(p.nombre)}</button>`).join(" ");
  return `<h3 class="caja-h">Roles personalizados</h3>
    <div class="payments-table-wrap"><table class="payments-table" style="min-width:24rem;"><thead><tr><th>Rol</th><th title="Si dos personas editan lo mismo, gana el rango mayor">Rango</th><th>Permisos</th><th></th></tr></thead><tbody>${list}</tbody></table></div>
    <p class="form-hint">Administrador tiene todos los permisos (rango 100); Vista, ninguno. En un choque de ediciones gana el rango mayor.</p>
    <div style="margin:var(--space-3) 0;"><button class="btn-primary btn-sm" onclick="equipoEditRole('')">＋ Nuevo rol</button> <span class="form-hint">o parte de una plantilla:</span> ${presets}</div>
    <div id="eq-role-form">${_eq.editingRole ? _eqRoleFormHTML() : ""}</div>`;
}

function _eqRoleFormHTML() {
  const r = _eq.editingRole, groups = {};
  teamMe().catalogo.permisos.forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
  const checks = Object.entries(groups).map(([g, list]) => `<fieldset class="eq-group"><legend>${escapeHTML(g)}</legend>${list.map((p) =>
    `<label class="check-inline"><input type="checkbox" class="eq-perm" value="${escapeHTML(p.key)}" ${r.permisos.includes(p.key) ? "checked" : ""}> ${escapeHTML(p.label)}</label>`).join("")}</fieldset>`).join("");
  return `<div class="ficha-dias-box">
    <div class="form-row">
      <div class="form-group"><label class="form-label" for="eq-role-nombre">Nombre del rol</label><input id="eq-role-nombre" class="form-input" maxlength="40" value="${escapeHTML(r.nombre)}"></div>
      <div class="form-group"><label class="form-label" for="eq-role-rank">Rango (1 a 99)</label><input id="eq-role-rank" class="form-input" type="number" min="1" max="99" value="${r.rank}"></div>
    </div>
    <div class="form-group"><label class="form-label" for="eq-role-color">Color</label><input id="eq-role-color" type="color" class="table-color-input" value="${escapeHTML(r.color)}"></div>
    ${checks}
    <div style="display:flex;gap:8px;margin-top:var(--space-3);"><button class="btn-primary" onclick="equipoSaveRole()">Guardar rol</button><button class="btn-secondary" onclick="equipoEditRole(null)">Cancelar</button></div></div>`;
}

function _eqOwnerHTML() {
  const rows = _eq.ownerCodes.filter((c) => c.estado === "activo").map((c) => `<tr><td>${c.usos}</td><td>${_eqDate(c.expira)}</td><td>${escapeHTML(c.nota || "")}</td>
    <td><button class="btn-secondary btn-sm" onclick="equipoRevoke('${escapeHTML(c.id)}')">Revocar</button></td></tr>`).join("");
  return `<h3 class="caja-h">👑 Códigos para crear bazares (solo el dueño)</h3>
    <p class="form-hint">Cada código da créditos para crear bazares. Quien crea un bazar queda como su administrador.</p>
    <div class="caja-add" style="grid-template-columns:6rem 6rem minmax(0,1fr) auto;">
      <input id="eq-own-usos" class="form-input" type="number" min="1" max="50" value="1" aria-label="Bazares que permite crear" title="Bazares que permite crear">
      <input id="eq-own-dias" class="form-input" type="number" min="1" max="90" value="7" aria-label="Días de validez" title="Días de validez">
      <input id="eq-own-nota" class="form-input" type="text" maxlength="80" placeholder="Nota (opcional)" aria-label="Nota">
      <button class="btn-primary" onclick="equipoOwnerCode()">Generar</button>
    </div>
    <div id="eq-owner-result"></div>
    ${rows ? `<div class="payments-table-wrap" style="margin-top:var(--space-3);"><table class="payments-table" style="min-width:22rem;"><thead><tr><th>Bazares</th><th>Vence</th><th>Nota</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : ""}`;
}

function _eqShowCode(targetId, res) {
  document.getElementById(targetId).innerHTML = `<div class="caja-preview"><strong style="font-size:1.25rem;letter-spacing:.06em;">${escapeHTML(res.code)}</strong>
    <button class="btn-secondary btn-sm" onclick="equipoCopy('${escapeHTML(res.code)}')">📋 Copiar</button><br>
    <small>${res.usos} uso(s) · vence el ${_eqDate(res.expira)}. Guárdalo ahora: no se vuelve a mostrar completo.</small></div>`;
}

async function _eqDo(fn, okMsg) {
  try { await fn(); if (okMsg) showToast(okMsg); await refreshEquipo(); }
  catch (err) { showToast(`❌ ${err.message}`, "error"); }
}

function equipoSetRol(userId, rol) { return _eqDo(() => _eqTx().call("setRole", { bazarId: _eq.bazarId, userId, rol }), "✅ Rol actualizado"); }
async function equipoRemove(userId, nombre) {
  if (!await appConfirm(`¿Quitar a ${nombre} de este bazar? Dejará de ver sus datos.`, "Quitar miembro", "Quitar")) return;
  return _eqDo(() => _eqTx().call("removeMember", { bazarId: _eq.bazarId, userId }), "Miembro quitado");
}
async function equipoInvite() {
  try {
    const res = await _eqTx().call("invite", { bazarId: _eq.bazarId, rol: document.getElementById("eq-inv-rol").value,
      usos: Number(document.getElementById("eq-inv-usos").value), dias: Number(document.getElementById("eq-inv-dias").value), nota: document.getElementById("eq-inv-nota").value });
    await refreshEquipo();
    _eqShowCode("eq-code-result", res);
  } catch (err) { showToast(`❌ ${err.message}`, "error"); }
}
async function equipoOwnerCode() {
  try {
    const res = await _eqTx().call("ownerCode", { usos: Number(document.getElementById("eq-own-usos").value), dias: Number(document.getElementById("eq-own-dias").value), nota: document.getElementById("eq-own-nota").value });
    await refreshEquipo();
    _eqShowCode("eq-owner-result", res);
  } catch (err) { showToast(`❌ ${err.message}`, "error"); }
}
function equipoRevoke(id) { return _eqDo(() => _eqTx().call("revokeCode", { id }), "Código revocado"); }
function equipoCopy(text) {
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => showToast("📋 Código copiado"), () => showToast("Selecciona y copia el código a mano", "error"));
}

function equipoEditRole(id) {
  if (id === null) _eq.editingRole = null;
  else if (id === "") _eq.editingRole = { id: "", nombre: "", color: "#0d9488", rank: 10, permisos: [] };
  else { const r = _eqRoles().find((x) => x.id === id); _eq.editingRole = r ? { ...r, permisos: [...r.permisos] } : null; }
  document.getElementById("eq-role-form").innerHTML = _eq.editingRole ? _eqRoleFormHTML() : "";
}
function equipoPreset(i) {
  const p = teamMe().catalogo.plantillas[i];
  _eq.editingRole = { id: "", nombre: p.nombre, color: p.color, rank: p.rank, permisos: [...p.permisos] };
  document.getElementById("eq-role-form").innerHTML = _eqRoleFormHTML();
}
function equipoSaveRole() {
  const r = _eq.editingRole;
  if (!r) return;
  const body = { bazarId: _eq.bazarId, id: r.id || undefined, nombre: document.getElementById("eq-role-nombre").value,
    rank: Number(document.getElementById("eq-role-rank").value), color: document.getElementById("eq-role-color").value,
    permisos: [...document.querySelectorAll(".eq-perm:checked")].map((b) => b.value) };
  _eq.editingRole = null;
  return _eqDo(() => _eqTx().call("saveRole", body), "✅ Rol guardado");
}
async function equipoDeleteRole(id, nombre) {
  if (!await appConfirm(`¿Eliminar el rol "${nombre}"? Quien lo tenga pasará a Vista.`, "Eliminar rol")) return;
  return _eqDo(() => _eqTx().call("deleteRole", { bazarId: _eq.bazarId, id }), "Rol eliminado");
}
