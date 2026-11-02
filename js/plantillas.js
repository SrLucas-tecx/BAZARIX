/**
 * EXPOSITORES.COM — plantillas.js
 * Guardar y reutilizar expositores como plantillas entre bazares
 * Dependencias: state.js, utils.js
 */

// 17. PLANTILLAS DE EXPOSITORES (guardar y reutilizar)
// ==========================================
async function guardarComoPlantilla(expId) {
  const exp = getActiveBazaar().expositores.find((e) => e.id === expId);
  if (!exp) return;

  // Evita duplicados por negocio+nombre
  const yaExiste = AppState.expositorPlantillas.some(
    (p) => p.negocio === exp.negocio && p.nombre === exp.nombre
  );
  if (yaExiste) {
    if (!await appConfirm(`"${exp.negocio}" ya está guardado como plantilla. ¿Sobreescribir?`, "Sobrescribir plantilla", "Sobrescribir")) return;
    AppState.expositorPlantillas = AppState.expositorPlantillas.filter(
      (p) => !(p.negocio === exp.negocio && p.nombre === exp.nombre)
    );
  }

  AppState.expositorPlantillas.push({
    id:        "plt-" + Date.now(),
    nombre:    exp.nombre,
    negocio:   exp.negocio,
    categoria: exp.categoria,
    caracteristicas: [...(exp.caracteristicas || [])],
    tel:       exp.tel,
    email:     exp.email,
    foto:      exp.foto,
    notas:     exp.notas
  });

  saveState();
  renderPlantillas();
  showToast(`💾 "${exp.negocio}" guardado como plantilla`);
}

