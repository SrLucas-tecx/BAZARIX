/**
 * EXPOSITORES.COM — canvas_helpers.js
 * Funciones globales del canvas: zoom, reset, addTable, deleteTable, editTable, exportarMapaPDF
 * Dependencias: state.js, utils.js, canvas.js
 */

// Colores predefinidos para zonas (cicla automáticamente)
const ZONE_COLORS = ["#0d9488","#f59e0b","#8b5cf6","#ef4444","#10b981","#3b82f6","#ec4899","#f97316"];
function _randomZoneColor() {
  return ZONE_COLORS[bazaarCanvas.zones.length % ZONE_COLORS.length];
}

// Cambia el modo del canvas desde botones de la barra de herramientas
// [EDITABLE: llama a setCanvasMode('zone') para activar el dibujado de zonas]
function setCanvasMode(mode) {
  bazaarCanvas.setMode(mode);
  setSideTab(mode === "zone" ? "zonas" : "mesas");
}

function toggleLayer(layer) {
  if (layer === "tables") bazaarCanvas.showTables = !bazaarCanvas.showTables;
  if (layer === "zones") bazaarCanvas.showZones = !bazaarCanvas.showZones;
  if (layer === "grid") {
    bazaarCanvas.showGrid = !bazaarCanvas.showGrid;
    try { localStorage.setItem("BAZARIX_GRID", bazaarCanvas.showGrid ? "1" : "0"); } catch {}
  }
  const button = document.getElementById(`layer-btn-${layer}`);
  const visible = { tables: bazaarCanvas.showTables, zones: bazaarCanvas.showZones, grid: bazaarCanvas.showGrid }[layer];
  if (button) button.classList.toggle("active", visible);
  bazaarCanvas.render();
}

function toggleSnapTables() {
  bazaarCanvas.snapTables = !bazaarCanvas.snapTables;
  const button = document.getElementById("btn-snap-tables");
  if (button) button.classList.toggle("active", bazaarCanvas.snapTables);
  showToast(bazaarCanvas.snapTables ? "🧲 Snap activado" : "Snap desactivado");
}

function toggleLegend() {
  bazaarCanvas.showLegend = !bazaarCanvas.showLegend;
  const button = document.getElementById("btn-toggle-legend");
  if (button) button.classList.toggle("active", bazaarCanvas.showLegend);
  bazaarCanvas.render();
}

function autoNumberTables() {
  const tables = getActiveTables(getActiveBazaar()).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  let row = 0;
  let rowY = null;
  let rowNumber = 0;
  tables.forEach((table) => {
    if (rowY === null || Math.abs(table.y - rowY) > Math.max(12, table.h * 0.45)) {
      row += 1;
      rowY = table.y;
      rowNumber = 0;
    }
    rowNumber += 1;
    table.name = `${String.fromCodePoint(64 + Math.min(row, 26))}-${String(rowNumber).padStart(2, "0")}`;
    const bz = getActiveBazaar();
  });
  syncAllTableAssignments(getActiveBazaar());   // el nombre de la mesa forma parte de la ubicación del expositor
  saveState();
  bazaarCanvas.render();
  renderChecklist();
  renderExpositores();
  showToast(tables.length ? "✅ Mesas numeradas" : "No hay mesas para numerar");
}

// Exporta zonas del piso actual como JSON
function exportZonesJSON() {
  const floor = getActiveFloor(getActiveBazaar());
  const data  = JSON.stringify(floor?.zones || [], null, 2);
  const blob  = new Blob([data], { type: "application/json" });
  const a     = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download  = "zonas_bazar.json"; a.click();
  showToast("✅ Zonas exportadas");
}

// Elimina TODAS las zonas del piso activo
async function clearAllZones() {
  if (!await appConfirm("¿Eliminar todas las zonas del plano?", "Eliminar zonas")) return;
  const floor = getActiveFloor(getActiveBazaar());
  if (floor) floor.zones = [];
  bazaarCanvas.zones = [];
  bazaarCanvas.drawingZone = null;
  bazaarCanvas.saveZones();
  bazaarCanvas.render();
  bazaarCanvas.updateZoneUI();
  showToast("🗑️ Todas las zonas eliminadas");
}

