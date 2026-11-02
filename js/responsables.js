/**
 * BAZARIX — responsables.js
 * Staff del evento: catálogo de Roles y directorio de Responsables (por bazar).
 * Los campos "Responsable" de Tareas, Compras y Minuto a Minuto ya no son
 * texto libre: apuntan (por id) a una persona de este directorio.
 * Dependencias: state.js, utils.js
 */

let staffSearchQuery = "";
let staffRoleFilter = "all";

// ==========================================
// LECTURA / HELPERS COMPARTIDOS
// ==========================================
function getResponsable(id, bz = getActiveBazaar()) {
  return (bz?.responsables || []).find((r) => r.id === id) || null;
}

function getResponsableNombre(id, bz = getActiveBazaar()) {
  return getResponsable(id, bz)?.nombre || "";
}

function getRol(id, bz = getActiveBazaar()) {
  return (bz?.roles || []).find((r) => r.id === id) || null;
}

function getRolNombre(id, bz = getActiveBazaar()) {
  return getRol(id, bz)?.nombre || "";
}

/** <option> compartido por los selects de Tareas, Compras y Minuto a Minuto. */
function responsableOptionsHTML(selectedId, bz = getActiveBazaar()) {
  const lista = (bz?.responsables || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const opts = lista.map((r) => {
    const rol = getRolNombre(r.rolId, bz);
    return `<option value="${escapeHTML(r.id)}" ${r.id === selectedId ? "selected" : ""}>${escapeHTML(r.nombre)}${rol ? ` · ${escapeHTML(rol)}` : ""}</option>`;
  }).join("");
  return `<option value="">-- Sin asignar --</option>${opts}`;
}

// ==========================================
// ROL + RESPONSABLE (dos selects encadenados)
// Se guarda: responsableId (persona) y areaRolId (solo cuando aún no hay persona).
// Con persona elegida, el rol se deduce de ella, así que si cambia su rol se actualiza solo.
// ==========================================
const ROL_NINGUNO = "__none";

function getItemRol(item, bz = getActiveBazaar()) {
  const persona = getResponsable(item?.responsableId, bz);
  if (persona) return persona.rolId || ROL_NINGUNO;
  return item?.areaRolId || "";
}
function getItemRolNombre(item, bz = getActiveBazaar()) {
  return getRolNombre(getItemRol(item, bz), bz);
}
/** Para exportar: la persona, o el área si todavía no hay persona. */
function getItemResponsableTexto(item, bz = getActiveBazaar()) {
  return getResponsableNombre(item?.responsableId, bz) || getItemRolNombre(item, bz);
}

function rolOptionsHTML(selectedRol, bz = getActiveBazaar()) {
  const roles = bz?.roles || [];
  const hayPersonasSinRol = (bz?.responsables || []).some((r) => !r.rolId) || selectedRol === ROL_NINGUNO;
  return `<option value="">-- Rol / área --</option>` +
    roles.map((r) => `<option value="${escapeHTML(r.id)}" ${r.id === selectedRol ? "selected" : ""}>${escapeHTML(r.nombre)}</option>`).join("") +
    (hayPersonasSinRol ? `<option value="${ROL_NINGUNO}" ${selectedRol === ROL_NINGUNO ? "selected" : ""}>Sin rol</option>` : "");
}

function personaOptionsHTML(rolId, selectedId, bz = getActiveBazaar()) {
  if (!rolId) return `<option value="">Elige un rol primero</option>`;
  const gente = (bz?.responsables || [])
    .filter((p) => (rolId === ROL_NINGUNO ? !p.rolId : p.rolId === rolId))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (!gente.length) return `<option value="">No hay personas en este rol</option>`;
  return `<option value="">-- Sin asignar --</option>` +
    gente.map((p) => `<option value="${escapeHTML(p.id)}" ${p.id === selectedId ? "selected" : ""}>${escapeHTML(p.nombre)}</option>`).join("");
}

const RESP_KINDS = {
  tarea:  { key: "tareas",         render: () => renderTareas() },
  compra: { key: "compras",        render: () => renderCompras() },
  minuto: { key: "minuteByMinute", render: () => renderMinuteByMinute() },
};

function _respItem(kind, id, bz) {
  return (bz?.[RESP_KINDS[kind]?.key] || []).find((x) => x.id === id) || null;
}

/** Celda de tabla: Rol arriba, Persona abajo. */
function responsableCellHTML(kind, item, bz = getActiveBazaar()) {
  const rol = getItemRol(item, bz);
  const id = escapeHTML(item.id);
  return `<div class="resp-split">
    <select class="form-select" aria-label="Rol o área" onchange="setItemRol('${kind}','${id}',this.value)">${rolOptionsHTML(rol, bz)}</select>
    <select class="form-select" aria-label="Persona responsable" ${rol ? "" : "disabled"} onchange="setItemPersona('${kind}','${id}',this.value)">${personaOptionsHTML(rol, item.responsableId, bz)}</select>
  </div>`;
}

function setItemRol(kind, id, rolId) {
  const bz = getActiveBazaar();
  const item = _respItem(kind, id, bz);
  if (!item) return;
  const persona = getResponsable(item.responsableId, bz);
  if (persona && (persona.rolId || ROL_NINGUNO) !== rolId) item.responsableId = "";
  item.areaRolId = rolId;
  if (kind === "minuto") item.area = getItemRolNombre(item, bz);
  saveState();
  RESP_KINDS[kind].render();
}

function setItemPersona(kind, id, personaId) {
  const bz = getActiveBazaar();
  const item = _respItem(kind, id, bz);
  if (!item) return;
  const rol = getItemRol(item, bz);
  item.responsableId = personaId;
  item.areaRolId = personaId ? "" : rol;   // si se quita la persona, se conserva el rol
  if (kind === "minuto") item.area = getItemRolNombre(item, bz);
  saveState();
  RESP_KINDS[kind].render();
}

// ── Ventanas de alta (tarea / compra / actividad): prefijos "tarea", "compra", "act" ──
function fillModalResponsable(prefix, bz = getActiveBazaar()) {
  const rol = document.getElementById(`${prefix}-rol`);
  const persona = document.getElementById(`${prefix}-responsable`);
  if (rol) rol.innerHTML = rolOptionsHTML("", bz);
  if (persona) { persona.innerHTML = personaOptionsHTML("", "", bz); persona.disabled = true; }
}
function refreshModalPersona(prefix) {
  const rol = document.getElementById(`${prefix}-rol`)?.value || "";
  const persona = document.getElementById(`${prefix}-responsable`);
  if (!persona) return;
  persona.innerHTML = personaOptionsHTML(rol, "", getActiveBazaar());
  persona.disabled = !rol;
}
function readModalResponsable(prefix) {
  const rol = document.getElementById(`${prefix}-rol`)?.value || "";
  const personaId = document.getElementById(`${prefix}-responsable`)?.value || "";
  return { responsableId: personaId, areaRolId: personaId ? "" : rol };
}

// ==========================================
// RENDER: PÁGINA STAFF
// ==========================================
function renderResponsables() {
  const bz = getActiveBazaar();
  if (!bz) return;

  const rolesContainer = document.getElementById("roles-chips");
  if (rolesContainer) {
    rolesContainer.innerHTML = bz.roles.length === 0
      ? `<span style="font-size:var(--fs-xs);color:var(--color-text-muted);">Aún no hay roles. Agrega el primero.</span>`
      : bz.roles.map((rol) => {
          const count = bz.responsables.filter((r) => r.rolId === rol.id).length;
          return `
            <span class="role-chip" style="border-color:${rol.color};color:${rol.color};">
              ${escapeHTML(rol.nombre)}${count ? ` · ${count}` : ""}
              <button type="button" onclick="openModalRol('${rol.id}')" title="Editar rol">✏️</button>
              <button type="button" onclick="deleteRol('${rol.id}')" title="Eliminar rol">✕</button>
            </span>`;
        }).join("");
  }

  const roleFilter = document.getElementById("staff-role-filter");
  if (roleFilter) {
    const previousRole = staffRoleFilter;
    roleFilter.innerHTML = `<option value="all">Todas las etiquetas</option>
      ${bz.roles.map((role) => `<option value="${escapeHTML(role.id)}">${escapeHTML(role.nombre)}</option>`).join("")}
      <option value="__none">Sin etiqueta</option>`;
    staffRoleFilter = bz.roles.some((role) => role.id === previousRole) || previousRole === "all" || previousRole === "__none"
      ? previousRole : "all";
    roleFilter.value = staffRoleFilter;
  }

  const grid = document.getElementById("responsables-grid");
  if (!grid) return;

  if (bz.responsables.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">🙋</span>
        <h3>Sin responsables registrados</h3>
        <p>Agrega a las personas del comité organizador con "+ Agregar Responsable".</p>
      </div>`;
    return;
  }

  const query = staffSearchQuery.trim().toLocaleLowerCase("es");
  const list = bz.responsables.filter((r) => {
    const role = getRol(r.rolId, bz);
    const matchesQuery = !query || [r.nombre, r.tel, r.email, role?.nombre]
      .some((value) => String(value || "").toLocaleLowerCase("es").includes(query));
    const matchesRole = staffRoleFilter === "all"
      || (staffRoleFilter === "__none" ? !r.rolId : r.rolId === staffRoleFilter);
    return matchesQuery && matchesRole;
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  if (!list.length) {
    grid.innerHTML = `<div class="catalog-empty"><span class="catalog-empty-icon">🔎</span><h3>Sin resultados</h3><p>No hay responsables que coincidan con la búsqueda y la etiqueta seleccionada.</p></div>`;
    return;
  }
  grid.innerHTML = list.map((r) => {
    const rol = getRol(r.rolId, bz);
    const tareasCount  = (bz.tareas   || []).filter((t) => t.responsableId === r.id && !t.hecho).length;
    const comprasCount = (bz.compras  || []).filter((c) => c.responsableId === r.id && !c.comprado).length;
    return `
      <div class="expositor-card" style="border-left:5px solid ${rol ? rol.color : "var(--color-border)"};">
        <div class="card-top">
          <div class="expositor-avatar" style="width:48px;height:48px;font-size:1.1rem;">
            ${escapeHTML((r.nombre || "?").charAt(0).toUpperCase())}
          </div>
          <div class="card-info">
            <div class="card-name">${escapeHTML(r.nombre)}</div>
            <span class="card-category" style="${rol ? `background:${rol.color}20;color:${rol.color};` : ""}">${rol ? escapeHTML(rol.nombre) : "Sin rol"}</span>
          </div>
        </div>
        ${(r.tel || r.email) ? `
        <div class="card-contact" style="margin:8px 0;">
          ${r.tel ? `📞 ${escapeHTML(r.tel)}` : ""} ${r.tel && r.email ? "&nbsp;·&nbsp;" : ""} ${r.email ? `✉️ ${escapeHTML(r.email)}` : ""}
        </div>` : ""}
        <div class="card-meta-item" style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-bottom:10px;">
          ${tareasCount ? `✅ ${tareasCount} tarea(s) pendiente(s)` : "✅ Sin tareas pendientes"}
          ${comprasCount ? ` · 🛒 ${comprasCount} compra(s) pendiente(s)` : ""}
        </div>
        <div class="card-actions">
          <button class="btn-secondary btn-sm" onclick="openModalResponsable('${r.id}')">✏️ Editar</button>
          <button class="btn-danger btn-sm" onclick="deleteResponsable('${r.id}')">🗑️ Eliminar</button>
        </div>
      </div>`;
  }).join("");
}

function setStaffSearch(value) {
  staffSearchQuery = String(value || "");
  renderResponsables();
}

function setStaffRoleFilter(roleId) {
  staffRoleFilter = roleId || "all";
  renderResponsables();
}

// ==========================================
// ROLES — modal + CRUD
// ==========================================
function openModalRol(id = null) {
  const form = document.getElementById("form-rol");
  form.reset();
  document.getElementById("rol-id").value = "";
  document.getElementById("rol-color").value = ROLE_COLORS[getActiveBazaar().roles.length % ROLE_COLORS.length];
  document.getElementById("modal-rol-title").textContent = "Nuevo Rol";

  if (id) {
    const rol = getRol(id);
    if (!rol) return;
    document.getElementById("modal-rol-title").textContent = "Editar Rol";
    document.getElementById("rol-id").value = rol.id;
    document.getElementById("rol-nombre").value = rol.nombre;
    document.getElementById("rol-color").value = rol.color || "#0d9488";
  }
  openModal("modal-rol");
}

function saveRolHandler(e) {
  e.preventDefault();
  const bz = getActiveBazaar();
  const id = document.getElementById("rol-id").value;
  const nombre = document.getElementById("rol-nombre").value.trim();
  if (!nombre) return;
  const data = { nombre, color: document.getElementById("rol-color").value || "#0d9488" };

  if (id) {
    const rol = getRol(id, bz);
    if (rol) {
      const oldName = rol.nombre;
      Object.assign(rol, data);
      bz.expositores.forEach((exp) => {
        if (!exp.areaRolId && exp.areaEncargada === oldName) {
          exp.areaRolId = rol.id;
          exp.areaEncargada = rol.nombre;
        }
      });
    }
  } else {
    bz.roles.push({ id: `rol-${Date.now()}`, ...data });
  }
  saveState();
  renderResponsables();
  renderExpositores();
  closeModal("modal-rol");
  showToast(id ? "✅ Rol actualizado" : "✅ Rol agregado");
}

async function deleteRol(id) {
  const bz = getActiveBazaar();
  const roleName = bz.roles.find((role) => role.id === id)?.nombre || "";
  const enUso = bz.responsables.filter((r) => r.rolId === id).length;
  const expositoresEnArea = bz.expositores.filter((exp) => exp.areaRolId === id).length;
  const dependencias = [
    enUso ? `${enUso} responsable(s)` : "",
    expositoresEnArea ? `${expositoresEnArea} expositor(es)` : ""
  ].filter(Boolean).join(" y ");
  const mensaje = dependencias
    ? `${dependencias} tienen este rol y quedarán por asignar. ¿Eliminar de todos modos?`
    : "¿Eliminar este rol?";
  if (!await appConfirm(mensaje, "Eliminar rol")) return;
  bz.roles = bz.roles.filter((r) => r.id !== id);
  bz.responsables.forEach((r) => { if (r.rolId === id) r.rolId = ""; });
  [bz.tareas, bz.compras, bz.minuteByMinute].forEach((list) => (list || []).forEach((x) => { if (x.areaRolId === id) x.areaRolId = ""; }));
  bz.expositores.forEach((exp) => {
    if (exp.areaRolId === id || (!exp.areaRolId && exp.areaEncargada === roleName)) {
      exp.areaRolId = "";
      exp.areaEncargada = "";
      exp.encargadoId = "";
    }
  });
  saveState();
  renderResponsables();
  renderExpositores();
  showToast("🗑️ Rol eliminado");
}

// ==========================================
// RESPONSABLES — modal + CRUD
// ==========================================
function _populateRolSelect(selectedId) {
  const sel = document.getElementById("resp-rol");
  if (!sel) return;
  const bz = getActiveBazaar();
  sel.innerHTML = `<option value="">-- Sin rol --</option>` +
    bz.roles.map((rol) => `<option value="${rol.id}" ${rol.id === selectedId ? "selected" : ""}>${escapeHTML(rol.nombre)}</option>`).join("");
}

function openModalResponsable(id = null) {
  const form = document.getElementById("form-responsable");
  form.reset();
  document.getElementById("resp-id").value = "";
  document.getElementById("modal-resp-title").textContent = "Nuevo Responsable";
  _populateRolSelect("");

  if (id) {
    const r = getResponsable(id);
    if (!r) return;
    document.getElementById("modal-resp-title").textContent = "Editar Responsable";
    document.getElementById("resp-id").value = r.id;
    document.getElementById("resp-nombre").value = r.nombre;
    document.getElementById("resp-tel").value = r.tel || "";
    document.getElementById("resp-email").value = r.email || "";
    _populateRolSelect(r.rolId);
  }
  openModal("modal-responsable");
}

function saveResponsableHandler(e) {
  e.preventDefault();
  const bz = getActiveBazaar();
  const id = document.getElementById("resp-id").value;
  const nombre = document.getElementById("resp-nombre").value.trim();
  if (!nombre) return;
  const data = {
    nombre,
    rolId: document.getElementById("resp-rol").value,
    tel:   document.getElementById("resp-tel").value.trim(),
    email: document.getElementById("resp-email").value.trim(),
  };

  if (id) {
    const r = getResponsable(id, bz);
    if (r) Object.assign(r, data);
  } else {
    bz.responsables.push({ id: `resp-${Date.now()}`, ...data });
  }
  saveState();
  renderResponsables();
  renderTareas();     // los selects de responsable pueden mostrar el nombre nuevo/editado
  renderCompras();
  renderMinuteByMinute();
  closeModal("modal-responsable");
  showToast(id ? "✅ Responsable actualizado" : "✅ Responsable agregado");
}

async function deleteResponsable(id) {
  const bz = getActiveBazaar();
  if (!await appConfirm("¿Eliminar este responsable? Las tareas, compras y actividades que tenía asignadas quedarán sin responsable.", "Eliminar responsable")) return;
  // Antes de quitar a la persona, se conserva su rol en lo que tenía asignado.
  [bz.tareas, bz.compras, bz.minuteByMinute].forEach((list) => (list || []).forEach((x) => { if (x.responsableId === id) x.areaRolId = getItemRol(x, bz); }));
  bz.responsables = bz.responsables.filter((r) => r.id !== id);
  bz.tareas.forEach((t) => { if (t.responsableId === id) t.responsableId = ""; });
  bz.compras.forEach((c) => { if (c.responsableId === id) c.responsableId = ""; });
  (bz.minuteByMinute || []).forEach((row) => { if (row.responsableId === id) row.responsableId = ""; });
  bz.expositores.forEach((exp) => { if (exp.encargadoId === id) exp.encargadoId = ""; });
  saveState();
  renderResponsables();
  renderExpositores();
  renderTareas();
  renderCompras();
  renderMinuteByMinute();
  showToast("🗑️ Responsable eliminado");
}
