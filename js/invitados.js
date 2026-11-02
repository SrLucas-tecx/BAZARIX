/**
 * EXPOSITORES.COM — invitados.js
 * Lista de invitados por bazar: agregar, confirmación, asistencia
 * Dependencias: state.js, utils.js
 */

// 18. LISTA DE INVITADOS DEL BAZAR
// ==========================================
function renderInvitados() {
  const container = document.getElementById("invitados-list");
  if (!container) return;
  const bz = getActiveBazaar();
  const invitados = bz.invitados || [];

  const totalConf  = invitados.filter((i) => i.confirmado).length;
  const totalAsist = invitados.filter((i) => i.asistio).length;
  renderPanelMetricas(bz);

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("inv-stat-total",     invitados.length);
  set("inv-stat-confirmados", totalConf);
  set("inv-stat-asistieron",  totalAsist);

  if (invitados.length === 0) {
    container.innerHTML = `
      <tr><td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:24px;">
        Sin expositores registrados. Agrega uno con "+ Agregar Expositor".
      </td></tr>`;
    return;
  }

  container.innerHTML = invitados.map((inv) => {
    const exp = bz.expositores.find((item) => item.id === inv.expositorId);
    return `
    <tr>
      <td><strong>${escapeHTML(inv.nombre)}</strong></td>
      <td>${exp ? escapeHTML(exp.negocio) : "<span style=\"color:var(--color-text-muted)\">Sin vincular</span>"}</td>
      <td>${notePreviewHTML(inv.notas, "invitado", inv.id)}</td>
      <td>
        <label class="switch" style="transform:scale(0.85);display:inline-block;">
          <input type="checkbox" ${inv.confirmado ? "checked" : ""} onchange="toggleInvConfirmado('${inv.id}')">
          <span class="slider"></span>
        </label>
        <span style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-left:6px;">
          ${inv.confirmado ? "Confirmó" : "Sin confirmar"}
        </span>
      </td>
      <td>
        <label class="switch" style="transform:scale(0.85);display:inline-block;">
          <input type="checkbox" ${inv.asistio ? "checked" : ""} onchange="toggleInvAsistio('${inv.id}')">
          <span class="slider"></span>
        </label>
        <span style="font-size:var(--fs-xs);color:var(--color-text-muted);margin-left:6px;">
          ${inv.asistio ? "Asistió ✅" : "Sin asistir"}
        </span>
      </td>
      <td>
        <button class="btn-secondary btn-sm" onclick="openModalInvitado('${inv.id}')" title="Editar expositor">✏️ Editar</button>
        <button class="btn-danger btn-sm" onclick="deleteInvitado('${inv.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

function toggleInvConfirmado(id) {
  const bz  = getActiveBazaar();
  const inv = (bz.invitados || []).find((i) => i.id === id);
  if (inv) { inv.confirmado = !inv.confirmado; saveState(); renderInvitados(); }
}

function toggleInvAsistio(id) {
  const bz  = getActiveBazaar();
  const inv = (bz.invitados || []).find((i) => i.id === id);
  if (inv) { inv.asistio = !inv.asistio; saveState(); renderInvitados(); }
}

function deleteInvitado(id) {
  const bz = getActiveBazaar();
  bz.invitados = (bz.invitados || []).filter((i) => i.id !== id);
  saveState();
  renderInvitados();
  showToast("🗑️ Invitado eliminado");
}

function openModalInvitado(id = null) {
  document.getElementById("form-invitado").reset();
  document.getElementById("inv-id").value = id || "";
  document.querySelector("#modal-invitado .modal-title").textContent = id ? "Editar Expositor" : "Agregar Expositor";
  document.querySelector("#modal-invitado button[type=submit]").textContent = id ? "Guardar Cambios" : "Guardar Expositor";
  const select = document.getElementById("inv-expositor");
  if (select) {
    select.innerHTML = `<option value="">-- Sin vincular --</option>` +
      getActiveBazaar().expositores.map((exp) => `<option value="${exp.id}">${escapeHTML(exp.negocio)} (${escapeHTML(exp.nombre)})</option>`).join("");
  }
  if (id) {
    const invitado = (getActiveBazaar().invitados || []).find((item) => item.id === id);
    if (!invitado) return;
    document.getElementById("inv-nombre").value = invitado.nombre || "";
    document.getElementById("inv-notas").value = invitado.notas || "";
    document.getElementById("inv-expositor").value = invitado.expositorId || "";
    document.getElementById("inv-confirmado").checked = Boolean(invitado.confirmado);
  }
  openModal("modal-invitado");
}

function saveInvitadoHandler(e) {
  e.preventDefault();
  const bz = getActiveBazaar();
  if (!bz.invitados) bz.invitados = [];
  const id = document.getElementById("inv-id").value;
  const data = {
    nombre: document.getElementById("inv-nombre").value.trim(),
    expositorId: document.getElementById("inv-expositor").value,
    notas: document.getElementById("inv-notas").value.trim(),
    confirmado: document.getElementById("inv-confirmado").checked
  };
  const invitado = bz.invitados.find((item) => item.id === id);
  if (invitado) {
    Object.assign(invitado, data);
  } else {
    bz.invitados.push({ id: "inv-" + Date.now(), ...data, asistio: false });
  }
  saveState();
  renderInvitados();
  closeModal("modal-invitado");
  showToast(invitado ? "✅ Expositor actualizado" : "✅ Expositor agregado");
}
