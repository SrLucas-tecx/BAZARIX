/**
 * EXPOSITORES.COM — canvas.js
 * BazaarCanvasManager: render, modos (select/imgEdit/zone), drawTable, drawZones, drag&drop
 * Dependencias: state.js, utils.js
 */

// 20. CANVAS — BazaarCanvasManager
// ==========================================
// MODOS DEL CANVAS:
//   "select"   — modo normal: mover mesas/elementos/plano
//   "imgEdit"  — manipular imagen de fondo (mover, escalar con handles)
//   "zone"     — dibujar zonas poligonales (puntos con doble clic para cerrar)
// [EDITABLE: agrega más modos aquí y su lógica en handleMouseDown/Move/Up]

class BazaarCanvasManager {
  constructor() {
    this.canvas = null; this.ctx = null;
    this.scale = 1.0; this.panX = 0; this.panY = 0;
    this.isPanning = false; this.isDraggingTable = false; this.isDraggingElement = false;
    this.draggedTable = null; this.draggedElement = null;
    this.selectedTableId = null; this.selectedElementId = null;
    this.startMouseX = 0; this.startMouseY = 0;
    this.dragOffsetX = 0; this.dragOffsetY = 0;
    this.bgImageObj = null;

    // ── MODO ACTIVO ──
    this.mode = "select"; // "select" | "imgEdit" | "zone"
    this.snapTables = true;
    this.showLegend = true;
    this.showTables = true;
    this.showZones = true;
    this.showGrid = true;

    // ── MANIPULACIÓN DE IMAGEN (mode === "imgEdit") ──
    // Handles: 8 puntos (esquinas + bordes) + centro para mover
    this.imgDragging   = false;   // arrastrando la imagen entera
    this.imgResizing   = false;   // arrastrando un handle de resize
    this.imgRotating   = false;   // girando desde el handle tipo Canva
    this.imgHandle     = null;    // qué handle: "tl","tc","tr","ml","mr","bl","bc","br"
    this.imgDragOffX   = 0;
    this.imgDragOffY   = 0;
    this.imgResizeStart = null;   // snapshot al iniciar resize con cursor en coordenadas locales
    this.imgRotationStart = null;

    // ── ZONAS POLIGONALES (mode === "zone") ──
    // zones: [{ id, label, color, points:[{x,y}], closed }]
    this.zones            = [];
    this.drawingZone      = null; // zona en construcción
    this.draggedZone      = null;
    this.selectedZoneId   = null;
    this.isDraggingZone   = false;
    this.hoverPoint       = null; // {zoneId, pointIdx} para drag de puntos existentes
    this.draggingZonePoint = false;
    this.snapToGrid       = false;
    this.gridSize         = 20;
  }