async function confirmDeleteZone(zoneId) {
  const zone = bazaarCanvas.zones.find((item) => item.id === zoneId);
  if (!zone || !await appConfirm(`¿Eliminar la zona "${zone.label}" del plano?`, "Eliminar zona")) return;
  bazaarCanvas.deleteZone(zoneId);
}

/**
 * Captura el plano ajustado a su contenido, sobre fondo blanco, sin selección y en
 * colores de modo claro, con la proporción (aspect) de la zona donde irá en el PDF.
 * Devuelve un data URL PNG. Restaura el canvas tal como estaba.
 */
function capturePlanoImage(floor, aspect) {
  const canvas = bazaarCanvas.canvas;
  const saved = {
    w: canvas.width, h: canvas.height,
    scale: bazaarCanvas.scale, panX: bazaarCanvas.panX, panY: bazaarCanvas.panY,
    mode: bazaarCanvas.mode, element: bazaarCanvas.selectedElementId,
    zone: bazaarCanvas.selectedZoneId, table: bazaarCanvas.selectedTableId,
    dark: document.body.classList.contains("dark")
  };
  try {
    const baseW = 2000;
    canvas.width = baseW;
    canvas.height = Math.max(200, Math.round(baseW / (aspect || (saved.w / saved.h))));
    bazaarCanvas.mode = "select";
    bazaarCanvas.selectedElementId = null;
    bazaarCanvas.selectedZoneId = null;
    bazaarCanvas.selectedTableId = null;
    document.body.classList.remove("dark");

    const bounds = typeof getPresentationBounds === "function" ? getPresentationBounds(floor) : null;
    if (bounds) {
      const pad = 60;
      const contentW = Math.max(1, bounds.maxX - bounds.minX);
      const contentH = Math.max(1, bounds.maxY - bounds.minY);
      const scale = Math.max(0.2, Math.min(4,
        (canvas.width - pad * 2) / contentW,
        (canvas.height - pad * 2) / contentH));
      bazaarCanvas.scale = scale;
      bazaarCanvas.panX = (canvas.width - contentW * scale) / 2 - bounds.minX * scale;
      bazaarCanvas.panY = (canvas.height - contentH * scale) / 2 - bounds.minY * scale;
    } else {
      const factor = canvas.width / saved.w;
      bazaarCanvas.scale = saved.scale * factor;
      bazaarCanvas.panX = saved.panX * factor;
      bazaarCanvas.panY = saved.panY * factor;
    }
    bazaarCanvas.render();

    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d");
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    return out.toDataURL("image/png");
  } finally {
    canvas.width = saved.w;
    canvas.height = saved.h;
    bazaarCanvas.scale = saved.scale;
    bazaarCanvas.panX = saved.panX;
    bazaarCanvas.panY = saved.panY;
    bazaarCanvas.mode = saved.mode;
    bazaarCanvas.selectedElementId = saved.element;
    bazaarCanvas.selectedZoneId = saved.zone;
    bazaarCanvas.selectedTableId = saved.table;
    document.body.classList.toggle("dark", saved.dark);
    bazaarCanvas.render();
  }
}

