/**
 * EXPOSITORES.COM — bazaars.js
 * CRUD de bazares y pisos, elementos del mapa, imagen de fondo, escala, logo
 * Dependencias: state.js, utils.js
 */

// 7. GESTIÓN DE BAZARES
// [EDITABLE: aquí vive toda la lógica de crear/cambiar/eliminar bazares]
// ==========================================
function renderBazaarSelector() {
  updateNavBazaarLabel();
  const sel = document.getElementById("bazaar-select-global");
  if (!sel) return;
  sel.innerHTML = getBazaarsNewestFirst()
    .map((bz) => `<option value="${bz.id}" ${bz.id === AppState.currentBazaarId ? "selected" : ""}>${escapeHTML(bz.name)}</option>`)
    .join("");
}

function updateMapaBazaarLabel() {
  const el = document.getElementById("mapa-bazaar-name-display");
  if (el) el.textContent = getActiveBazaar()?.name || "—";
  const scaleInput = document.getElementById("map-pixels-per-meter");
  if (scaleInput) scaleInput.value = getPixelsPerMeter();
  renderFloorSelector();
  applyFloorOrientation();
  const opacity = Number(getActiveFloor()?.backgroundOpacity ?? 1);
  const opacityInput = document.getElementById("floor-plan-opacity");
  const opacityValue = document.getElementById("floor-plan-opacity-value");
  if (opacityInput) opacityInput.value = Math.round(opacity * 100);
  if (opacityValue) opacityValue.textContent = `${Math.round(opacity * 100)}%`;
  const floor = getActiveFloor();
  const bgScale = Number(floor?.bgScale || 1);
  const bgScaleInput = document.getElementById("floor-plan-scale");
  const scaleValue = document.getElementById("floor-plan-scale-value");
  if (bgScaleInput) bgScaleInput.value = Math.round(bgScale * 100);
  if (scaleValue) scaleValue.textContent = `${Math.round(bgScale * 100)}%`;
  if (typeof updateScaleBar === "function") updateScaleBar();
}

function getPixelsPerMeter() {
  return Number(getActiveBazaar()?.mapConfig?.pixelsPerMeter) || 100;
}

function updateMapScale(value) {
  const bz = getActiveBazaar();
  const pixelsPerMeter = Math.max(1, Number(value) || 100);
  if (!bz) return;
  if (!bz.mapConfig) bz.mapConfig = defaultMapConfig();
  bz.mapConfig.pixelsPerMeter = pixelsPerMeter;
  saveState();
  updateMapaBazaarLabel();
  showToast(`✅ Escala actualizada: ${pixelsPerMeter} px = 1 m`);
}

function updateFloorPlanOpacity(value) {
  const bz = getActiveBazaar();
  const floor = getActiveFloor(bz);
  if (!bz || !floor) return;
  const opacity = Math.max(0, Math.min(1, Number(value) / 100));
  floor.backgroundOpacity = opacity;
  const output = document.getElementById("floor-plan-opacity-value");
  if (output) output.textContent = `${Math.round(opacity * 100)}%`;
  saveState();
  bazaarCanvas.render();
}

function updateFloorPlanScale(value) {
  const floor = getActiveFloor();
  if (!floor) return;
  floor.bgScale = Math.max(0.25, Math.min(3, Number(value) / 100));
  floor.bgScaleX = floor.bgScale;
  floor.bgScaleY = floor.bgScale;
  const output = document.getElementById("floor-plan-scale-value");
  if (output) output.textContent = `${Math.round(floor.bgScale * 100)}%`;
  saveState();
  bazaarCanvas.render();
}

function moveFloorPlan(deltaX, deltaY) {
  const floor = getActiveFloor();
  if (!floor) return;
  floor.bgX = Number(floor.bgX || 0) + deltaX;
  floor.bgY = Number(floor.bgY || 0) + deltaY;
  saveState();
  bazaarCanvas.render();
}

function rotateFloorPlan(delta) {
  const floor = getActiveFloor();
  if (!floor) return;
  floor.bgRotation = ((Number(floor.bgRotation || 0) + delta) % 360 + 360) % 360;
  saveState();
  bazaarCanvas.render();
  showToast(`✅ Imagen girada a ${floor.bgRotation}°`);
}

function addMapElement() {
  const floor = getActiveFloor();
  if (!floor) return;
  const typeInput = document.getElementById("new-element-type");
  if (typeInput) typeInput.value = "electricidad";
  document.getElementById("new-element-label").value = "";
  document.getElementById("new-element-emoji").value = "⚡";
  document.getElementById("new-element-width").value = 30;
  document.getElementById("new-element-height").value = 30;
  updateNewElementEmoji();
  openModal("modal-nuevo-elemento");
}