  init() {
    this.canvas = document.getElementById("bazaar-canvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.attachEvents();
    this.loadBgImage();
    this.loadZones();
    this.render();
  }

  // Carga zonas guardadas del piso activo
  loadZones() {
    const floor = getActiveFloor(this.getCurrentBazaar());
    this.zones = (floor?.zones || []).map((zone) => ({
      ...zone,
      points: Array.isArray(zone.points) ? zone.points.map((point) => ({ ...point })) : []
    }));
    this.drawingZone = null;
  }

  // Persiste zonas en el estado del piso activo
  saveZones() {
    const floor = getActiveFloor(this.getCurrentBazaar());
    if (floor) floor.zones = JSON.parse(JSON.stringify(this.zones));
    saveState();
  }

  // Cambia el modo del canvas y actualiza la UI
  setMode(newMode) {
    this.mode          = newMode;
    this.drawingZone   = null;
    this.imgDragging   = false;
    this.imgResizing   = false;
    this.imgRotating   = false;
    this.imgRotationStart = null;
    this.isDraggingZone = false;
    this.draggedZone = null;
    this.canvas.style.cursor = newMode === "zone" ? "crosshair"
                             : newMode === "imgEdit" ? "default" : "grab";

    // Botones de modo
    document.querySelectorAll(".canvas-mode-btn[data-mode]").forEach(b => {
      b.classList.toggle("active", b.dataset.mode === newMode);
    });

    // Badge sobre el canvas
    const badge = document.getElementById("canvas-mode-badge");
    if (badge) {
      const labels = { select:"🖱️ Seleccionar", imgEdit:"📐 Editar Imagen", zone:"🕸️ Zonas" };
      const colors = { select:"var(--color-accent)", imgEdit:"var(--color-accent2)", zone:"#8b5cf6" };
      badge.textContent = labels[newMode] || newMode;
      badge.style.background = colors[newMode] || "var(--color-accent)";
    }

    // Párrafos de ayuda
    ["select","imgEdit","zone"].forEach(m => {
      const el = document.getElementById(`map-help-${m}`);
      if (el) el.style.display = m === newMode ? "block" : "none";
    });

    this.updateZoneUI();
    this.render();
  }

  getCurrentBazaar() { return getActiveBazaar(); }

  loadBgImage() {
    const bz = this.getCurrentBazaar();
    const floor = getActiveFloor(bz);
    if (floor?.bgImage) {
      this.bgImageObj = new Image();
      this.bgImageObj.src = floor.bgImage;
      this.bgImageObj.onload = () => this.render();
    } else {
      this.bgImageObj = null;
    }
  }

  attachEvents() {
    this.canvas.addEventListener("mousedown",   (e) => this.handleMouseDown(e));
    this.canvas.addEventListener("mousemove",   (e) => {
      this.handleMouseMove(e);
      // En modo zone, re-renderiza con la posición del cursor para la línea guía
      if (this.mode === "zone" && this.drawingZone) {
        const rect = this.canvas.getBoundingClientRect();
        this.render(e.clientX, e.clientY);
      }
    });
    this.canvas.addEventListener("mouseup",     (e) => this.handleMouseUp(e));
    this.canvas.addEventListener("mouseleave",  () => this.handleMouseUp());
    window.addEventListener("mouseup",          (e) => this.handleMouseUp(e));
    this.canvas.addEventListener("dblclick",    (e) => this.handleDoubleClick(e));
    this.canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); this.handleRightClick(e); });
    this.canvas.addEventListener("wheel",       (e) => { e.preventDefault(); zoomBazaar(e.deltaY < 0 ? 0.08 : -0.08); }, { passive: false });
    document.addEventListener("keydown", (e) => handleMapShortcut(e));
    document.addEventListener("keydown", (e) => {
      if (this.mode !== "select" || !["Delete", "Backspace"].includes(e.key)) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      deleteSelectedMapObject();
    });
  }

  // Clic derecho: cancela zona en construcción
  handleRightClick(e) {
    if (this.mode === "zone" && this.drawingZone) {
      this.drawingZone = null;
      this.render();
      this.updateZoneUI();
    }
  }

  getCanvasCoords(e) {
    const rect  = this.canvas.getBoundingClientRect();
    const rawX  = (e.clientX - rect.left) * (this.canvas.width / rect.width);
    const rawY  = (e.clientY - rect.top) * (this.canvas.height / rect.height);
    const worldX = (rawX - this.panX) / this.scale;
    const worldY = (rawY - this.panY) / this.scale;
    return { rawX, rawY, worldX, worldY };
  }

  handleMouseDown(e) {
    if (e.button === 2) return; // ignorar clic derecho (lo maneja handleRightClick)
    const { rawX, rawY, worldX, worldY } = this.getCanvasCoords(e);

    // Cada nuevo clic comienza una interacción independiente.
    this.isDraggingTable = false;
    this.isDraggingElement = false;
    this.isDraggingZone = false;
    this.draggedTable = null;
    this.draggedElement = null;
    this.draggedZone = null;
    this.isPanning = false;

    // ── MODO: Editar imagen de fondo ──────────────────────────────
    if (this.mode === "imgEdit") {
      const floor = getActiveFloor(this.getCurrentBazaar());
      if (!this.bgImageObj || !floor) return;
      const rotationHandle = this._hitTestImgRotationHandle(worldX, worldY, floor);
      if (rotationHandle) {
        const rect = this._getImgRect(floor);
        const centerX = rect.x + rect.w / 2;
        const centerY = rect.y + rect.h / 2;
        this.imgRotating = true;
        this.imgRotationStart = {
          centerX,
          centerY,
          pointerAngle: Math.atan2(worldY - centerY, worldX - centerX),
          rotation: Number(floor.bgRotation || 0)
        };
        this.canvas.style.cursor = "crosshair";
        return;
      }
      // Comprobar si clic en handle de resize
      const handle = this._hitTestImgHandle(worldX, worldY, floor);
      if (handle) {
        const bgX = Number(floor.bgX || 0);
        const bgY = Number(floor.bgY || 0);
        const bgScaleX = Number(floor.bgScaleX || floor.bgScale || 1);
        const bgScaleY = Number(floor.bgScaleY || floor.bgScale || 1);
        const centerX = bgX + this.bgImageObj.naturalWidth * bgScaleX / 2;
        const centerY = bgY + this.bgImageObj.naturalHeight * bgScaleY / 2;
        const rotation = Number(floor.bgRotation || 0) * Math.PI / 180;
        const oppositeId = this._getOppositeImgHandle(handle);
        const oppositeHandle = this._getImgHandles(floor).find((item) => item.id === oppositeId);
        this.imgResizing   = true;
        this.imgHandle     = handle;
        this.imgResizeStart = {
          bgX, bgY, bgScaleX, bgScaleY,
          imgW: this.bgImageObj.naturalWidth,
          imgH: this.bgImageObj.naturalHeight,
          centerX,
          centerY,
          rotation,
          anchorWorldX: oppositeHandle?.cx ?? centerX,
          anchorWorldY: oppositeHandle?.cy ?? centerY
        };
        return;
      }
      // Comprobar si clic dentro de la imagen (mover)
      if (this._hitTestImg(worldX, worldY, floor)) {
        this.imgDragging = true;
        this.imgDragOffX = worldX - Number(floor.bgX || 0);
        this.imgDragOffY = worldY - Number(floor.bgY || 0);
        this.canvas.style.cursor = "move";
        return;
      }
      return;
    }

    // ── MODO: Dibujar zonas (zone) ────────────────────────────────
    if (this.mode === "zone") {
      const snapped = this.snapToGrid
        ? { x: Math.round(worldX / this.gridSize) * this.gridSize, y: Math.round(worldY / this.gridSize) * this.gridSize }
        : { x: worldX, y: worldY };

      // ¿Arrastrando un punto ya existente de alguna zona?
      const hp = this._hitTestZonePoint(worldX, worldY);
      if (hp) {
        this.draggingZonePoint = true;
        this.hoverPoint = hp;
        return;
      }

      if (!this.drawingZone) {
        // Iniciar nueva zona
        this.drawingZone = {
          id: "zone-" + Date.now(),
          label: "Zona " + (this.zones.length + 1),
          color: _randomZoneColor(),
          points: [{ ...snapped }],
          closed: false
        };
      } else {
        // ¿Cerca del primer punto? → cerrar zona
        const first = this.drawingZone.points[0];
        const dist  = Math.hypot(worldX - first.x, worldY - first.y);
        if (dist < 12 / this.scale && this.drawingZone.points.length >= 3) {
          this.drawingZone.closed = true;
          this.zones.push({ ...this.drawingZone, points: [...this.drawingZone.points] });
          this.drawingZone = null;
          this.selectedZoneId = null;
          this.saveZones();
          this.updateZoneUI();
          this.render();
          showToast("✅ Zona cerrada");
          return;
        }
        this.drawingZone.points.push({ ...snapped });
      }
      this.render();
      this.updateZoneUI();
      return;
    }

    // ── MODO: Selección normal ────────────────────────────────────
    const bz = this.getCurrentBazaar();
    const tables = getActiveTables(bz);
    for (let i = tables.length - 1; i >= 0; i--) {
      const t = tables[i];
      if (this.isPointInsideTable(t, worldX, worldY)) {
        this.selectedTableId = t.id;
        this.selectedElementId = null;
        this.selectedZoneId = null;
        this.isDraggingTable = true; this.draggedTable = t;
        this.dragOffsetX = worldX - t.x; this.dragOffsetY = worldY - t.y;
        this.canvas.style.cursor = "grabbing"; return;
      }
    }
    const elements = getActiveFloor(bz)?.elements || [];
    for (let i = elements.length - 1; i >= 0; i--) {
      const element = elements[i];
      if (this.isPointInsideElement(element, worldX, worldY)) {
        this.selectedTableId = null;
        this.selectedElementId = element.id;
        this.selectedZoneId = null;
        this.isDraggingElement = true;
        this.draggedElement = element;
        this.dragOffsetX = worldX - element.x;
        this.dragOffsetY = worldY - element.y;
        this.canvas.style.cursor = "grabbing";
        this.render();
        return;
      }
    }
    const zones = this.zones.filter((zone) => zone.closed);
    for (let i = zones.length - 1; i >= 0; i--) {
      const zone = zones[i];
      if (this.isPointInsideZone(zone, worldX, worldY)) {
        this.selectedZoneId = zone.id;
        this.isDraggingZone = true;
        this.draggedZone = zone;
        this.dragOffsetX = worldX;
        this.dragOffsetY = worldY;
        this.selectedTableId = null;
        this.selectedElementId = null;
        this.canvas.style.cursor = "grabbing";
        this.render();
        return;
      }
    }
    const floor = getActiveFloor(bz);
    if (this.mode === "select" && this.bgImageObj && floor && this._hitTestImg(worldX, worldY, floor)) {
      this.imgDragging = true;
      this.imgDragOffX = worldX - Number(floor.bgX || 0);
      this.imgDragOffY = worldY - Number(floor.bgY || 0);
      this.canvas.style.cursor = "move";
      return;
    }
    this.isPanning = true;
    this.selectedTableId = null;
    this.selectedElementId = null;
    this.selectedZoneId = null;
    this.startMouseX = rawX - this.panX;
    this.startMouseY = rawY - this.panY;
    this.canvas.style.cursor = "grabbing";
  }

  handleMouseMove(e) {
    const { rawX, rawY, worldX, worldY } = this.getCanvasCoords(e);

    if (this.mode === "select" && this.imgDragging) {
      const floor = getActiveFloor(this.getCurrentBazaar());
      if (!floor || !this.bgImageObj) return;
      floor.bgX = worldX - this.imgDragOffX;
      floor.bgY = worldY - this.imgDragOffY;
      this.render();
      return;
    }

    // ── Modo imgEdit ──
    if (this.mode === "imgEdit") {
      const floor = getActiveFloor(this.getCurrentBazaar());
      if (!floor || !this.bgImageObj) return;

      if (this.imgRotating && this.imgRotationStart) {
        const { centerX, centerY, pointerAngle, rotation } = this.imgRotationStart;
        const currentAngle = Math.atan2(worldY - centerY, worldX - centerX);
        const delta = (currentAngle - pointerAngle) * 180 / Math.PI;
        floor.bgRotation = ((rotation + delta) % 360 + 360) % 360;
        this.render();
        return;
      }

      if (this.imgResizing && this.imgResizeStart) {
        const { bgX, bgY, bgScaleX, bgScaleY, imgW, imgH,
          centerX, centerY, rotation, anchorWorldX, anchorWorldY } = this.imgResizeStart;
        const localMouse = this._worldToImageLocal(worldX, worldY, centerX, centerY, rotation);
        const h  = this.imgHandle;
        const origW = imgW * bgScaleX;
        const origH = imgH * bgScaleY;
        const minW = imgW * 0.05;
        const minH = imgH * 0.05;
        let newW = origW;
        let newH = origH;
        let newX = bgX;
        let newY = bgY;
        if (h.includes("r")) newW = Math.max(minW, localMouse.x - bgX);
        if (h.includes("l")) {
          newW = Math.max(minW, bgX + origW - localMouse.x);
          newX = bgX + origW - newW;
        }
        if (h.includes("b")) newH = Math.max(minH, localMouse.y - bgY);
        if (h.includes("t")) {
          newH = Math.max(minH, bgY + origH - localMouse.y);
          newY = bgY + origH - newH;
        }
        const anchorOffsetX = h.includes("l") ? newW / 2 : h.includes("r") ? -newW / 2 : 0;
        const anchorOffsetY = h.includes("t") ? newH / 2 : h.includes("b") ? -newH / 2 : 0;
        const rotatedOffsetX = anchorOffsetX * Math.cos(rotation) - anchorOffsetY * Math.sin(rotation);
        const rotatedOffsetY = anchorOffsetX * Math.sin(rotation) + anchorOffsetY * Math.cos(rotation);
        const newCenterX = anchorWorldX - rotatedOffsetX;
        const newCenterY = anchorWorldY - rotatedOffsetY;
        newX = newCenterX - newW / 2;
        newY = newCenterY - newH / 2;
        floor.bgX = newX;
        floor.bgY = newY;
        floor.bgScaleX = newW / imgW;
        floor.bgScaleY = newH / imgH;
        floor.bgScale = (floor.bgScaleX + floor.bgScaleY) / 2;
        this._syncImgSliders(floor);
        this.render(); return;
      }
      if (this.imgDragging) {
        floor.bgX = worldX - this.imgDragOffX;
        floor.bgY = worldY - this.imgDragOffY;
        this._syncImgSliders(floor);
        this.render(); return;
      }
      // Cursor según hover de handle
      const h = this._hitTestImgHandle(worldX, worldY, floor);
      const rotationHandle = this._hitTestImgRotationHandle(worldX, worldY, floor);
      const cursors = { tl:"nw-resize", tc:"n-resize", tr:"ne-resize", ml:"w-resize",
                        mr:"e-resize", bl:"sw-resize", bc:"s-resize", br:"se-resize" };
      this.canvas.style.cursor = rotationHandle ? "crosshair"
        : h ? cursors[h] : (this._hitTestImg(worldX, worldY, floor) ? "move" : "default");
      return;
    }

    // ── Modo zone: mover punto de zona ──
    if (this.mode === "zone" && this.draggingZonePoint && this.hoverPoint) {
      const zone = this.zones.find(z => z.id === this.hoverPoint.zoneId);
      if (zone) {
        const snapped = this.snapToGrid
          ? { x: Math.round(worldX / this.gridSize) * this.gridSize, y: Math.round(worldY / this.gridSize) * this.gridSize }
          : { x: worldX, y: worldY };
        zone.points[this.hoverPoint.pointIdx] = snapped;
        this.render();
      }
      return;
    }

    // ── Modo select: lógica original ──
    if (this.isDraggingTable && this.draggedTable) {
      this.draggedTable.x = worldX - this.dragOffsetX;
      this.draggedTable.y = worldY - this.dragOffsetY;
      if (this.snapTables) this.snapDraggedTable();
      this.render();
    } else if (this.isDraggingElement && this.draggedElement) {
      this.draggedElement.x = worldX - this.dragOffsetX;
      this.draggedElement.y = worldY - this.dragOffsetY;
      this.render();
    } else if (this.isDraggingZone && this.draggedZone) {
      const deltaX = worldX - this.dragOffsetX;
      const deltaY = worldY - this.dragOffsetY;
      this.draggedZone.points.forEach((point) => {
        point.x += deltaX;
        point.y += deltaY;
      });
      this.dragOffsetX = worldX;
      this.dragOffsetY = worldY;
      this.render();
    } else if (this.isPanning) {
      this.panX = rawX - this.startMouseX;
      this.panY = rawY - this.startMouseY;
      this.render();
    }
  }

  handleMouseUp(e) {
    if (this.imgResizing || this.imgDragging || this.imgRotating) {
      saveState();
      this.imgResizing = false;
      this.imgDragging = false;
      this.imgRotating = false;
      this.imgResizeStart = null;
      this.imgRotationStart = null;
      this.canvas.style.cursor = "default";
      return;
    }
    if (this.draggingZonePoint) {
      this.draggingZonePoint = false;
      this.hoverPoint = null;
      this.saveZones();
    }
    if (this.isDraggingTable || this.isDraggingElement) saveState();
    if (this.isDraggingZone) this.saveZones();
    this.isDraggingTable = false; this.draggedTable = null;
    this.isDraggingElement = false; this.draggedElement = null;
    this.isDraggingZone = false; this.draggedZone = null;
    this.isPanning = false;
    if (this.canvas && this.mode !== "imgEdit") this.canvas.style.cursor = "grab";
  }

  handleDoubleClick(e) {
    const { worldX, worldY } = this.getCanvasCoords(e);

    // Modo zona: doble clic cierra la zona en construcción
    if (this.mode === "zone") {
      if (this.drawingZone && this.drawingZone.points.length >= 3) {
        this.drawingZone.closed = true;
        this.zones.push({ ...this.drawingZone, points: [...this.drawingZone.points] });
        this.drawingZone = null;
        this.selectedZoneId = null;
        this.saveZones();
        this.updateZoneUI();
        this.render();
        showToast("✅ Zona cerrada con doble clic");
      } else {
        const zone = this.zones.slice().reverse().find((item) =>
          item.closed && this.isPointInsideZone(item, worldX, worldY)
        );
        if (zone) openModalZoneEdit(zone.id);
      }
      return;
    }

    const bz = this.getCurrentBazaar();
    const tables = getActiveTables(bz);
    for (let i = tables.length - 1; i >= 0; i--) {
      const t = tables[i];
      if (this.isPointInsideTable(t, worldX, worldY)) {
        openModalTableEdit(t.id); return;
      }
    }
    const elements = getActiveFloor(bz)?.elements || [];
    for (let i = elements.length - 1; i >= 0; i--) {
      if (this.isPointInsideElement(elements[i], worldX, worldY)) {
        openModalMapElementEdit(elements[i].id);
        return;
      }
    }
    const zones = this.zones.slice().reverse();
    for (const zone of zones) {
      if (zone.closed && this.isPointInsideZone(zone, worldX, worldY)) {
        openModalZoneEdit(zone.id);
        return;
      }
    }
  }

  isPointInsideTable(table, x, y) {
    const angle = -(Number(table.rotation) || 0) * Math.PI / 180;
    const centerX = table.x + table.w / 2;
    const centerY = table.y + table.h / 2;
    const dx = x - centerX;
    const dy = y - centerY;
    const localX = dx * Math.cos(angle) - dy * Math.sin(angle) + centerX;
    const localY = dx * Math.sin(angle) + dy * Math.cos(angle) + centerY;
    return localX >= table.x && localX <= table.x + table.w && localY >= table.y && localY <= table.y + table.h;
  }

  snapDraggedTable() {
    const table = this.draggedTable;
    if (!table) return;
    const others = getActiveTables(this.getCurrentBazaar()).filter((item) => item.id !== table.id);
    const threshold = 10 / this.scale;
    const originalX = table.x;
    const originalY = table.y;
    let bestX = { value: originalX, distance: threshold + 1 };
    let bestY = { value: originalY, distance: threshold + 1 };
    others.forEach((other) => {
      const xCandidates = [
        other.x - table.w,
        other.x + other.w,
        other.x,
        other.x + other.w - table.w,
        other.x + (other.w - table.w) / 2
      ];
      const yCandidates = [
        other.y - table.h,
        other.y + other.h,
        other.y,
        other.y + other.h - table.h,
        other.y + (other.h - table.h) / 2
      ];
      xCandidates.forEach((value) => {
        const distance = Math.abs(value - originalX);
        if (distance < bestX.distance) bestX = { value, distance };
      });
      yCandidates.forEach((value) => {
        const distance = Math.abs(value - originalY);
        if (distance < bestY.distance) bestY = { value, distance };
      });
    });
    if (bestX.distance <= threshold) table.x = bestX.value;
    if (bestY.distance <= threshold) table.y = bestY.value;
  }

  isPointInsideElement(element, x, y) {
    const width = Math.max(5, Number(element.width) || 30);
    const height = Math.max(5, Number(element.height) || 30);
    return x >= element.x - width / 2 && x <= element.x + width / 2 &&
           y >= element.y - height / 2 && y <= element.y + height / 2;
  }

  isPointInsideZone(zone, x, y) {
    let inside = false;
    const points = zone.points || [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const intersects = (points[i].y > y) !== (points[j].y > y) &&
        x < (points[j].x - points[i].x) * (y - points[i].y) /
          (points[j].y - points[i].y) + points[i].x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  // ── Helpers: manipulación de imagen ─────────────────────────────
  _getImgRect(floor) {
    if (!this.bgImageObj || !floor) return null;
    const sx = Number(floor.bgScaleX || floor.bgScale || 1);
    const sy = Number(floor.bgScaleY || floor.bgScale || 1);
    const x = Number(floor.bgX || 0);
    const y = Number(floor.bgY || 0);
    const w = this.bgImageObj.naturalWidth  * sx;
    const h = this.bgImageObj.naturalHeight * sy;
    return { x, y, w, h };
  }

  _getImgHandles(floor) {
    const r = this._getImgRect(floor);
    if (!r) return [];
    const { x, y, w, h } = r;
    const points = [
      { id:"tl", cx:x,       cy:y       },
      { id:"tc", cx:x+w/2,   cy:y       },
      { id:"tr", cx:x+w,     cy:y       },
      { id:"ml", cx:x,       cy:y+h/2   },
      { id:"mr", cx:x+w,     cy:y+h/2   },
      { id:"bl", cx:x,       cy:y+h     },
      { id:"bc", cx:x+w/2,   cy:y+h     },
      { id:"br", cx:x+w,     cy:y+h     },
    ];
    const angle = Number(floor.bgRotation || 0) * Math.PI / 180;
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    return points.map((point) => {
      const dx = point.cx - centerX;
      const dy = point.cy - centerY;
      return {
        id: point.id,
        cx: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
        cy: centerY + dx * Math.sin(angle) + dy * Math.cos(angle)
      };
    });
  }

  _hitTestImgHandle(wx, wy, floor) {
    const hitRadius = 10 / this.scale;
    for (const h of this._getImgHandles(floor)) {
      if (Math.hypot(wx - h.cx, wy - h.cy) < hitRadius) return h.id;
    }
    return null;
  }

  _getOppositeImgHandle(handleId) {
    const opposites = { tl: "br", tc: "bc", tr: "bl", ml: "mr", mr: "ml", bl: "tr", bc: "tc", br: "tl" };
    return opposites[handleId] || "br";
  }

  _getImgRotationHandle(floor) {
    const r = this._getImgRect(floor);
    if (!r) return null;
    const angle = Number(floor.bgRotation || 0) * Math.PI / 180;
    const centerX = r.x + r.w / 2;
    const centerY = r.y + r.h / 2;
    const localX = centerX;
    const localY = r.y - 34 / this.scale;
    const dx = localX - centerX;
    const dy = localY - centerY;
    return {
      cx: centerX + dx * Math.cos(angle) - dy * Math.sin(angle),
      cy: centerY + dx * Math.sin(angle) + dy * Math.cos(angle)
    };
  }

  _hitTestImgRotationHandle(wx, wy, floor) {
    const handle = this._getImgRotationHandle(floor);
    return handle && Math.hypot(wx - handle.cx, wy - handle.cy) < 13 / this.scale;
  }

  _hitTestImg(wx, wy, floor) {
    const r = this._getImgRect(floor);
    if (!r) return false;
    const centerX = r.x + r.w / 2;
    const centerY = r.y + r.h / 2;
    const rotation = Number(floor.bgRotation || 0) * Math.PI / 180;
    const local = this._worldToImageLocal(wx, wy, centerX, centerY, rotation);
    return local.x >= r.x && local.x <= r.x + r.w && local.y >= r.y && local.y <= r.y + r.h;
  }

  _worldToImageLocal(wx, wy, centerX, centerY, rotation) {
    const inverseRotation = -rotation;
    const dx = wx - centerX;
    const dy = wy - centerY;
    return {
      x: centerX + dx * Math.cos(inverseRotation) - dy * Math.sin(inverseRotation),
      y: centerY + dx * Math.sin(inverseRotation) + dy * Math.cos(inverseRotation)
    };
  }

  _syncImgSliders(floor) {
    const scaleEl = document.getElementById("floor-plan-scale");
    const scaleValEl = document.getElementById("floor-plan-scale-value");
    const scale = (Number(floor.bgScaleX || floor.bgScale || 1) + Number(floor.bgScaleY || floor.bgScale || 1)) / 2;
    if (scaleEl) scaleEl.value = Math.round(scale * 100);
    if (scaleValEl) scaleValEl.textContent = `${Math.round(scale * 100)}%`;
  }

  // Dibuja los handles de la imagen en modo imgEdit
  drawImgHandles(floor) {
    if (!this.bgImageObj || !floor) return;
    const accent = getAccentColor();   // color de la interfaz elegido en ⚙️
    const r = this._getImgRect(floor);
    if (!r) return;
    // Marco punteado alrededor de la imagen
    this.ctx.save();
    this.ctx.strokeStyle = accent;
    this.ctx.lineWidth   = 2 / this.scale;
    this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);
    this.ctx.beginPath();
    const corners = this._getImgHandles(floor).filter((handle) => ["tl", "tr", "br", "bl"].includes(handle.id));
    this.ctx.moveTo(corners[0].cx, corners[0].cy);
    corners.slice(1).forEach((corner) => this.ctx.lineTo(corner.cx, corner.cy));
    this.ctx.closePath();
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    // Handles
    const handleR = 7 / this.scale;
    for (const h of this._getImgHandles(floor)) {
      this.ctx.beginPath();
      this.ctx.arc(h.cx, h.cy, handleR, 0, Math.PI * 2);
      this.ctx.fillStyle   = "#ffffff";
      this.ctx.fill();
      this.ctx.strokeStyle = accent;
      this.ctx.lineWidth   = 2 / this.scale;
      this.ctx.stroke();
    }
    const topCenter = this._getImgHandles(floor).find((handle) => handle.id === "tc");
    const rotationHandle = this._getImgRotationHandle(floor);
    if (topCenter && rotationHandle) {
      this.ctx.beginPath();
      this.ctx.moveTo(topCenter.cx, topCenter.cy);
      this.ctx.lineTo(rotationHandle.cx, rotationHandle.cy);
      this.ctx.strokeStyle = accent;
      this.ctx.lineWidth = 2 / this.scale;
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.arc(rotationHandle.cx, rotationHandle.cy, 10 / this.scale, 0, Math.PI * 2);
      this.ctx.fillStyle = accent;
      this.ctx.fill();
      this.ctx.fillStyle = "#ffffff";
      this.ctx.font = `bold ${13 / this.scale}px sans-serif`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText("↻", rotationHandle.cx, rotationHandle.cy);
    }
    // Label de tamaño
    const scaleX = Math.round(Number(floor.bgScaleX || floor.bgScale || 1) * 100);
    const scaleY = Math.round(Number(floor.bgScaleY || floor.bgScale || 1) * 100);
    this.ctx.fillStyle  = accent;
    this.ctx.font       = `bold ${13 / this.scale}px sans-serif`;
    this.ctx.textAlign  = "left";
    this.ctx.textBaseline = "bottom";
    this.ctx.fillText(`📐 ${scaleX}% × ${scaleY}%  ${Math.round(r.w)}×${Math.round(r.h)}px`, r.x + 4 / this.scale, r.y - 4 / this.scale);
    this.ctx.restore();
  }

  // ── Helpers: zonas ───────────────────────────────────────────────
  _hitTestZonePoint(wx, wy) {
    const hitR = 9 / this.scale;
    for (const zone of this.zones) {
      for (let i = 0; i < zone.points.length; i++) {
        if (Math.hypot(wx - zone.points[i].x, wy - zone.points[i].y) < hitR) {
          return { zoneId: zone.id, pointIdx: i };
        }
      }
    }
    return null;
  }

  // Dibuja la cuadrícula de zonas (araña/polígono)
  drawZones(mouseWorldX, mouseWorldY) {
    const ctx = this.ctx;

    // Dibuja zonas cerradas guardadas
    for (const zone of this.zones) {
      if (!zone.points || zone.points.length < 2) continue;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(zone.points[0].x, zone.points[0].y);
      for (let i = 1; i < zone.points.length; i++) ctx.lineTo(zone.points[i].x, zone.points[i].y);
      if (zone.closed) ctx.closePath();
      ctx.fillStyle   = zone.color + "28";
      ctx.fill();
      ctx.strokeStyle = zone.color;
      ctx.lineWidth   = 2 / this.scale;
      ctx.setLineDash([]);
      ctx.stroke();
      if (zone.id === this.selectedZoneId) {
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 4 / this.scale;
        ctx.setLineDash([8 / this.scale, 5 / this.scale]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // Puntos de control (editables en modo zone)
      if (this.mode === "zone") {
        for (const pt of zone.points) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5 / this.scale, 0, Math.PI * 2);
          ctx.fillStyle   = zone.color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth   = 1.5 / this.scale;
          ctx.stroke();
        }
      }
      // Etiqueta en centroide
      if (zone.closed && zone.points.length >= 3) {
        const cx = zone.points.reduce((s, p) => s + p.x, 0) / zone.points.length;
        const cy = zone.points.reduce((s, p) => s + p.y, 0) / zone.points.length;
        ctx.fillStyle   = zone.color;
        ctx.font        = `bold ${11 / this.scale}px sans-serif`;
        ctx.textAlign   = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(zone.label, cx, cy);
      }
      ctx.restore();
    }

    // Zona en construcción
    if (this.drawingZone && this.drawingZone.points.length > 0) {
      const pts = this.drawingZone.points;
      ctx.save();
      ctx.strokeStyle = this.drawingZone.color;
      ctx.lineWidth   = 2 / this.scale;
      ctx.setLineDash([5 / this.scale, 4 / this.scale]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      // Línea hacia el cursor actual
      if (mouseWorldX !== undefined) ctx.lineTo(mouseWorldX, mouseWorldY);
      ctx.stroke();
      ctx.setLineDash([]);
      // Puntos dibujados
      for (let i = 0; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, i === 0 ? 7 / this.scale : 5 / this.scale, 0, Math.PI * 2);
        ctx.fillStyle   = i === 0 ? "#fff" : this.drawingZone.color;
        ctx.strokeStyle = this.drawingZone.color;
        ctx.lineWidth   = 2 / this.scale;
        ctx.fill(); ctx.stroke();
      }
      // Hint "cierra la zona" cuando el cursor está cerca del primer punto
      if (mouseWorldX !== undefined && pts.length >= 3) {
        const dist = Math.hypot(mouseWorldX - pts[0].x, mouseWorldY - pts[0].y);
        if (dist < 14 / this.scale) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 10 / this.scale, 0, Math.PI * 2);
          ctx.fillStyle = this.drawingZone.color + "55";
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // Actualiza el panel lateral de zonas
  updateZoneUI() {
    const panel = document.getElementById("zones-panel");
    if (!panel) return;
    panel.style.display = this.mode === "zone" ? "block" : "none";
    const list = document.getElementById("zones-list");
    if (!list) return;
    if (this.zones.length === 0) {
      list.innerHTML = `<p style="font-size:var(--fs-xs);color:var(--color-text-muted);">
        Haz clic en el canvas para poner puntos. Cierra con clic en el primer punto,
        doble clic, o clic derecho para cancelar.
      </p>`;
      return;
    }
    list.innerHTML = this.zones.map((z, idx) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--color-border);">
        <span style="width:14px;height:14px;border-radius:3px;background:${z.color};flex-shrink:0;display:inline-block;"></span>
        <input type="text" value="${escapeHTML(z.label)}"
               style="flex:1;background:none;border:none;outline:none;font-size:var(--fs-xs);font-weight:700;color:var(--color-text);"
               onchange="bazaarCanvas.renameZone('${z.id}', this.value)">
        <input type="color" value="${z.color}" style="width:24px;height:24px;border:none;cursor:pointer;border-radius:4px;"
               onchange="bazaarCanvas.recolorZone('${z.id}', this.value)">
        <button class="btn-danger" style="padding:2px 6px;font-size:10px;border-radius:4px;"
                onclick="confirmDeleteZone('${z.id}')">🗑️</button>
      </div>`).join("");
  }

  renameZone(id, label) {
    const z = this.zones.find(z => z.id === id);
    if (z) { z.label = label.trim() || z.label; this.saveZones(); this.render(); }
  }

  recolorZone(id, color) {
    const z = this.zones.find(z => z.id === id);
    if (z) { z.color = color; this.saveZones(); this.render(); this.updateZoneUI(); }
  }

  deleteZone(id) {
    const previousLength = this.zones.length;
    this.zones = this.zones.filter((zone) => zone.id !== id);
    if (this.zones.length === previousLength) return false;
    if (this.selectedZoneId === id) this.selectedZoneId = null;
    if (this.drawingZone?.id === id) this.drawingZone = null;
    this.saveZones(); this.render(); this.updateZoneUI();
    showToast("🗑️ Zona eliminada");
    return true;
  }

  render(mouseRawX, mouseRawY) {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width, h = this.canvas.height;
    this.ctx.save();
    this.ctx.clearRect(0, 0, w, h);
    this.ctx.translate(this.panX, this.panY);
    this.ctx.scale(this.scale, this.scale);
    // Cuadrícula única, en coordenadas del plano (se mueve y escala con zoom/desplazamiento),
    // debajo de la imagen de fondo. Ya no hay cuadrícula CSS duplicada.
    if (this.showGrid) this.drawGrid(w, h);

    const bz    = this.getCurrentBazaar();
    const floor = getActiveFloor(bz);

    // Imagen de fondo
    if (this.bgImageObj && floor) {
      const opacity = Number(floor.backgroundOpacity ?? 1);
      this.ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      const bgScaleX = Number(floor.bgScaleX || floor.bgScale || 1);
      const bgScaleY = Number(floor.bgScaleY || floor.bgScale || 1);
      const bgX = Number(floor.bgX || 0);
      const bgY = Number(floor.bgY || 0);
      const bgW = this.bgImageObj.naturalWidth * bgScaleX;
      const bgH = this.bgImageObj.naturalHeight * bgScaleY;
      this.ctx.save();
      this.ctx.translate(bgX + bgW / 2, bgY + bgH / 2);
      this.ctx.rotate(Number(floor.bgRotation || 0) * Math.PI / 180);
      this.ctx.drawImage(this.bgImageObj, -bgW / 2, -bgH / 2, bgW, bgH);
      this.ctx.restore();
      this.ctx.globalAlpha = 1;
    }

    // Coordenadas del cursor para la línea guía de zonas.
    let mWX, mWY;
    if (mouseRawX !== undefined) {
      const rect = this.canvas.getBoundingClientRect();
      mWX = ((mouseRawX - rect.left) * (this.canvas.width / rect.width) - this.panX) / this.scale;
      mWY = ((mouseRawY - rect.top) * (this.canvas.height / rect.height) - this.panY) / this.scale;
    }
    // Elementos y mesas se dibujan primero para que las zonas queden encima.
    this.drawMapElements(floor?.elements || []);
    if (this.showTables) getActiveTables(bz).forEach((t) => this.drawTable(t));
    if (this.showZones) this.drawZones(mWX, mWY);

    // Handles de imagen (sólo en modo imgEdit)
    if (this.mode === "imgEdit" && this.bgImageObj && floor) {
      this.drawImgHandles(floor);
    }

    this.ctx.restore();
    if (typeof updateScaleBar === "function") updateScaleBar();
  }

  // Cuadrícula en coordenadas del plano: líneas finas cada gridSize y más marcadas cada 5 celdas.
  drawGrid(width, height) {
    const ctx = this.ctx;
    const gs = this.gridSize;
    const dark = document.body.classList.contains("dark");
    const minor = dark ? "rgba(226,245,244,0.07)" : "rgba(13,148,136,0.12)";
    const major = dark ? "rgba(226,245,244,0.15)" : "rgba(13,148,136,0.25)";
    // Zona visible expresada en coordenadas del plano.
    const x0 = -this.panX / this.scale, x1 = (width - this.panX) / this.scale;
    const y0 = -this.panY / this.scale, y1 = (height - this.panY) / this.scale;
    const startX = Math.floor(x0 / gs) * gs, startY = Math.floor(y0 / gs) * gs;
    ctx.save();
    ctx.lineWidth = 1 / this.scale;
    const paint = (color, wantMajor) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let x = startX; x <= x1; x += gs) {
        if ((Math.round(x / gs) % 5 === 0) !== wantMajor) continue;
        ctx.moveTo(x, y0); ctx.lineTo(x, y1);
      }
      for (let y = startY; y <= y1; y += gs) {
        if ((Math.round(y / gs) % 5 === 0) !== wantMajor) continue;
        ctx.moveTo(x0, y); ctx.lineTo(x1, y);
      }
      ctx.stroke();
    };
    paint(minor, false);
    paint(major, true);
    ctx.restore();
  }

  drawMapElements(elements) {
    const styles = {
      electricidad: { color: "#f59e0b", icon: "⚡" },
      pilar: { color: "#64748b", icon: "▣" },
      entrada: { color: "#0d9488", icon: "↗" },
      otro: { color: "#8b5cf6", icon: "•" }
    };
    elements.forEach((element) => {
      const style = styles[element.type] || styles.otro;
      this.ctx.save();
      this.ctx.fillStyle = style.color;
      this.ctx.globalAlpha = 0.9;
      this.ctx.beginPath();
      const width = Math.max(5, Number(element.width) || 30);
      const height = Math.max(5, Number(element.height) || 30);
      this.ctx.roundRect(element.x - width / 2, element.y - height / 2, width, height, 5);
      this.ctx.fill();
      if (element.id === this.selectedElementId) {
        this.ctx.strokeStyle = "#1e293b";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.roundRect(element.x - width / 2 - 4, element.y - height / 2 - 4, width + 8, height + 8, 7);
        this.ctx.stroke();
      }
      this.ctx.fillStyle = "#fff";
      this.ctx.font = "bold 15px sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(element.emoji || style.icon, element.x, element.y);
      this.ctx.fillStyle = "#1e293b";
      this.ctx.font = "bold 10px sans-serif";
      this.ctx.fillText(element.label, element.x, element.y + 26);
      this.ctx.restore();
    });
  }

  drawTable(t) {
    const bz = this.getCurrentBazaar();
    const owners = [t.exhibitorId, t.shared ? t.exhibitorId2 : ""].map((id) => (id ? bz.expositores.find((e) => e.id === id) : null) || null);
    if (t.shared) { this.drawSharedTable(t, owners); return; }
    const exhibitor = owners[0];
    let fillColor = "#ffffff", borderColor = "#94a3b8";
    if (exhibitor) {
      fillColor = getTableOwnerColor(exhibitor);
      borderColor = fillColor;
    } else if (t.attended) { fillColor = "#dcfce7"; borderColor = "#22c55e"; }
    else if (t.absent) {
      // Mesa libre (sin expositor ni color propio) marcada como "no asistió":
      // no hay un color que atenuar, así que se muestra en rojo como antes.
      fillColor = "#fee2e2"; borderColor = "#ef4444";
    }
    this.ctx.save();
    this.ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
    this.ctx.rotate((Number(t.rotation) || 0) * Math.PI / 180);
    this.ctx.translate(-(t.x + t.w / 2), -(t.y + t.h / 2));
    this.ctx.shadowColor = "rgba(0,0,0,0.08)"; this.ctx.shadowBlur = 6;
    this.ctx.shadowOffsetX = 2; this.ctx.shadowOffsetY = 2;
    // "No asistió" conserva el color asignado (categoría/personalizado) pero
    // se atenúa, en vez de taparlo con rojo: así se sigue viendo de quién
    // era la mesa, y no solo que faltó.
    if (t.absent) this.ctx.globalAlpha = 0.70;
    this.ctx.fillStyle = fillColor; this.ctx.strokeStyle = borderColor; this.ctx.lineWidth = 2;
    this.ctx.beginPath(); this.ctx.roundRect(t.x, t.y, t.w, t.h, 6);
    this.ctx.fill(); this.ctx.stroke();
    this.ctx.shadowColor = "transparent";
    const labelFontSize = Math.max(8, Math.min(32, Number(t.labelFontSize) || 11));
    this.ctx.fillStyle = t.labelColor || "#1e293b";
    this.ctx.font = `bold ${labelFontSize}px sans-serif`;
    this.ctx.textAlign = "center"; this.ctx.textBaseline = "middle";
    this.ctx.fillText(t.name || "Mesa", t.x + t.w / 2, t.y + (exhibitor ? t.h / 3 : t.h / 2));
    if (exhibitor) {
      this.ctx.fillStyle = t.labelColor || "#475569";
      this.ctx.font = `${Math.max(7, Math.round(labelFontSize * .82))}px sans-serif`;
      const txt = exhibitor.negocio.length > 11 ? exhibitor.negocio.slice(0, 9) + ".." : exhibitor.negocio;
      this.ctx.fillText(txt, t.x + t.w / 2, t.y + (t.h * 2) / 3);
    }
    this.ctx.restore();
  }

  // Mesa compartida: dos mitades (A a la izquierda, B a la derecha), cada una con el color de su expositor.
  drawSharedTable(t, owners) {
    const ctx = this.ctx;
    const halfW = t.w / 2;
    const colorOf = (exp) => (exp ? getTableOwnerColor(exp) : "");
    ctx.save();
    ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
    ctx.rotate((Number(t.rotation) || 0) * Math.PI / 180);
    ctx.translate(-(t.x + t.w / 2), -(t.y + t.h / 2));
    ctx.shadowColor = "rgba(0,0,0,0.08)"; ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.roundRect(t.x, t.y, t.w, t.h, 6); ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.save();
    ctx.beginPath(); ctx.roundRect(t.x, t.y, t.w, t.h, 6); ctx.clip();
    owners.forEach((exp, i) => {
      const x = t.x + i * halfW;
      const state = tableAttendanceState(t, i + 1);
      const color = colorOf(exp);
      ctx.globalAlpha = state === "absent" ? 0.7 : 1;
      ctx.fillStyle = exp ? color + "33" : "#f8fafc";
      ctx.fillRect(x, t.y, halfW, t.h);
      if (exp) { ctx.fillStyle = color; ctx.fillRect(x, t.y, halfW, Math.max(4, t.h * 0.12)); }
      if (exp && state === "attended") {
        ctx.fillStyle = "#16a34a"; ctx.font = `bold ${Math.max(9, t.h * 0.22)}px sans-serif`;
        ctx.textAlign = "right"; ctx.textBaseline = "top";
        ctx.fillText("✓", x + halfW - 3, t.y + t.h * 0.14);
      }
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(t.x, t.y, t.w, t.h, 6); ctx.stroke();
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(t.x + halfW, t.y); ctx.lineTo(t.x + halfW, t.y + t.h); ctx.stroke();
    ctx.setLineDash([]);
    const labelFontSize = Math.max(8, Math.min(32, Number(t.labelFontSize) || 11));
    ctx.fillStyle = t.labelColor || "#1e293b";
    ctx.font = `bold ${labelFontSize}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(`${t.name || "Mesa"} · ½`, t.x + t.w / 2, t.y + t.h * 0.38);
    ctx.font = `${Math.max(7, Math.round(labelFontSize * 0.72))}px sans-serif`;
    ctx.fillStyle = t.labelColor || "#475569";
    owners.forEach((exp, i) => {
      const txt = exp ? (exp.negocio.length > 7 ? exp.negocio.slice(0, 6) + ".." : exp.negocio) : "Libre";
      ctx.fillText(txt, t.x + halfW * (i + 0.5), t.y + t.h * 0.75);
    });
    ctx.restore();
  }

  drawLegend(bz) {
    const categories = [];
    getActiveTables(bz).forEach((table) => {
      const exhibitor = bz.expositores.find((item) => item.id === table.exhibitorId);
      const category = exhibitor && AppState.categorias.find((item) => item.id === exhibitor.categoria);
      if (category && !categories.some((item) => item.id === category.id)) categories.push(category);
    });
    if (!categories.length) return;
    const padding = 10;
    const rowHeight = 18;
    const width = 170;
    const height = padding * 2 + 18 + categories.length * rowHeight;
    const x = padding;
    const y = this.canvas.height - height - padding;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = "rgba(255,255,255,0.92)";
    this.ctx.strokeStyle = "#cbd5e1";
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(x, y, width, height);
    this.ctx.strokeRect(x, y, width, height);
    this.ctx.fillStyle = "#1e293b";
    this.ctx.font = "bold 11px sans-serif";
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("Categorías", x + padding, y + padding + 5);
    categories.forEach((category, index) => {
      const rowY = y + padding + 23 + index * rowHeight;
      this.ctx.fillStyle = category.color;
      this.ctx.fillRect(x + padding, rowY - 5, 10, 10);
      this.ctx.fillStyle = "#334155";
      this.ctx.font = "10px sans-serif";
      this.ctx.fillText(category.nombre, x + padding + 16, rowY);
    });
    this.ctx.restore();
  }
}

const bazaarCanvas = new BazaarCanvasManager();

function openModalZoneEdit(zoneId) {
  const zone = bazaarCanvas.zones.find((item) => item.id === zoneId);
  if (!zone) return;
  document.getElementById("edit-zone-id").value = zone.id;
  document.getElementById("edit-zone-label").value = zone.label || "Zona";
  document.getElementById("edit-zone-color").value = zone.color || "#0d9488";
  bazaarCanvas.selectedZoneId = zone.id;
  bazaarCanvas.render();
  openModal("modal-editar-zona");
}

function saveZoneEdit() {
  const zoneId = document.getElementById("edit-zone-id").value;
  const zone = bazaarCanvas.zones.find((item) => item.id === zoneId);
  if (!zone) return;
  zone.label = document.getElementById("edit-zone-label").value.trim() || "Zona";
  zone.color = document.getElementById("edit-zone-color").value;
  bazaarCanvas.saveZones();
  bazaarCanvas.render();
  bazaarCanvas.updateZoneUI();
  closeModal("modal-editar-zona");
  showToast("✅ Zona actualizada");
}

async function deleteZoneFromModal() {
  const zoneId = document.getElementById("edit-zone-id").value;
  if (!zoneId || !await appConfirm("¿Eliminar esta zona del plano?", "Eliminar zona")) return;
  bazaarCanvas.deleteZone(zoneId);
  bazaarCanvas.selectedZoneId = null;
  closeModal("modal-editar-zona");
}

// ==========================================
// 21. FUNCIONES DEL CANVAS (helpers globales)
// ==========================================

// Colores predefinidos para zonas (cicla automáticamente)
