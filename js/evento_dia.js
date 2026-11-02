/**
 * BAZARIX — evento_dia.js
 * Panel "Día del Evento" (asistencia y pagos en tiempo real) + Mapeo del Evento.
 * Cuenta las mesas que tienen un expositor asignado, de TODOS los pisos del bazar.
 * Dependencias: state.js, utils.js, asistencia.js (setTableAttendance), canvas.js
 */

// ==========================================
// PANEL DÍA DEL EVENTO
// ==========================================

/** Mesas con expositor asignado (todos los pisos) + su estado de asistencia. */
/** dia: "all" (todos los planos) o el id de un día (sus planos + los que no tienen día). */
function getDiaEventoTables(bz = getActiveBazaar(), dia = "all") {
  const result = [];
  (bz?.floors || []).forEach((floor) => {
    const planoDia = floorDiaId(floor, bz);
    if (dia !== "all" && planoDia && planoDia !== dia) return;
    (floor.tables || []).forEach((table) => {
      [1, 2].forEach((slot) => {   // una entrada por expositor (una mesa compartida cuenta dos)
        const exp = bz.expositores.find((item) => item.id === tableSlotValue(table, slot));
        if (!exp) return;
        result.push({ table, floor, exp, slot, state: tableAttendanceState(table, slot) });
      });
    });
  });
  return result;
}

/** Pestaña activa de Día del Evento: un día (el de hoy si coincide) o "all". */
function diaEventoActual(bz = getActiveBazaar()) {
  if (!bazarEsMultiDia(bz)) return "all";
  const guardado = AppState.diaEventoDia;
  if (guardado === "all") return "all";
  if (bz.evento.dias.some((d) => d.id === guardado)) return guardado;
  const hoy = new Date().toISOString().slice(0, 10);
  return bz.evento.dias.find((d) => d.fecha === hoy)?.id || "all";
}

function setDiaEventoDia(id) {
  AppState.diaEventoDia = id;
  saveState();
  renderPanelDiaEvento();
}

function renderDiaEventoTabs(bz) {
  const box = document.getElementById("dia-evento-tabs");
  if (!box) return;
  box.hidden = !bazarEsMultiDia(bz);
  if (box.hidden) return;
  const actual = diaEventoActual(bz);
  const tab = (id, label) => `<button type="button" class="filter-chip ${actual === id ? "active" : ""}" onclick="setDiaEventoDia('${id}')">${escapeHTML(label)}</button>`;
  box.innerHTML = tab("all", "Todos los días") + bz.evento.dias.map((d, i) => tab(d.id, getDiaLabel(d, i))).join("");
}

function renderPanelDiaEvento() {
  const bz = getActiveBazaar();
  if (!bz || !document.getElementById("sec-dia-evento")) return;
  renderDiaEventoTabs(bz);

  const entries  = getDiaEventoTables(bz, diaEventoActual(bz));
  const total    = entries.length;
  const attended = entries.filter((e) => e.state === "attended").length;
  const absent   = entries.filter((e) => e.state === "absent").length;
  const pending  = total - attended - absent;
  const pct      = total ? Math.round((attended / total) * 100) : 0;
  const paid     = bz.expositores.filter((e) => e.pagado).length;

  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set("dia-stat-total",      total);
  set("dia-stat-asistio",    attended);
  set("dia-stat-pendiente",  pending);
  set("dia-stat-no-asistio", absent);
  set("dia-stat-pct",        `${pct}%`);
  set("dia-stat-pagados",    `${paid}/${bz.expositores.length}`);

  // Solo se cuentan mesas con expositor, así que la etiqueta lo aclara.
  const totalLabel = document.getElementById("dia-stat-total")?.parentElement?.querySelector(".stat-label");
  if (totalLabel) totalLabel.textContent = "Mesas asignadas";

  const bar = document.getElementById("dia-progress-bar");
  if (bar) bar.style.width = `${pct}%`;

  const list = document.getElementById("dia-pendientes-list");
  if (!list) return;

  if (total === 0) {
    list.innerHTML = `<p style="font-size:var(--fs-sm);color:var(--color-text-muted);">Aún no hay mesas con expositor asignado. Asígnalas desde el plano.</p>`;
    return;
  }

  const pendingEntries = entries
    .filter((e) => e.state === "pending")
    .sort((a, b) => String(a.table.name).localeCompare(String(b.table.name), "es", { numeric: true }));

  if (pendingEntries.length === 0) {
    list.innerHTML = `
      <div class="catalog-empty" style="padding:var(--space-6);">
        <span class="catalog-empty-icon">✅</span>
        <h3>Todo confirmado</h3>
        <p>Ya se registró la asistencia de todas las mesas asignadas.</p>
      </div>`;
    return;
  }

  const multiFloor = (bz.floors || []).length > 1;
  list.innerHTML = pendingEntries.map(({ table, floor, exp, slot }) => `
    <div class="card-meta-item" style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
      <div style="min-width:0;">
        <strong>${escapeHTML(exp.negocio)}</strong>
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);">
          ${escapeHTML(table.name)}${table.shared ? " (½ mesa)" : ""}${multiFloor ? ` · ${escapeHTML(floorLabel(floor, bz))}` : ""} · ${escapeHTML(exp.nombre)}
        </div>
        ${exp.pagado ? "" : `<div style="font-size:var(--fs-xs);font-weight:700;color:var(--color-danger);">⏳ Pago pendiente</div>`}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;">
        <button class="btn-primary btn-sm" onclick="setTableAttendance('${table.id}','attended',${slot})">✅ Asistió</button>
        <button class="btn-danger btn-sm" onclick="setTableAttendance('${table.id}','absent',${slot})">❌ No asistió</button>
      </div>
    </div>`).join("");
}