function updateNewElementEmoji() {
  const type = document.getElementById("new-element-type")?.value || "otro";
  const defaults = { electricidad: "⚡", pilar: "▣", entrada: "↗", otro: "•" };
  const emojiInput = document.getElementById("new-element-emoji");
  if (emojiInput) emojiInput.value = defaults[type] || "•";
  const labelInput = document.getElementById("new-element-label");
  const hint = document.getElementById("new-element-custom-hint");
  if (labelInput) {
    labelInput.required = type === "otro";
    labelInput.placeholder = type === "otro" ? "Ej. Extintor, columna, área VIP" : "Ej. Contacto eléctrico";
  }
  if (hint) hint.textContent = type === "otro"
    ? "Escribe el nombre del nuevo elemento personalizado."
    : "Puedes cambiar este nombre antes de agregarlo.";
}

function saveNewMapElement() {
  const floor = getActiveFloor();
  const type = document.getElementById("new-element-type").value;
  const defaults = { electricidad: "Zona eléctrica", pilar: "Pilar", entrada: "Entrada", otro: "Elemento" };
  const label = document.getElementById("new-element-label").value.trim();
  const emoji = document.getElementById("new-element-emoji").value.trim() || "•";
  if (!floor) return;
  if (type === "otro" && !label) {
    showToast("Escribe el nombre del elemento personalizado", "error");
    return;
  }
  const elementLabel = label || defaults[type];
  floor.elements = floor.elements || [];
  floor.elements.push({
    id: `element-${Date.now()}`, type, label: elementLabel, emoji, x: 120, y: 120,
    width: Math.max(5, Number(document.getElementById("new-element-width").value || 30)),
    height: Math.max(5, Number(document.getElementById("new-element-height").value || 30))
  });
  saveState();
  bazaarCanvas.render();
  closeModal("modal-nuevo-elemento");
  showToast(`✅ ${elementLabel} agregado al plano`);
}

function openModalMapElementEdit(elementId) {
  const element = (getActiveFloor()?.elements || []).find((item) => item.id === elementId);
  if (!element) return;
  document.getElementById("edit-element-id").value = element.id;
  document.getElementById("edit-element-type").value = element.type || "otro";
  document.getElementById("edit-element-label").value = element.label || "Elemento";
  document.getElementById("edit-element-emoji").value = element.emoji || "•";
  document.getElementById("edit-element-x").value = Math.round(Number(element.x) || 0);
  document.getElementById("edit-element-y").value = Math.round(Number(element.y) || 0);
  document.getElementById("edit-element-width").value = Math.round(Number(element.width) || 30);
  document.getElementById("edit-element-height").value = Math.round(Number(element.height) || 30);
  openModal("modal-editar-elemento");
}

function saveMapElementEdit() {
  const elementId = document.getElementById("edit-element-id").value;
  const element = (getActiveFloor()?.elements || []).find((item) => item.id === elementId);
  if (!element) return;
  element.type = document.getElementById("edit-element-type").value;
  element.label = document.getElementById("edit-element-label").value.trim() || "Elemento";
  element.emoji = document.getElementById("edit-element-emoji").value.trim() || "•";
  element.x = Number(document.getElementById("edit-element-x").value || 0);
  element.y = Number(document.getElementById("edit-element-y").value || 0);
  element.width = Math.max(5, Number(document.getElementById("edit-element-width").value || 30));
  element.height = Math.max(5, Number(document.getElementById("edit-element-height").value || 30));
  bazaarCanvas.selectedElementId = element.id;
  saveState();
  bazaarCanvas.render();
  closeModal("modal-editar-elemento");
  showToast("✅ Elemento actualizado");
}

async function deleteMapElementFromModal() {
  const elementId = document.getElementById("edit-element-id").value;
  const floor = getActiveFloor();
  if (!floor || !await appConfirm("¿Eliminar este elemento del plano?", "Eliminar elemento")) return;
  floor.elements = (floor.elements || []).filter((item) => item.id !== elementId);
  bazaarCanvas.selectedElementId = null;
  saveState();
  bazaarCanvas.render();
  closeModal("modal-editar-elemento");
  showToast("🗑️ Elemento eliminado");
}

function renderFloorSelector() {
  const select = document.getElementById("floor-select");
  const bz = getActiveBazaar();
  if (!select || !bz?.floors) return;
  const multi = bazarEsMultiDia(bz);
  const option = (floor) => `<option value="${floor.id}" ${floor.id === bz.activeFloorId ? "selected" : ""}>${escapeHTML(floor.name)}</option>`;
  if (!multi) {
    select.innerHTML = bz.floors.map(option).join("");
  } else {   // planos agrupados por día
    const grupos = [...bz.evento.dias.map((d, i) => ({ id: d.id, label: getDiaLabel(d, i) })), { id: "", label: "Sin día asignado" }];
    select.innerHTML = grupos.map((g) => {
      const lista = bz.floors.filter((floor) => floorDiaId(floor, bz) === g.id);
      return lista.length ? `<optgroup label="${escapeHTML(g.label)}">${lista.map(option).join("")}</optgroup>` : "";
    }).join("");
  }
  select.disabled = bz.floors.length < 2;
  const wrap = document.getElementById("floor-dia-wrap");
  if (wrap) wrap.hidden = !multi;
  const diaSelect = document.getElementById("floor-dia-select");
  if (diaSelect && multi) {
    diaSelect.innerHTML = `<option value="">Sin día asignado</option>` + bz.evento.dias.map((d, i) =>
      `<option value="${escapeHTML(d.id)}">${escapeHTML(getDiaLabel(d, i))}</option>`).join("");
    diaSelect.value = floorDiaId(getActiveFloor(bz), bz);
  }
  const renameButton = document.querySelector('[onclick="renameCurrentFloor()"]');
  if (renameButton) renameButton.disabled = bz.floors.length === 0;
}