function exportarMapaPDF() {
  const bz = getActiveBazaar();
  const floor = getActiveFloor(bz);
  if (!bz || !floor || !window.html2pdf || !bazaarCanvas.canvas) {
    showToast("❌ No se pudo preparar el PDF del mapa", "error");
    return;
  }

  // La hoja sigue la orientación del plano. Área útil de una A4 con margen de 8 mm:
  // 281×194 mm (horizontal) o 194×281 mm (vertical). El contenedor debe CABER en ella
  // (si se pasaba de alto, el PDF se partía en dos páginas o quedaba cortado).
  const isPortrait = floor.orientation === "portrait";
  const wrapW = isPortrait ? 650 : 1000;
  const wrapH = isPortrait ? 930 : 680;
  const pad = 18, headH = 52, headGap = 10, footH = 16, footGap = 6;
  const boxW = wrapW - pad * 2;
  const boxH = wrapH - pad * 2 - headH - headGap - footH - footGap;

  let planoImg;
  try {
    planoImg = capturePlanoImage(floor, boxW / boxH);
  } catch (err) {
    console.error(err);
    showToast("❌ No se pudo preparar el PDF del mapa", "error");
    return;
  }

  const issuedAt = new Date().toLocaleDateString("es-MX");
  const safeName = `${bz.name}_${floorLabel(floor, bz)}`.replace(/[^a-z0-9]+/gi, "_");
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `display:block;box-sizing:border-box;width:${wrapW}px;height:${wrapH}px;overflow:hidden;padding:${pad}px;font-family:Arial,sans-serif;background:#fff;color:#1e293b;`;
  wrapper.innerHTML = `
    <div style="box-sizing:border-box;height:${headH}px;margin-bottom:${headGap}px;overflow:hidden;display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0d9488;padding-bottom:6px;">
      <div>
        <h1 style="color:#0d9488;margin:0;font-size:22px;line-height:1.2;">PLANO DEL EVENTO</h1>
        <p style="margin:2px 0 0;color:#64748b;font-size:12px;">BAZARIX — Gestión de Eventos</p>
      </div>
      <div style="text-align:right;font-size:12px;color:#64748b;">
        <strong style="display:block;color:#0f766e;font-size:15px;">${escapeHTML(bz.name)}</strong>
        <span>${escapeHTML(floorLabel(floor, bz))} · ${issuedAt}</span>
      </div>
    </div>
    <div style="box-sizing:border-box;width:${boxW}px;height:${boxH}px;border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;background:#fff;">
      <img src="${planoImg}" alt="Plano de ${escapeHTML(bz.name)}" style="display:block;width:${boxW - 2}px;height:${boxH - 2}px;object-fit:contain;">
    </div>
    <p style="height:${footH}px;margin:${footGap}px 0 0;text-align:center;color:#64748b;font-size:10px;line-height:${footH}px;">Documento generado por BAZARIX</p>`;

  document.body.appendChild(wrapper);
  renderElementToPDF(wrapper, {
    margin: 8,
    filename: `mapa_${safeName}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
    jsPDF: { unit: "mm", format: "a4", orientation: isPortrait ? "portrait" : "landscape" },
    pagebreak: { mode: ["avoid-all"] }
  }).then(() => {
    wrapper.remove();
    showToast("✅ Mapa descargado en PDF");
  }).catch((err) => {
    console.error(err);
    wrapper.remove();
    showToast("❌ No se pudo generar el PDF del mapa", "error");
  });
}

function zoomBazaar(delta) {
  bazaarCanvas.scale = Math.max(0.3, Math.min(3.0, bazaarCanvas.scale + delta));
  bazaarCanvas.render();
}

function resetBazaarZoom() {
  bazaarCanvas.scale = 1.0;
  bazaarCanvas.panX  = 0;
  bazaarCanvas.panY  = 0;
  bazaarCanvas.render();
}

// Reset completo: borra todos los objetos del piso y la imagen de fondo.
async function resetBazaarCanvas() {
  if (!await appConfirm("¿Eliminar todas las mesas, elementos, zonas e imagen de fondo? Esta acción no se puede deshacer.", "Limpiar plano", "Limpiar plano")) return;
  const bz = getActiveBazaar();
  const floor = getActiveFloor(bz);
  if (!floor) return;
  (floor.tables || []).forEach((table) => {
    removeTableFromExpositorAssignment(bz, table);
  });
  floor.tables = [];
  floor.bgImage = null;
  floor.elements = [];
  floor.zones = [];
  floor.bgScale = 1;
  floor.bgScaleX = 1;
  floor.bgScaleY = 1;
  floor.bgRotation = 0;
  floor.bgX = 0;
  floor.bgY = 0;
  bazaarCanvas.bgImageObj = null;
  bazaarCanvas.zones = [];
  bazaarCanvas.drawingZone = null;
  bazaarCanvas.selectedTableId = null;
  bazaarCanvas.selectedElementId = null;
  bazaarCanvas.selectedZoneId = null;
  bazaarCanvas.isDraggingTable = false;
  bazaarCanvas.isDraggingElement = false;
  bazaarCanvas.isDraggingZone = false;
  bazaarCanvas.draggedTable = null;
  bazaarCanvas.draggedElement = null;
  bazaarCanvas.draggedZone = null;
  bazaarCanvas.scale = 1.0;
  bazaarCanvas.panX  = 0;
  bazaarCanvas.panY  = 0;
  saveState();
  bazaarCanvas.render();
  renderChecklist();
  bazaarCanvas.updateZoneUI();
  showToast("🗑️ Plano completamente limpiado");
}

function handleFloorPlanUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const bz = getActiveBazaar();
    if (bz) {
      const floor = getActiveFloor(bz);
      if (!floor) return;
      floor.bgImage = evt.target.result;
      floor.bgScale = 1;
      floor.bgScaleX = 1;
      floor.bgScaleY = 1;
      floor.bgRotation = 0;
      floor.bgX = 0;
      floor.bgY = 0;
      saveState();
      bazaarCanvas.loadBgImage();
      showToast("✅ Imagen de fondo cargada");
    }
  };
  reader.readAsDataURL(file);
}

function addTableToCore() {
  const bz  = getActiveBazaar();
  if (!bz) return;
  const id  = "t-" + Date.now();
  const tables = getActiveTables(bz);
  const cnt = tables.length + 1;
  tables.push({
    id, name: `Mesa ${cnt}`,
    x: 80 + ((cnt - 1) % 6) * 110,
    y: 80 + Math.floor((cnt - 1) / 6) * 80,
    w: 90, h: 50, rotation: 0, exhibitorId: "", exhibitorId2: "", shared: false, attended: false, absent: false, attended2: false, absent2: false
  });
  saveState(); bazaarCanvas.render(); renderChecklist();
  showToast("Mesa agregada al plano");
}

// [NUEVO] Eliminar mesa del canvas
async function deleteTable(tableId) {
  const bz = getActiveBazaar();
  const floor = (bz?.floors || []).find((item) => (item.tables || []).some((table) => table.id === tableId));
  const table = floor?.tables.find((item) => item.id === tableId);
  if (!table || !await appConfirm(`¿Eliminar "${table.name}" del plano?`, "Eliminar mesa")) return;
  removeTableFromExpositorAssignment(bz, table);
  floor.tables = floor.tables.filter((t) => t.id !== tableId);
  if (document.getElementById("edit-table-id")?.value === tableId) closeModal("modal-editar-mesa");
  saveState(); bazaarCanvas.render(); renderChecklist();
  renderExpositores();
  showToast("🗑️ Mesa eliminada del plano");
}

async function deleteSelectedMapObject() {
  const bz = getActiveBazaar();
  const floor = getActiveFloor(bz);
  if (!floor) return;

  const tableId = bazaarCanvas.selectedTableId;
  const elementId = bazaarCanvas.selectedElementId;
  const zoneId = bazaarCanvas.selectedZoneId;
  const table = (floor.tables || []).find((item) => item.id === tableId);
  const element = (floor.elements || []).find((item) => item.id === elementId);
  const zone = bazaarCanvas.zones.find((item) => item.id === zoneId);
  const kind = table ? "mesa" : element ? "elemento" : zone ? "zona" : "";
  const label = table?.name || element?.label || zone?.label || "";
  if (!kind) {
    showToast("Selecciona una mesa, elemento o zona primero", "error");
    return;
  }
  if (!await appConfirm(`¿Eliminar ${kind} "${label}" del plano?`, `Eliminar ${kind}`)) return;

  if (table) {
    removeTableFromExpositorAssignment(bz, table);
    floor.tables = (floor.tables || []).filter((item) => item.id !== tableId);
    bazaarCanvas.selectedTableId = null;
    saveState();
    bazaarCanvas.render();
    renderChecklist();
    renderExpositores();
    showToast("🗑️ Mesa seleccionada eliminada");
    return;
  }

  if (element) {
    floor.elements = (floor.elements || []).filter((item) => item.id !== elementId);
    bazaarCanvas.selectedElementId = null;
    saveState();
    bazaarCanvas.render();
    showToast("🗑️ Elemento seleccionado eliminado");
    return;
  }

  if (zone) {
    bazaarCanvas.zones = bazaarCanvas.zones.filter((item) => item.id !== zoneId);
    bazaarCanvas.selectedZoneId = null;
    bazaarCanvas.saveZones();
    bazaarCanvas.render();
    bazaarCanvas.updateZoneUI();
    showToast("🗑️ Zona seleccionada eliminada");
    return;
  }

}

function openModalTableEdit(tableId) {
  const bz = getActiveBazaar();
  const t  = getActiveTables(bz).find((item) => item.id === tableId);
  if (!t) return;
  document.getElementById("edit-table-id").value    = t.id;
  document.getElementById("edit-table-name").value  = t.name;
  const pixelsPerCentimeter = getPixelsPerMeter() / 100;
  document.getElementById("edit-table-width-cm").value = Math.round(t.w / pixelsPerCentimeter);
  document.getElementById("edit-table-height-cm").value = Math.round(t.h / pixelsPerCentimeter);
  document.getElementById("edit-table-color").value = t.color || "#ffffff";
  document.getElementById("edit-table-label-color").value = t.labelColor || "#1e293b";
  document.getElementById("edit-table-label-size").value = t.labelFontSize || 11;
  document.getElementById("edit-table-rotation").value = Number(t.rotation) || 0;
  document.getElementById("edit-table-shared").checked = Boolean(t.shared);
  populateTableOwnerSelects(t);
  openModal("modal-editar-mesa");
}

// Expositores de la mesa: una mesa completa (uno) o compartida (hasta 2 de media mesa), con su color en el plano.
let activeTableOwnerSlot = 1;
let tableOwnerPickerReturnFocus = null;

function populateTableOwnerSelects(t, keep = false) {
  const bz = getActiveBazaar();
  const shared = document.getElementById("edit-table-shared").checked;
  const dia = tableDiaId(t, bz);
  const s1 = document.getElementById("edit-table-exhibitor");
  const s2 = document.getElementById("edit-table-exhibitor2");
  const v1 = keep ? s1.value : (t.exhibitorId || "");
  const v2 = keep ? s2.value : (t.shared ? (t.exhibitorId2 || "") : "");
  const opciones = (seleccionado, otro) => `<option value="">-- Sin asignar --</option>` + bz.expositores
    .filter((exp) => exp.id === seleccionado || (exp.id !== otro && expositorParticipaEnDia(exp, dia, bz) && (!shared || exp.mesaTipo === "media")))
    .map((exp) => `<option value="${escapeHTML(exp.id)}" ${exp.id === seleccionado ? "selected" : ""}>${escapeHTML(exp.negocio)} (${escapeHTML(exp.nombre)})${exp.mesaTipo === "media" ? " · ½" : ""}</option>`).join("");
  s1.innerHTML = opciones(v1, v2);
  s2.innerHTML = opciones(v2, v1);
  updateTableOwnerPickerLabel(1);
  updateTableOwnerPickerLabel(2);
  document.getElementById("edit-table-owner2-group").hidden = !shared;
  document.getElementById("edit-table-exhibitor-label").textContent = shared ? "Expositor de la primera media mesa" : "Expositor asignado";
  syncTableColorToOwner(1);
}

function updateTableOwnerPickerLabel(slot) {
  const select = document.getElementById(Number(slot) === 2 ? "edit-table-exhibitor2" : "edit-table-exhibitor");
  const button = document.getElementById(Number(slot) === 2 ? "edit-table-exhibitor2-picker" : "edit-table-exhibitor-picker");
  const label = button?.querySelector(".table-owner-picker-value");
  if (!select || !button || !label) return;
  const exp = getActiveBazaar()?.expositores.find((item) => item.id === select.value);
  label.textContent = exp ? `${exp.negocio} (${exp.nombre})${exp.mesaTipo === "media" ? " · ½" : ""}` : "-- Sin asignar --";
}

function openTableOwnerPicker(slot) {
  activeTableOwnerSlot = Number(slot) === 2 ? 2 : 1;
  const button = document.getElementById(activeTableOwnerSlot === 2 ? "edit-table-exhibitor2-picker" : "edit-table-exhibitor-picker");
  const modal = document.getElementById("modal-table-owner-picker");
  if (!button || !modal) return;
  tableOwnerPickerReturnFocus = button;
  button.setAttribute("aria-expanded", "true");
  document.getElementById("table-owner-picker-search").value = "";
  renderTableOwnerPickerOptions();
  modal.classList.add("open");
  window.setTimeout(() => document.getElementById("table-owner-picker-search")?.focus(), 0);
}

function closeTableOwnerPicker() {
  const modal = document.getElementById("modal-table-owner-picker");
  if (!modal?.classList.contains("open")) return;
  modal.classList.remove("open");
  document.getElementById(activeTableOwnerSlot === 2 ? "edit-table-exhibitor2-picker" : "edit-table-exhibitor-picker")?.setAttribute("aria-expanded", "false");
  tableOwnerPickerReturnFocus?.focus();
  tableOwnerPickerReturnFocus = null;
}

function normalizeTableOwnerSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

function renderTableOwnerPickerOptions() {
  const select = document.getElementById(activeTableOwnerSlot === 2 ? "edit-table-exhibitor2" : "edit-table-exhibitor");
  const search = normalizeTableOwnerSearch(document.getElementById("table-owner-picker-search").value.trim());
  const list = document.getElementById("table-owner-picker-list");
  const bz = getActiveBazaar();
  if (!select || !list || !bz) return;

  const availableIds = new Set(Array.from(select.options).map((option) => option.value).filter(Boolean));
  const exhibitors = bz.expositores.filter((exp) => availableIds.has(exp.id) &&
    (!search || normalizeTableOwnerSearch(`${exp.negocio} ${exp.nombre}`).includes(search)));
  list.replaceChildren();

  const appendOption = (exp) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "table-owner-picker-option";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(select.value === (exp?.id || "")));
    button.addEventListener("click", () => {
      select.value = exp?.id || "";
      updateTableOwnerPickerLabel(activeTableOwnerSlot);
      syncTableColorToOwner(activeTableOwnerSlot);
      closeTableOwnerPicker();
    });

    if (exp) {
      const avatar = document.createElement("span");
      avatar.className = "table-owner-picker-avatar";
      avatar.style.backgroundColor = getExpositorPlanoColor(exp);
      if (exp.foto) {
        const image = document.createElement("img");
        image.src = exp.foto;
        image.alt = exp.nombre || exp.negocio;
        image.loading = "lazy";
        avatar.append(image);
      } else {
        avatar.textContent = (exp.negocio || "?").charAt(0).toLocaleUpperCase();
      }
      const color = document.createElement("span");
      color.className = "table-owner-picker-color";
      color.style.backgroundColor = getExpositorPlanoColor(exp);
      color.setAttribute("aria-label", `Color del expositor ${getExpositorPlanoColor(exp)}`);
      const details = document.createElement("span");
      details.className = "table-owner-picker-details";
      const primary = document.createElement("strong");
      primary.className = "table-owner-picker-business";
      primary.textContent = exp.negocio;
      const person = document.createElement("span");
      person.className = "table-owner-picker-person";
      person.textContent = `${exp.nombre}${exp.mesaTipo === "media" ? " · Media mesa" : ""}`;
      details.append(primary, person);
      button.append(avatar, details, color);
    } else {
      button.classList.add("is-unassigned");
      const primary = document.createElement("strong");
      primary.className = "table-owner-picker-business";
      primary.textContent = "-- Sin asignar --";
      const detail = document.createElement("span");
      detail.className = "table-owner-picker-person";
      detail.textContent = "Dejar la mesa libre";
      const details = document.createElement("span");
      details.className = "table-owner-picker-details";
      details.append(primary, detail);
      button.append(details);
    }
    list.append(button);
  };

  appendOption(null);
  exhibitors.forEach(appendOption);
  if (exhibitors.length === 0) {
    const empty = document.createElement("p");
    empty.className = "table-owner-picker-empty";
    empty.textContent = "No se encontraron expositores.";
    list.append(empty);
  }
}

document.getElementById("table-owner-picker-search")?.addEventListener("input", renderTableOwnerPickerOptions);
document.getElementById("modal-table-owner-picker")?.addEventListener("click", (event) => {
  if (event.target === event.currentTarget) closeTableOwnerPicker();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.getElementById("modal-table-owner-picker")?.classList.contains("open")) {
    event.stopPropagation();
    closeTableOwnerPicker();
  }
});

function updateTableSharedFields() {
  const t = findTableAnyFloor(document.getElementById("edit-table-id").value);
  if (t) populateTableOwnerSelects(t, true);
}

function syncTableColorToOwner(slot) {
  const bz = getActiveBazaar();
  const select = document.getElementById(Number(slot) === 2 ? "edit-table-exhibitor2" : "edit-table-exhibitor");
  const input = document.getElementById("edit-table-color");
  if (!select || !input) return;
  if (document.getElementById("edit-table-shared").checked) {
    input.disabled = true;
    return;
  }
  const exp = bz.expositores.find((item) => item.id === select.value);
  input.disabled = Boolean(exp);
  if (exp) input.value = getTableOwnerColor(exp);
}

async function saveTableEdit() {
  const id = document.getElementById("edit-table-id").value;
  const bz = getActiveBazaar();
  const t  = getActiveTables(bz).find((item) => item.id === id);
  if (!t) return;
  // Primero se validan y aplican los expositores: si alguna regla falla, la mesa no se modifica a medias.
  const ok = await assignTableOwners(bz, t, {
    shared: document.getElementById("edit-table-shared").checked,
    id1: document.getElementById("edit-table-exhibitor").value,
    id2: document.getElementById("edit-table-exhibitor2").value
  });
  if (!ok) return;
  const pixelsPerCentimeter = getPixelsPerMeter() / 100;
  t.name        = document.getElementById("edit-table-name").value.trim() || t.name;
  t.w           = Math.max(1, Number(document.getElementById("edit-table-width-cm").value || 1) * pixelsPerCentimeter);
  t.h           = Math.max(1, Number(document.getElementById("edit-table-height-cm").value || 1) * pixelsPerCentimeter);
  const assignedOwner = bz.expositores.find((item) => item.id === t.exhibitorId);
  t.color       = !t.shared && assignedOwner
    ? getTableOwnerColor(assignedOwner)
    : document.getElementById("edit-table-color").value || "#ffffff";
  t.labelColor  = document.getElementById("edit-table-label-color").value || "#1e293b";
  t.labelFontSize = Math.max(8, Math.min(32, Number(document.getElementById("edit-table-label-size").value) || 11));
  t.rotation    = ((Number(document.getElementById("edit-table-rotation").value) || 0) % 360 + 360) % 360;
  syncAllTableAssignments(bz);   // si cambió el nombre de la mesa, la ubicación del expositor también
  saveState(); bazaarCanvas.render(); renderChecklist();
  renderExpositores();
  closeModal("modal-editar-mesa");
  showToast("✅ Mesa actualizada");
}

function rotateEditingTable(delta) {
  const tableId = document.getElementById("edit-table-id")?.value;
  const table = getActiveTables().find((item) => item.id === tableId);
  if (!table) return;
  table.rotation = ((Number(table.rotation) || 0) + delta + 360) % 360;
  const rotationInput = document.getElementById("edit-table-rotation");
  if (rotationInput) rotationInput.value = table.rotation;
  saveState();
  bazaarCanvas.render();
  showToast(`Mesa girada a ${table.rotation}°`);
}

function rotateSelectedTable(delta) {
  const tableId = bazaarCanvas.selectedTableId;
  const table = getActiveTables().find((item) => item.id === tableId);
  if (!table) {
    showToast("Selecciona una mesa primero", "error");
    return;
  }
  table.rotation = ((Number(table.rotation) || 0) + delta + 360) % 360;
  saveState();
  bazaarCanvas.render();
  showToast(`Mesa girada a ${table.rotation}°`);
}

// ==========================================

// ── Plano: UI (plegable, pestañas del panel lateral, atajos) ──
function setSideTab(tab) {
  const panel = document.querySelector(".map-side-panel");
  if (!panel) return;
  panel.dataset.tab = tab;
  panel.querySelectorAll(".side-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  if (tab === "zonas") bazaarCanvas.updateZoneUI();
}

function handleMapShortcut(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!document.getElementById("sec-mapa")?.classList.contains("active")) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
  if (document.querySelector(".modal-overlay.open")) return;
  const key = e.key.toLowerCase();
  const actions = {
    v: () => setCanvasMode("select"),
    i: () => setCanvasMode("imgEdit"),
    z: () => setCanvasMode("zone"),
    m: () => addTableToCore(),
    r: () => rotateSelectedTable(e.shiftKey ? -90 : 90),
    escape: () => setCanvasMode("select")
  };
  if (!actions[key]) return;
  e.preventDefault();
  actions[key]();
}

// Cinta de herramientas con pestañas (estilo Word): Plano · Vista · Imagen de fondo · Exportar y limpiar
function setRibbonTab(tab) {
  const ribbon = document.querySelector(".ribbon");
  if (!ribbon || !ribbon.querySelector(`.ribbon-tab[data-rt="${tab}"]`)) return;
  ribbon.dataset.tab = tab;
  ribbon.querySelectorAll(".ribbon-tab").forEach((b) => {
    const on = b.dataset.rt === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  try { localStorage.setItem("BAZARIX_RIBBON_TAB", tab); } catch {}
}

document.addEventListener("DOMContentLoaded", () => {
  try {   // recuerda si la cuadrícula estaba oculta
    if (localStorage.getItem("BAZARIX_GRID") === "0") {
      bazaarCanvas.showGrid = false;
      document.getElementById("layer-btn-grid")?.classList.remove("active");
    }
  } catch {}
  try { setRibbonTab(localStorage.getItem("BAZARIX_RIBBON_TAB") || "plano"); } catch {}
});

// Barra de escala del plano: muestra cuánto mide una longitud real con el zoom actual.
function updateScaleBar() {
  const line = document.getElementById("scale-bar-line");
  const label = document.getElementById("scale-bar-label");
  const canvas = bazaarCanvas?.canvas;
  if (!line || !label || !canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;                       // la pantalla del plano está oculta
  const pxPerMeter = getPixelsPerMeter() * bazaarCanvas.scale * (rect.width / canvas.width);
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  const length = steps.find((m) => m * pxPerMeter >= 40) ?? steps[steps.length - 1];
  line.style.width = `${Math.min(160, Math.max(8, length * pxPerMeter))}px`;
  label.textContent = length < 1 ? `${Math.round(length * 100)} cm` : `${length} m`;
}
window.addEventListener("resize", () => updateScaleBar());
