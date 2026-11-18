/**
 * BAZARIX — permisos.js (Sprint 4)
 * Oculta o desactiva en pantalla lo que tu rol no puede hacer (el servidor lo valida SIEMPRE igual: esto solo evita confusión).
 * Pone clases "deny-<area>" en <body>; permisos.css decide qué botones y campos se ocultan en cada una.
 * Dependencias: storage.js (teamMe, teamRoleFor, StorageAdapter), state.js (getActiveBazaar)
 */
const GATE_AREAS = {
  exp:       (p) => p("expositores:edit"),                                  // registrar, editar, borrar, banear
  pay:       (p) => p("payments:set") || p("expositores:edit"),             // marcar pagado
  check:     (p) => p("checklist:toggle") || p("expositores:edit"),         // pendientes del expositor
  plano:     (p) => p("plano:edit"),                                        // editar y mover en el plano
  asist:     (p) => p("attendance:set") || p("plano:edit"),                 // asistencia de mesas
  inv:       (p) => p("invitados:edit"),                                    // alta/baja en la lista de asistencia
  invtoggle: (p) => p("attendance:set") || p("invitados:edit"),             // confirmar / asistió
  costos:    (p) => p("costos:edit"),
  caja:      (p) => p("caja:edit"),
  extras:    (p) => p("extras:edit"),
  staff:     (p) => p("staff:edit"),
  tareas:    (p) => p("tareas:edit"),
  compras:   (p) => p("compras:edit"),
  act:       (p) => p("actividades:edit"),
  ficha:     (p) => p("ficha:edit"),
  admin:     (p, ctx) => ctx.admin,                                         // eliminar/duplicar el bazar
  catalogos: (p, ctx) => ctx.anyAdmin,                                      // categorías, características, expositores guardados
};

function teamIsAnyAdmin() {
  const me = teamMe();
  return Boolean(me && (me.user?.owner || (me.memberships || []).some((m) => m.todo)));
}

/** { área: true/false } según tu rol en ese bazar; null = sin restricciones (modo Local o sin datos de rol). */
function roleAreas(bazarId) {
  if (StorageAdapter.mode() !== "team" || !teamMe()) return null;
  const role = bazarId ? teamRoleFor(bazarId) : { todo: true, permisos: [] };   // sin bazar abierto no hay nada que restringir
  const p = (perm) => Boolean(role && (role.todo || (role.permisos || []).includes(perm)));
  const ctx = { admin: Boolean(role && role.todo), anyAdmin: teamIsAnyAdmin() };
  const out = {};
  Object.entries(GATE_AREAS).forEach(([k, fn]) => { out[k] = Boolean(fn(p, ctx)); });
  return out;
}

function roleBadgeText(bazarId) {
  const r = teamRoleFor(bazarId);
  if (!r) return "Sin acceso";
  if (r.rol === "owner") return "👑 Dueño";
  if (r.todo) return "🛡️ Admin";
  if (r.rol === "vista") return "👁️ Vista (solo lectura)";
  return `🎭 ${r.rolNombre || "Rol"}`;
}

/** Aplica las clases deny-* y la insignia con tu rol (junto al selector de bazar). */
function applyRoleGate() {
  if (typeof document === "undefined") return;
  const bz = typeof getActiveBazaar === "function" ? getActiveBazaar() : null;
  const areas = roleAreas(bz?.id);
  Object.keys(GATE_AREAS).forEach((k) => document.body.classList.toggle(`deny-${k}`, Boolean(areas) && !areas[k]));
  const badge = document.getElementById("role-badge");
  if (badge) {
    badge.hidden = !(areas && bz);
    if (areas && bz) badge.textContent = roleBadgeText(bz.id);
  }
  if (typeof updateAdminNav === "function") updateAdminNav();   // la pantalla Administración solo la ven dueño y admins
}

if (typeof module !== "undefined") module.exports = { GATE_AREAS, roleAreas, applyRoleGate };