function setFloorDia(value) {
  const bz = getActiveBazaar();
  const floor = getActiveFloor(bz);
  if (!bz || !floor) return;
  floor.dia = bz.evento.dias.some((d) => d.id === value) ? value : "";
  saveState();
  renderAll();
  showToast(floor.dia ? "📅 Día del plano actualizado" : "Plano sin día asignado");
}

// Duplicar el plano activo (mesas, elementos, zonas y fondo) como otro plano, normalmente de otro día.
function duplicateCurrentFloor() {
  const bz = getActiveBazaar();
  const floor = getActiveFloor(bz);
  if (!bz || !floor) return;
  const multi = bazarEsMultiDia(bz);
  const origenDia = floorDiaId(floor, bz);
  let destino = "";
  const group = document.getElementById("dup-plano-dia-group");
  const select = document.getElementById("dup-plano-dia");
  if (group) group.hidden = !multi;
  if (multi && select) {
    const i = bz.evento.dias.findIndex((d) => d.id === origenDia);
    destino = i >= 0 && i + 1 < bz.evento.dias.length ? bz.evento.dias[i + 1].id : "";   // por defecto, el día siguiente
    select.innerHTML = `<option value="">Sin día asignado</option>` + bz.evento.dias.map((d, k) =>
      `<option value="${escapeHTML(d.id)}">${escapeHTML(getDiaLabel(d, k))}</option>`).join("");
    select.value = destino;
  }
  document.getElementById("dup-plano-origen").textContent =
    `Se copiará "${floorLabel(floor, bz)}": ${(floor.tables || []).length} mesa(s), ${(floor.elements || []).length} elemento(s) y ${(floor.zones || []).length} zona(s).`;
  document.getElementById("dup-plano-nombre").value = destino === origenDia ? `${floor.name} (copia)` : floor.name;
  document.getElementById("dup-plano-expositores").checked = true;
  document.getElementById("dup-plano-fondo").checked = true;
  openModal("modal-duplicar-plano");
  setTimeout(() => document.getElementById("dup-plano-nombre")?.select(), 50);
}

function saveDuplicarPlano(e) {
  e.preventDefault();
  const bz = getActiveBazaar();
  const source = getActiveFloor(bz);
  const nombre = document.getElementById("dup-plano-nombre").value.trim();
  if (!bz || !source || !nombre) return;
  const multi = bazarEsMultiDia(bz);
  let dia = multi ? document.getElementById("dup-plano-dia").value : "";
  if (!bz.evento.dias.some((d) => d.id === dia)) dia = "";
  if (bz.floors.some((f) => floorDiaId(f, bz) === dia && f.name.trim().toLowerCase() === nombre.toLowerCase())) {
    showToast("Ya existe un plano con ese nombre en ese día. Cambia el nombre o el día.", "error");
    return;
  }
  const copiarExpositores = document.getElementById("dup-plano-expositores").checked;
  const copiarFondo = document.getElementById("dup-plano-fondo").checked;
  const stamp = Date.now();
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = `${bz.id}-floor-${stamp}`;
  copy.name = nombre;
  copy.dia = dia;
  if (!copiarFondo) Object.assign(copy, { bgImage: null, bgScale: 1, bgScaleX: 1, bgScaleY: 1, bgRotation: 0, bgX: 0, bgY: 0 });
  (copy.elements || []).forEach((el, i) => { el.id = `element-${stamp}-${i}`; });
  (copy.zones || []).forEach((zone, i) => { zone.id = `zone-${stamp}-${i}`; });

  // Mesas por expositor que ya existen en el día destino: el límite de mesas solicitadas es por día.
  const conteo = {};
  bz.floors.filter((f) => floorDiaId(f, bz) === dia).forEach((f) => (f.tables || []).forEach((t) => {
    tableOwnerIds(t).forEach((oid) => { conteo[oid] = (conteo[oid] || 0) + 1; });
  }));
  const tocados = new Set();
  let omitidas = 0;
  (copy.tables || []).forEach((table, i) => {
    table.id = `t-${stamp}-${i}`;
    table.attended = false; table.absent = false; table.attended2 = false; table.absent2 = false;
    [1, 2].forEach((slot) => {   // mesas compartidas: cada mitad se revisa por separado
      const oid = tableSlotValue(table, slot);
      if (!oid) return;
      const exp = bz.expositores.find((item) => item.id === oid);
      if (copiarExpositores && exp && expositorParticipaEnDia(exp, dia, bz) && (conteo[exp.id] || 0) < getExpositorRequestedTableCount(exp)) {
        conteo[exp.id] = (conteo[exp.id] || 0) + 1;
        tocados.add(exp.id);
      } else {
        if (copiarExpositores) omitidas += 1;
        setTableSlot(table, slot, "");
      }
    });
  });

  const previousActive = bz.activeFloorId;
  const resync = () => syncAllTableAssignments(bz);
  bz.floors.push(copy);
  bz.activeFloorId = copy.id;
  resync();
  if (!saveState()) {   // almacenamiento lleno (el fondo duplicado pesa): se deshace la copia
    bz.floors = bz.floors.filter((f) => f !== copy);
    bz.activeFloorId = previousActive;
    resync();
    renderAll();
    syncCanvasWithState();
    showToast("No se pudo duplicar: el almacenamiento está lleno. Prueba sin copiar la imagen de fondo.", "error");
    return;
  }
  closeModal("modal-duplicar-plano");
  renderAll();
  syncCanvasWithState();
  showToast(`✅ Plano "${floorLabel(copy, bz)}" creado${omitidas ? ` · ${omitidas} mesa(s) quedaron libres (el expositor no participa ese día o ya tiene todas sus mesas)` : ""}`);
}