// ==========================================
// MODO PRESENTACIÓN
// Muestra el plano del piso activo a pantalla completa, ajustado al contenido,
// y se refresca cada 3 s para reflejar la asistencia en vivo.
// ==========================================
let _presentationTimer = null;

function getPresentationBounds(floor) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x1, y1, x2, y2) => {
    minX = Math.min(minX, x1); minY = Math.min(minY, y1);
    maxX = Math.max(maxX, x2); maxY = Math.max(maxY, y2);
  };

  (floor.tables || []).forEach((t) => {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2, r = Math.hypot(t.w, t.h) / 2;
    add(cx - r, cy - r, cx + r, cy + r);
  });
  (floor.elements || []).forEach((el) => {
    add(el.x - el.width, el.y - el.height, el.x + el.width, el.y + el.height);
  });
  (bazaarCanvas.zones || []).forEach((zone) => {
    (zone.points || []).forEach((p) => add(p.x, p.y, p.x, p.y));
  });
  const img = bazaarCanvas.bgImageObj;
  if (img && img.naturalWidth) {
    const bgX = Number(floor.bgX || 0), bgY = Number(floor.bgY || 0);
    add(bgX, bgY,
        bgX + img.naturalWidth  * Number(floor.bgScaleX || floor.bgScale || 1),
        bgY + img.naturalHeight * Number(floor.bgScaleY || floor.bgScale || 1));
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function drawPresentationFrame() {
  const source = bazaarCanvas?.canvas;
  const target = document.getElementById("presentation-canvas");
  if (!source || !target) return;

  const bz = getActiveBazaar();
  const floor = getActiveFloor(bz);

  // Se ajusta la vista al contenido, se captura y se restaura la vista del usuario.
  const saved = { scale: bazaarCanvas.scale, panX: bazaarCanvas.panX, panY: bazaarCanvas.panY };
  const bounds = floor ? getPresentationBounds(floor) : null;
  if (bounds) {
    const pad = 40;
    const contentW = bounds.maxX - bounds.minX;
    const contentH = bounds.maxY - bounds.minY;
    const scale = Math.max(0.2, Math.min(3,
      source.width  / (contentW + pad * 2),
      source.height / (contentH + pad * 2)));
    bazaarCanvas.scale = scale;
    bazaarCanvas.panX  = (source.width  - contentW * scale) / 2 - bounds.minX * scale;
    bazaarCanvas.panY  = (source.height - contentH * scale) / 2 - bounds.minY * scale;
  }
  bazaarCanvas.render();

  target.width  = source.width;
  target.height = source.height;
  const ctx = target.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);

  bazaarCanvas.scale = saved.scale;
  bazaarCanvas.panX  = saved.panX;
  bazaarCanvas.panY  = saved.panY;
  bazaarCanvas.render();

  const entries  = getDiaEventoTables(bz, floor ? (floorDiaId(floor, bz) || "all") : "all");
  const attended = entries.filter((e) => e.state === "attended").length;
  const title = document.getElementById("presentation-bazar-name");
  if (title) {
    title.textContent = `${bz?.name || "BAZARIX"}${floor ? ` — ${floorLabel(floor, bz)}` : ""} · ✅ ${attended}/${entries.length} asistieron`;
  }
}

function renderPresentationFloorSelector() {
  const selector = document.getElementById("presentation-floor-select");
  const bz = getActiveBazaar();
  if (!selector || !bz) return;
  selector.innerHTML = (bz.floors || []).map((floor) =>
    `<option value="${escapeHTML(floor.id)}" ${floor.id === bz.activeFloorId ? "selected" : ""}>${escapeHTML(floorLabel(floor, bz))}</option>`
  ).join("");
  selector.hidden = bz.floors.length < 2;
}

function changePresentationFloor(floorId) {
  if (!getActiveBazaar()?.floors?.some((floor) => floor.id === floorId)) return;
  switchFloor(floorId);
  renderPresentationFloorSelector();
  drawPresentationFrame();
}

function _presentationKeyHandler(e) {
  if (e.key === "Escape") exitPresentationMode();
}

function _presentationFullscreenHandler() {
  const overlay = document.getElementById("presentation-overlay");
  if (!document.fullscreenElement && overlay && overlay.style.display !== "none") exitPresentationMode();
}

function enterPresentationMode() {
  const overlay = document.getElementById("presentation-overlay");
  if (!overlay || !bazaarCanvas?.canvas) {
    showToast("❌ No se pudo abrir el mapeo del evento", "error");
    return;
  }
  renderPresentationFloorSelector();
  overlay.style.display = "flex";
  drawPresentationFrame();

  clearInterval(_presentationTimer);
  _presentationTimer = setInterval(drawPresentationFrame, 3000);
  document.addEventListener("keydown", _presentationKeyHandler);
  document.addEventListener("fullscreenchange", _presentationFullscreenHandler);

  if (overlay.requestFullscreen) overlay.requestFullscreen().catch(() => {});
}

function exitPresentationMode() {
  const overlay = document.getElementById("presentation-overlay");
  if (overlay) overlay.style.display = "none";
  clearInterval(_presentationTimer);
  _presentationTimer = null;
  document.removeEventListener("keydown", _presentationKeyHandler);
  document.removeEventListener("fullscreenchange", _presentationFullscreenHandler);
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