function renderPlantillas() {
  const container = document.getElementById("plantillas-grid");
  if (!container) return;
  const list = AppState.expositorPlantillas;
  const bazaarOptions = getBazaarsNewestFirst()
    .map((bz) => `<option value="${bz.id}" ${bz.id === AppState.currentBazaarId ? "selected" : ""}>${escapeHTML(bz.name)}</option>`)
    .join("");

  if (list.length === 0) {
    container.innerHTML = `
      <div class="catalog-empty">
        <span class="catalog-empty-icon">💾</span>
        <h3>Sin plantillas guardadas</h3>
        <p>Usa el botón 💾 en la tarjeta de un expositor para guardarlo aquí.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map((plt) => {
    const cat = AppState.categorias.find((c) => c.id === plt.categoria);
    const catName = getExpositorCategoryLabel(plt);
    return `
      <div class="expositor-card" style="border-top-color:var(--color-accent2);">
        <div class="card-top">
          <div class="expositor-avatar" style="width:48px;height:48px;font-size:1.1rem;">
            ${plt.foto ? `<img src="${plt.foto}" alt="${escapeHTML(plt.negocio)}">` : escapeHTML((plt.negocio || "?").charAt(0))}
          </div>
          <div class="card-info">
            <div class="card-name">${escapeHTML(plt.negocio)}</div>
            <span class="card-category" title="${escapeHTML([cat?.descripcion].filter(Boolean).join(" · "))}">${escapeHTML(catName)}</span>
            ${cat?.descripcion ? `<small class="form-hint">${escapeHTML(cat.descripcion)}</small>` : ""}
            <div class="card-contact">${escapeHTML(plt.nombre)}</div>
          </div>
        </div>
        ${caracteristicasChipsHTML(plt, "plt")}
        <div class="card-contact" style="margin-bottom:10px;">
          📞 ${escapeHTML(plt.tel || "—")} &nbsp;·&nbsp; ✉️ ${escapeHTML(plt.email || "—")}
        </div>
        <div class="card-actions">
          ${bazaarOptions
            ? `<select id="plt-dest-${plt.id}" class="form-select plantilla-dest" aria-label="Bazar de destino">${bazaarOptions}</select>
          <button class="btn-primary btn-sm" onclick="agregarPlantillaABazar('${plt.id}')">➕ Agregar al bazar</button>`
            : `<span class="form-hint">Crea un bazar para poder agregarlo.</span>`}
          <button class="btn-danger btn-sm" onclick="eliminarPlantilla('${plt.id}')" title="Eliminar plantilla" aria-label="Eliminar plantilla">🗑️ Eliminar</button>
        </div>
      </div>`;
  }).join("");
}

function usarPlantilla(pltId) {
  const plt = AppState.expositorPlantillas.find((p) => p.id === pltId);
  if (!plt) return;

  const form = document.getElementById("form-expositor");
  form.reset();
  populateCategoriaSelect();
  document.getElementById("exp-id").value           = "";
  document.getElementById("exp-foto-base64").value  = plt.foto || "";
  document.getElementById("modal-exp-title").textContent = "Nuevo Expositor (desde plantilla)";
  document.getElementById("exp-nombre").value        = plt.nombre;
  document.getElementById("exp-negocio").value       = plt.negocio;
  document.getElementById("exp-categoria").value     = plt.categoria;
  populateExpositorCaracteristicas(plt.caracteristicas || []);
  populateExpositorDias(null, getActiveBazaar());
  document.getElementById("exp-tel").value           = plt.tel || "";
  document.getElementById("exp-email").value         = plt.email || "";
  document.getElementById("exp-notas").value         = plt.notas || "";

  const bz = getActiveBazaar();
  document.getElementById("exp-sillas-por-mesa").value = bz.costsConfig.chairsPerTable ?? 2;
  document.getElementById("exp-costo-silla-extra").value = bz.costsConfig.chairExtraUnitPrice || 0;
  const box = document.getElementById("avatar-preview-box");
  if (box && plt.foto) box.innerHTML = `<img src="${plt.foto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  else if (box) box.innerHTML = "📷";

  populateExpositorAssignmentSelects(bz);
  toggleOtherTableCount();
  updateExpositorColorFields();
  updateExpositorMesaTipo(false);
  applySuggestedBaseCost(true);
  updateExpositorExtraChairFields();
  updateExpositorCostPreview();
  updateExpositorPaymentFields();
  prepareExpositorWizard();
  openModal("modal-expositor");
}

async function eliminarPlantilla(pltId) {
  const plantilla = AppState.expositorPlantillas.find((item) => item.id === pltId);
  if (!plantilla || !await appConfirm(`¿Eliminar "${plantilla.negocio}" de los expositores guardados?`, "Eliminar expositor guardado")) return;
  AppState.expositorPlantillas = AppState.expositorPlantillas.filter((p) => p.id !== pltId);
  saveState();
  renderPlantillas();
  if (document.getElementById("modal-guardados")?.classList.contains("open")) renderPickerGuardados();
  showToast("🗑️ Plantilla eliminada");
}

// ==========================================

// Agrega la plantilla al bazar elegido en su tarjeta (abre el formulario de expositor de ese bazar).
function agregarPlantillaABazar(pltId) {
  const destId = document.getElementById(`plt-dest-${pltId}`)?.value;
  if (!destId || !AppState.bazaars[destId]) { showToast("Elige un bazar de destino", "error"); return; }
  if (destId !== AppState.currentBazaarId) switchBazaar(destId);
  usarPlantilla(pltId);
}

// Selector "Traer de guardados" desde la pantalla de Expositores.
function openPickerGuardados() {
  if (!getActiveBazaar()) return;
  renderPickerGuardados();
  openModal("modal-guardados");
}

function renderPickerGuardados() {
  const box = document.getElementById("guardados-picker");
  const bz = getActiveBazaar();
  if (!box || !bz) return;
  const list = AppState.expositorPlantillas;
  if (!list.length) {
    box.innerHTML = `
      <div class="catalog-empty" style="padding:var(--space-6);">
        <span class="catalog-empty-icon">💾</span>
        <h3>Sin expositores guardados</h3>
        <p>Guarda uno con el botón 💾 de su tarjeta y aparecerá aquí.</p>
      </div>`;
    return;
  }
  box.innerHTML = list.map((plt) => {
    const cat = AppState.categorias.find((c) => c.id === plt.categoria);
    const catName = getExpositorCategoryLabel(plt);
    const yaEsta = bz.expositores.some((e) => e.negocio === plt.negocio && e.nombre === plt.nombre);
    return `
      <div class="picker-row">
        <div class="expositor-avatar picker-avatar">${plt.foto ? `<img src="${plt.foto}" alt="">` : escapeHTML((plt.negocio || "?").charAt(0).toUpperCase())}</div>
        <div class="picker-info"><strong>${escapeHTML(plt.negocio)}</strong><small>${escapeHTML(plt.nombre)} · ${escapeHTML(catName)}</small>${cat?.descripcion ? `<small>${escapeHTML(cat.descripcion)}</small>` : ""}</div>
        ${yaEsta
          ? `<span class="form-hint">Ya está en este bazar</span>`
          : `<button class="btn-primary btn-sm" onclick="usarPlantillaDesdePicker('${plt.id}')">➕ Agregar</button>`}
        <button class="btn-danger btn-sm" onclick="eliminarPlantilla('${plt.id}')" title="Eliminar expositor guardado" aria-label="Eliminar ${escapeHTML(plt.negocio)} de los expositores guardados">🗑️</button>
      </div>`;
  }).join("");
}

function usarPlantillaDesdePicker(pltId) {
  closeModal("modal-guardados");
  usarPlantilla(pltId);
}