function switchFloor(floorId) {
  const bz = getActiveBazaar();
  if (!bz?.floors?.some((floor) => floor.id === floorId)) return;
  bz.activeFloorId = floorId;
  bazaarCanvas.selectedTableId = null;
  bazaarCanvas.selectedElementId = null;
  saveState();
  bazaarCanvas.loadBgImage();
  bazaarCanvas.loadZones();
  bazaarCanvas.render();
  renderChecklist();
  updateMapaBazaarLabel();
}

async function renameCurrentFloor() {
  const floor = getActiveFloor();
  if (!floor) return;
  const name = await appPrompt("Nombre del piso:", floor.name, "Renombrar piso");
  if (!name?.trim()) return;
  floor.name = name.trim();
  saveState();
  updateMapaBazaarLabel();
  renderExpositores();
  showToast("✅ Nombre del piso actualizado");
}

async function addFloor() {
  const bz = getActiveBazaar();
  if (!bz) return;
  if (!Array.isArray(bz.floors)) bz.floors = [];
  const name = await appPrompt("Nombre del nuevo piso:", `Piso ${(bz.floors?.length || 0) + 1}`, "Agregar piso");
  if (!name?.trim()) return;
  const floor = createFloor(`${bz.id}-floor-${Date.now()}`, name.trim());
  floor.dia = floorDiaId(getActiveFloor(bz), bz);   // el piso nuevo nace en el día que estás viendo
  if (!bz.floors) bz.floors = [];
  bz.floors.push(floor);
  bz.activeFloorId = floor.id;
  saveState();
  renderAll();
  syncCanvasWithState();
  showToast(`✅ ${floor.name} creado`);
}

async function deleteCurrentFloor() {
  const bz = getActiveBazaar();
  if (!bz?.floors || bz.floors.length <= 1) {
    showToast("Debe existir al menos un piso", "error");
    return;
  }
  const floor = getActiveFloor(bz);
  if (!floor || !await appConfirm(`¿Eliminar "${floorLabel(floor, bz)}" y sus mesas?`, "Eliminar piso")) return;
  (floor.tables || []).forEach((table) => removeTableFromExpositorAssignment(bz, table));
  bz.floors = bz.floors.filter((item) => item.id !== floor.id);
  bz.activeFloorId = bz.floors[0].id;
  bazaarCanvas.selectedTableId = null;
  saveState();
  renderAll();
  syncCanvasWithState();
  showToast("🗑️ Piso eliminado");
}

function switchBazaar(bazaarId) {
  if (!AppState.bazaars[bazaarId]) return;
  AppState.currentBazaarId = bazaarId;
  bazaarCanvas.selectedTableId = null;
  saveState();
  renderAll();
  bazaarCanvas.loadBgImage();
  bazaarCanvas.loadZones();
  bazaarCanvas.render();
}

async function createBazaar() {
  const name = await appPrompt("Nombre del nuevo bazar:", "Bazar " + (Object.keys(AppState.bazaars).length + 1), "Nuevo bazar");
  if (!name?.trim()) return;
  const id = "bazaar-" + Date.now();
  AppState.bazaars[id] = {
    id, name: name.trim(), createdAt: Date.now(), color: "", mesasMigradas: true,
    bgImage: null, logoImage: null, mapConfig: defaultMapConfig(),
    expositores: [], tables: [],
    costsConfig: emptyCostsConfig(),
    invitados: [], customMetrics: emptyCustomMetrics(),
    evento: emptyEvento(), tareas: [], compras: [],
    minuteByMinute: emptyMinuteByMinute(),
    floors: [createFloor(`${id}-floor-1`, "Planta baja")], activeFloorId: `${id}-floor-1`
  };
  AppState.currentBazaarId = id;
  saveState();
  renderAll();
  renderBazaresTabla();
  syncCanvasWithState();
  switchTab("ficha");   // el bazar nuevo se abre en su Panel
  showToast(`✅ Bazar "${name.trim()}" creado`);
}

// deleteBazaar: solo disponible desde la sección "Mis Bazares" (sec-bazares)
// [EDITABLE: cambia el mensaje de confirmación aquí]
async function deleteBazaarById(bazaarId) {
  const bz = AppState.bazaars[bazaarId];
  if (!bz) return;
  const esUltimo = Object.keys(AppState.bazaars).length === 1;
  const aviso = esUltimo ? "\n\nEs tu último bazar: la app quedará sin bazares hasta que crees uno nuevo." : "";
  if (!await appConfirm(`¿Eliminar permanentemente el bazar "${bz.name}"? Esta acción no se puede deshacer.${aviso}`, "Eliminar bazar", "Eliminar")) return;
  const wasActive = bazaarId === AppState.currentBazaarId;
  delete AppState.bazaars[bazaarId];
  const remaining = getBazaarsNewestFirst().map((bazaar) => bazaar.id);
  // Solo cambia el bazar activo si el eliminado ERA el activo.
  if (wasActive) AppState.currentBazaarId = remaining[0] || null;
  // Sin bazares la app no crea uno vacío: muestra el estado "sin bazar" en Inicio.
  if (remaining.length === 0) AppState.currentBazaarId = null;
  saveState();
  renderAll();
  syncCanvasWithState();
  renderBazaresTabla();
  showToast(`🗑️ Bazar eliminado`);
}

// Tabla de gestión de bazares (tab "Mis Bazares")
// [EDITABLE: agrega columnas a la tabla aquí y en index.html sec-bazares]
function renderBazaresTabla() {
  const tbody = document.getElementById("bazares-table-body");
  if (!tbody) return;
  const bazList = getBazaarsNewestFirst();
  if (bazList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--color-text-muted);padding:24px;">Sin bazares registrados. Crea el primero con "+ Nuevo Bazar".</td></tr>`;
    return;
  }
  tbody.innerHTML = bazList.map((bz) => {
    const expositores = bz.expositores || [];
    const expCount = expositores.length;
    const paidCount = expositores.filter((e) => e.pagado).length;
    const invCount = (bz.invitados || []).length;
    const isActive = bz.id === AppState.currentBazaarId;
    const color = bazaarColor(bz);
    const logoHtml = bz.logoImage
      ? `<img src="${bz.logoImage}" style="width:36px;height:36px;object-fit:cover;border-radius:8px;border:2px solid var(--color-border);">`
      : `<span style="font-size:1.4rem;">🎪</span>`;
    return `
      <tr class="${isActive ? "active-bazaar-row" : ""}"${isActive && color ? ` style="--bz-color:${color}"` : ""}>
        <td><div style="display:flex;align-items:center;gap:10px;">
          <div class="bazar-logo-mini">${logoHtml}</div>
          <div>
            ${color ? `<span class="bz-dot" style="background:${color}" title="Color del bazar"></span>` : ""}<strong>${escapeHTML(bz.name)}</strong>
            ${isActive ? `<span class="section-count" style="margin-left:6px;font-size:10px;">Activo</span>` : ""}
          </div>
        </div></td>
        <td>${expCount} expositor${expCount !== 1 ? "es" : ""}</td>
        <td>${paidCount}/${expCount} pagados</td>
        <td>${invCount} invitado${invCount !== 1 ? "s" : ""}</td>
        <td><div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn-secondary btn-sm" onclick="switchBazaarAndGo('${bz.id}')" title="Abrir el panel de este bazar">
            📂 Abrir
          </button>
          <button class="btn-secondary btn-sm" onclick="openLogoUploadModal('${bz.id}')">🖼️ Logo</button>
          <button class="btn-secondary btn-sm" onclick="openBazaarColorModal('${bz.id}')" title="Personalizar el color del bazar">🎨 Color</button>
          <button class="btn-secondary btn-sm" onclick="editarFichaBazar('${bz.id}')" title="Editar la ficha del evento: nombre, fecha, lugar…">📝 Editar ficha</button>
          <button class="btn-danger btn-sm" onclick="deleteBazaarById('${bz.id}')">🗑️ Eliminar</button>
        </div></td>
      </tr>`;
  }).join("");
}

function renderBazaarHome() {
  const container = document.getElementById("bazaar-home-grid");
  if (!container) return;
  const bazaars = getBazaarsNewestFirst();
  if (!bazaars.length) {
    container.innerHTML = `<div class="catalog-empty"><span class="catalog-empty-icon">🏪</span><h3>Aún no hay bazares</h3><p>Crea un bazar para empezar a organizar tu evento.</p><button class="btn-primary" style="margin-top:16px;" onclick="createBazaar()">+ Crear mi primer bazar</button></div>`;
    return;
  }
  container.innerHTML = bazaars.map((bz) => {
    const expositores = bz.expositores || [];
    const logo = bz.logoImage
      ? `<img src="${bz.logoImage}" alt="" class="bazaar-home-logo">`
      : `<span class="bazaar-home-emoji" aria-hidden="true">🎪</span>`;
    const active = bz.id === AppState.currentBazaarId;
    const color = bazaarColor(bz);
    return `
      <article class="bazaar-home-card ${active ? "active" : ""}"${active && color ? ` style="--bz-color:${color}"` : ""}>
        <div class="bazaar-home-card-top">
          ${logo}
          ${active ? `<span class="section-count">Activo</span>` : ""}
        </div>
        <h3>${color ? `<span class="bz-dot" style="background:${color}" title="Color del bazar"></span>` : ""}${escapeHTML(bz.name)}</h3>
        <p>${expositores.length} expositor${expositores.length === 1 ? "" : "es"} · ${(bz.floors || []).length} piso${(bz.floors || []).length === 1 ? "" : "s"}</p>
        <button class="btn-primary btn-sm" onclick="switchBazaarAndGo('${bz.id}')">Abrir bazar</button>
      </article>`;
  }).join("");
}

// Abre el Panel del bazar con el formulario de la ficha listo para editar (incluye el nombre).
function editarFichaBazar(id) {
  if (!AppState.bazaars[id]) return;
  switchBazaar(id);
  switchTab("ficha");
  toggleFichaForm(true);
}

function switchBazaarAndGo(id) {
  switchBazaar(id);
  switchTab("ficha");   // abrir un bazar lleva a su Panel
}

async function renameBazaar(id) {
  const bz = AppState.bazaars[id];
  if (!bz) return;
  const newName = await appPrompt("Nuevo nombre del bazar:", bz.name, "Renombrar bazar");
  if (!newName?.trim()) return;
  bz.name = newName.trim();
  saveState();
  renderBazaarSelector();
  renderBazaresTabla();
  renderBazaarHome();
  showToast("✅ Bazar renombrado");
}

// ==========================================
// COLOR DEL BAZAR (personalización)
// Se ve como franja en la fila de Mis Bazares y como acento en la tarjeta de Inicio.
// ==========================================
const BAZAAR_COLORS = ["#0d9488", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#ea580c", "#16a34a"];   // los mismos 8 del engranaje
let _bazaarColorDraft = "";

function bazaarColor(bz) {
  return /^#[0-9a-f]{6}$/i.test(String(bz?.color || "")) ? bz.color : "";
}

function _renderBazaarColorModal() {
  const palette = document.getElementById("bazar-color-palette");
  if (palette) {
    palette.innerHTML = BAZAAR_COLORS.map((hex) =>
      `<button type="button" class="color-swatch ${hex.toLowerCase() === _bazaarColorDraft.toLowerCase() ? "is-selected" : ""}"
        style="background:${hex}" onclick="pickBazaarColor('${hex}')" aria-label="Color ${hex}" title="${hex}"></button>`).join("");
  }
  const input = document.getElementById("bazar-color-input");
  if (input && _bazaarColorDraft) input.value = _bazaarColorDraft;
  const preview = document.getElementById("bazar-color-preview");
  if (preview) {   // mismo resultado con un color de la paleta o uno elegido con el selector
    preview.style.borderLeftColor = _bazaarColorDraft || "transparent";
    preview.style.background = _bazaarColorDraft ? `color-mix(in srgb, ${_bazaarColorDraft} 14%, var(--color-surface-alt))` : "";
  }
  const hint = document.getElementById("bazar-color-hint");
  if (hint) hint.textContent = _bazaarColorDraft ? `Color elegido: ${_bazaarColorDraft}` : "Sin color: se verá con el estilo normal.";
}

function openBazaarColorModal(bazaarId) {
  const bz = AppState.bazaars[bazaarId];
  if (!bz) return;
  document.getElementById("bazar-color-id").value = bazaarId;
  document.getElementById("modal-color-bazaar-name").textContent = bz.name;
  _bazaarColorDraft = bazaarColor(bz);
  _renderBazaarColorModal();
  openModal("modal-color-bazar");
}

function pickBazaarColor(hex) {
  _bazaarColorDraft = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "";
  _renderBazaarColorModal();
}

function clearBazaarColor() {
  _bazaarColorDraft = "";
  _renderBazaarColorModal();
}

function saveBazaarColor() {
  const bz = AppState.bazaars[document.getElementById("bazar-color-id").value];
  if (!bz) return;
  bz.color = _bazaarColorDraft;
  saveState();
  renderBazaresTabla();
  renderBazaarHome();
  closeModal("modal-color-bazar");
  showToast(bz.color ? "🎨 Color del bazar actualizado" : "Color del bazar quitado");
}

/** Cambia el color del bazar activo desde el engranaje ⚙️ ("" = sin color). */
function setActiveBazaarColor(hex) {
  const bz = getActiveBazaar();
  if (!bz) return;
  bz.color = /^#[0-9a-f]{6}$/i.test(String(hex)) ? hex : "";
  saveState();
  renderBazaresTabla();
  renderBazaarHome();
  if (typeof renderSettingsMenu === "function") renderSettingsMenu();
}

// Upload de logo/imagen del bazar
function openLogoUploadModal(bazaarId) {
  document.getElementById("logo-bazar-id").value = bazaarId;
  const bz = AppState.bazaars[bazaarId];
  const preview = document.getElementById("logo-preview-box");
  if (preview) {
    preview.innerHTML = bz?.logoImage
      ? `<img src="${bz.logoImage}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`
      : "🎪";
  }
  const nameEl = document.getElementById("logo-modal-bazaar-name");
  if (nameEl) nameEl.textContent = bz?.name || "";
  openModal("modal-logo-bazar");
}

function handleLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const base64 = evt.target.result;
    document.getElementById("logo-base64").value = base64;
    const preview = document.getElementById("logo-preview-box");
    if (preview) preview.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
  };
  reader.readAsDataURL(file);
}

function saveLogoHandler() {
  const bazaarId = document.getElementById("logo-bazar-id").value;
  const base64   = document.getElementById("logo-base64").value;
  if (!base64) { showToast("Selecciona una imagen primero", "error"); return; }
  const bz = AppState.bazaars[bazaarId];
  if (!bz) return;
  bz.logoImage = base64;
  saveState();
  renderBazaresTabla();
  renderBazaarSelector();
  renderBazaarHome();
  closeModal("modal-logo-bazar");
  showToast("✅ Logo del bazar actualizado");
}

function removeLogoHandler() {
  const bazaarId = document.getElementById("logo-bazar-id").value;
  const bz = AppState.bazaars[bazaarId];
  if (!bz) return;
  bz.logoImage = null;
  document.getElementById("logo-base64").value = "";
  const preview = document.getElementById("logo-preview-box");
  if (preview) preview.innerHTML = "🎪";
  saveState();
  renderBazaresTabla();
  renderBazaarHome();
  showToast("Imagen eliminada");
}

// ==========================================
// SINCRONIZACIÓN DEL CANVAS + ORIENTACIÓN + DUPLICAR BAZAR
// ==========================================

// Recarga fondo, zonas y tamaño del canvas desde el estado activo.
// Debe llamarse SIEMPRE que cambie el bazar o el piso activo; si no, el canvas
// conserva las zonas del piso anterior y saveZones() las copia al piso nuevo.
function syncCanvasWithState() {
  bazaarCanvas.selectedTableId = null;
  bazaarCanvas.selectedElementId = null;
  bazaarCanvas.selectedZoneId = null;
  bazaarCanvas.isDraggingTable = false;
  bazaarCanvas.isDraggingElement = false;
  bazaarCanvas.isDraggingZone = false;
  bazaarCanvas.draggedTable = null;
  bazaarCanvas.draggedElement = null;
  bazaarCanvas.draggedZone = null;
  bazaarCanvas.loadBgImage();
  bazaarCanvas.loadZones();
  applyFloorOrientation();
  bazaarCanvas.render();
  bazaarCanvas.updateZoneUI();
}

// Ajusta el tamaño del canvas según la orientación del piso activo.
function applyFloorOrientation() {
  const floor = getActiveFloor();
  const orientation = floor?.orientation === "portrait" ? "portrait" : "landscape";
  document.querySelectorAll("#map-orientation [data-value]").forEach((btn) => {
    const on = btn.dataset.value === orientation;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
  const canvas = document.getElementById("bazaar-canvas");
  if (!canvas) return;
  const [width, height] = orientation === "portrait" ? [560, 900] : [900, 560];
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
  if (typeof bazaarCanvas !== "undefined" && bazaarCanvas.ctx) bazaarCanvas.render();
}

function updateMapOrientation(value) {
  const floor = getActiveFloor();
  if (!floor) return;
  floor.orientation = value === "portrait" ? "portrait" : "landscape";
  saveState();
  applyFloorOrientation();
  bazaarCanvas.render();
  showToast(floor.orientation === "portrait" ? "↕️ Plano en vertical" : "↔️ Plano en horizontal");
}

// Duplica el bazar activo (expositores, pisos, mesas, zonas, costos, agenda...).
// La asistencia (mesas e invitados) y el historial se reinician en la copia.
async function duplicarBazaar() {
  const source = getActiveBazaar();
  if (!source) { showToast("No hay un bazar activo que duplicar", "error"); return; }
  const name = await appPrompt("Nombre del bazar duplicado:", `${source.name} (copia)`, "Duplicar bazar");
  if (!name?.trim()) return;

  const copy = JSON.parse(JSON.stringify(source));
  const newId = "bazaar-" + Date.now();
  const floorIdMap = {};

  copy.id = newId;
  copy.name = name.trim();
  copy.createdAt = Date.now();
  copy.tables = [];
  (copy.floors || []).forEach((floor, index) => {
    const newFloorId = `${newId}-floor-${index + 1}`;
    floorIdMap[floor.id] = newFloorId;
    floor.id = newFloorId;
    (floor.tables || []).forEach((table) => { table.attended = false; table.absent = false; table.attended2 = false; table.absent2 = false; });
  });
  copy.activeFloorId = floorIdMap[source.activeFloorId] || copy.floors?.[0]?.id;
  (copy.invitados || []).forEach((inv) => { inv.asistio = false; });
  (copy.expositores || []).forEach((exp) => { exp.historial = []; });
  (copy.tareas || []).forEach((t) => { t.hecho = false; });
  (copy.compras || []).forEach((c) => { c.comprado = false; });

  AppState.bazaars[newId] = copy;
  AppState.currentBazaarId = newId;
  saveState();
  renderAll();
  syncCanvasWithState();
  renderBazaresTabla();
  showToast(`✅ Bazar "${copy.name}" duplicado`);
}

// ==========================================
// 8. RENDERIZADO PRINCIPAL
// ==========================================
// Rutas que existen aunque no haya un bazar abierto; el resto depende del bazar activo.
const GLOBAL_TABS = ["inicio", "bazares", "comparar", "categorias", "plantillas"];

// Selector de bazar del nivel 2 (reemplaza al selector que estaba en el header).
function updateNavBazaarLabel() {
  const sel = document.getElementById("nav-bazaar-select");
  if (!sel) return;
  sel.innerHTML = getBazaarsNewestFirst()
    .map((bz) => `<option value="${bz.id}" ${bz.id === AppState.currentBazaarId ? "selected" : ""}>${escapeHTML(bz.name)}</option>`)
    .join("") + `<option value="__new__">➕ Crear bazar nuevo…</option>`;
}

async function onNavBazaarChange(value) {
  if (value === "__new__") {
    await createBazaar();          // si se cancela, el selector vuelve al bazar activo
    updateNavBazaarLabel();
    return;
  }
  switchBazaar(value);             // cambia de bazar sin salir de la pantalla actual
}

// Sin bazar: oculta el nivel 2 del menú (todo lo que depende de un bazar) y marca el body (.no-bazaar).
function updateAppMode() {
  const hasBazaar = !!getActiveBazaar();
  document.body.classList.toggle("no-bazaar", !hasBazaar);
  const bazaarNav = document.getElementById("bazaar-nav");
  if (bazaarNav) bazaarNav.hidden = !hasBazaar;   // nivel 2 solo con un bazar abierto
  updateNavBazaarLabel();
  // Acciones que necesitan un bazar: se ocultan en vez de fallar en silencio.
  document.querySelectorAll("#backup-menu .backup-menu-item").forEach((item) => {
    const needsBazaar = /openBackupExport|exportarPlanEventoXLSX|exportarCSV|exportarMinutoAMinutoCSV/.test(item.getAttribute("onclick") || "");
    item.hidden = needsBazaar && !hasBazaar;
  });
  document.querySelectorAll('[onclick="duplicarBazaar()"]').forEach((btn) => { btn.hidden = !hasBazaar; });
}

function renderAll() {
  updateAppMode();
  renderBazaarSelector();
  renderBazaarHome();
  renderBazaresTabla();
  renderPlantillas();
  updateMapaBazaarLabel();
  if (!getActiveBazaar()) {
    // Estado "sin bazar": solo pantallas globales; las demás se bloquean.
    renderCategorias();
    renderCategoryChips();
    updateAlertBadge();
    if (bazaarCanvas?.ctx) bazaarCanvas.render();
    const current = document.querySelector(".page-section.active")?.id.replace(/^sec-/, "");
    if (current && !GLOBAL_TABS.includes(current)) switchTab("inicio");
    return;
  }
  renderExpositores();
  renderCategorias();
  renderCategoryChips();
  renderFinanzasTable();
  renderFinanzasStats();
  renderCostosUI();
  renderChecklist();
  renderInvitados();
  renderMinuteByMinute();
  renderFicha();
  renderTareas();
  renderCompras();
  renderMetricasFinancieras();
  renderPanelDiaEvento();
  updateAlertBadge();
}

function handleSearch(val) {
  if (!getActiveBazaar()) return;
  AppState.searchQuery = val.toLowerCase();
  renderExpositores();
}

function setFilterCategory(catId, btnEl) {
  AppState.filterCategory = catId;
  document.querySelectorAll(".filter-chip").forEach((b) => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");
  renderExpositores();
}

function setFilterStatus(status) {
  AppState.filterStatus = status;
  renderExpositores();
}
