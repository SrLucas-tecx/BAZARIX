/**
 * EXPOSITORES.COM — ui.js
 * Navegación (switchTab), FAB, modo oscuro, backup menu, exportar/importar, renderAll, filtros
 * Dependencias: state.js, utils.js, todos los módulos de render
 */

function switchTab(tabId) {
  // Sin bazar abierto solo existen las pantallas globales.
  if (!getActiveBazaar() && !GLOBAL_TABS.includes(tabId)) tabId = "inicio";
  document.body.dataset.tab = tabId;
  closeMobileSidebar();
  document.querySelectorAll(".page-section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));

  const section = document.getElementById(`sec-${tabId}`);
  if (section) section.classList.add("active");

  const navBtn = document.querySelector(`.nav-item[onclick="switchTab('${tabId}')"]`);
  if (navBtn) navBtn.classList.add("active");

  const titles = {
    inicio:       "Inicio",
    bazares:      "Mis Bazares",
    expositores:  "Directorio de Expositores",
    categorias:   "Catálogos",
    finanzas:     "Control de Pagos",
    costos:       "Costos del Evento",
    mapa:         "Plano Interactivo del Bazar",
    estadisticas: "Métricas y Gráficas",
    invitados:    "Lista de Expositores",
    "minuto-a-minuto": "Minuto a Minuto",
    plantillas:   "Expositores Guardados",
    "dia-evento": "Día del Evento",
    ficha:        "Panel del Bazar",
    staff:        "Staff del Evento",
    tareas:       "Tareas del Evento",
    compras:      "Lista de Compras",
    comparar:     "Comparar Bazares",
    alertas:      "Alertas"
  };
  const titleEl = document.getElementById("page-title");
  if (titleEl) titleEl.textContent = titles[tabId] || tabId;

  if (tabId === "estadisticas") updateCharts();
  if (tabId === "inicio")      renderBazaarHome();
  if (tabId === "mapa")         { bazaarCanvas.render(); renderChecklist(); }
  if (tabId === "finanzas")     { renderFinanzasTable(); renderFinanzasStats(); renderMetricasFinancieras(); }
  if (tabId === "costos")       renderCostosUI();
  if (tabId === "invitados")    renderInvitados();
  if (tabId === "minuto-a-minuto") renderMinuteByMinute();
  if (tabId === "bazares")      renderBazaresTabla();
  if (tabId === "plantillas")   renderPlantillas();
  if (tabId === "categorias")   renderCategorias();
  if (tabId === "comparar")     renderComparaBazares();
  if (tabId === "alertas")      renderAlertas();
  if (tabId === "dia-evento")   renderPanelDiaEvento();
  if (tabId === "ficha")        renderFicha();
  if (tabId === "tareas")       renderTareas();
  if (tabId === "compras")      renderCompras();
  if (tabId === "staff")        renderResponsables();
  syncTopNav();
}

const NOTE_PREVIEW_MAX_LENGTH = 10;
let noteEditorContext = null;

function notePreviewHTML(note, type, id) {
  const text = String(note || "").trim();
  const characters = Array.from(text);
  const preview = characters.length > NOTE_PREVIEW_MAX_LENGTH
    ? `${characters.slice(0, NOTE_PREVIEW_MAX_LENGTH - 1).join("").trimEnd()}…`
    : text;
  const label = preview || "＋ Nota";
  const title = text ? "Abrir y editar nota" : "Agregar nota";
  return `<button class="note-preview btn-secondary btn-sm ${text ? "" : "is-empty"}" type="button"
    onclick="openNoteEditor('${type}',${escapeHTML(JSON.stringify(String(id)))})" title="${title}">${escapeHTML(label)}</button>`;
}

// Cada tipo de nota: dónde vive la lista, qué campo guarda el texto y cómo repintar.
const NOTE_TYPES = {
  invitado:  { list: (bz) => bz.invitados || [],               field: "notas",       label: "Nota del expositor",       render: () => renderInvitados() },
  expositor: { list: (bz) => bz.expositores || [],             field: "notas",       label: "Nota del expositor",       render: () => renderExpositores() },
  actividad: { list: (bz) => bz.minuteByMinute || [],          field: "notes",       label: "Nota de la actividad",     render: () => renderMinuteByMinute() },
  compra:    { list: (bz) => bz.compras || [],                 field: "descripcion", label: "Descripción del artículo", render: () => renderCompras() },
  tarea:     { list: (bz) => bz.tareas || [],                  field: "descripcion", label: "Descripción de la tarea",  render: () => renderTareas() },
  gasto:     { list: (bz) => bz.costsConfig?.extraCosts || [], field: "comment",     label: "Comentario del gasto",     render: () => renderCostosUI() },
};

function openNoteEditor(type, id) {
  const bazaar = getActiveBazaar();
  const cfg = NOTE_TYPES[type];
  if (!bazaar || !cfg) return;
  const item = cfg.list(bazaar).find((entry) => entry.id === id);
  if (!item) {
    showToast("No se encontró el elemento asociado a esta nota.");
    return;
  }
  noteEditorContext = { type, id };
  document.getElementById("modal-nota-title").textContent = cfg.label;
  document.getElementById("note-editor-content").value = item[cfg.field] ?? "";
  openModal("modal-nota");
  setTimeout(() => document.getElementById("note-editor-content").focus(), 0);
}

function saveNoteHandler(event) {
  event.preventDefault();
  if (!noteEditorContext) return;
  const bazaar = getActiveBazaar();
  const cfg = NOTE_TYPES[noteEditorContext.type];
  if (!bazaar || !cfg) return;
  const item = cfg.list(bazaar).find((entry) => entry.id === noteEditorContext.id);
  if (!item) {
    showToast("No se pudo guardar: ya no existe el elemento asociado.");
    closeModal("modal-nota");
    noteEditorContext = null;
    return;
  }
  item[cfg.field] = document.getElementById("note-editor-content").value.trim();
  // Una compra enviada a Costos del Evento comparte su descripción como comentario del gasto.
  if (noteEditorContext.type === "compra" && item.presupuestoId) {
    const gasto = bazaar.costsConfig.extraCosts.find((g) => g.id === item.presupuestoId);
    if (gasto) gasto.comment = item.descripcion;
  }
  saveState();
  cfg.render();
  if (noteEditorContext.type === "compra") renderCostosUI();
  closeModal("modal-nota");
  noteEditorContext = null;
  showToast("✅ Nota guardada");
}

// Barra superior: marca el grupo con la página activa y cierra menús abiertos.
function syncTopNav() {
  document.querySelectorAll(".nav-group").forEach((g) => {
    g.classList.toggle("has-active", !!g.querySelector(".nav-item.active"));
  });
  closeNavGroups();
}

function closeNavGroups() {
  document.querySelectorAll(".nav-group.open").forEach((g) => g.classList.remove("open"));
  document.querySelectorAll(".nav-group-label[aria-expanded='true']").forEach((label) => {
    label.setAttribute("aria-expanded", "false");
  });
}

function toggleNavGroup(group) {
  const wasOpen = group.classList.contains("open");
  closeNavGroups();
  if (!wasOpen) {
    group.classList.add("open");
    group.querySelector(".nav-group-label")?.setAttribute("aria-expanded", "true");
  }
}

function closeMobileSidebar() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.getElementById("sidebar-overlay")?.classList.remove("open");
  document.body.classList.remove("sidebar-open");
}

function toggleMobileSidebar() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebar-overlay");
  if (!sidebar || !overlay) return;
  const isOpen = sidebar.classList.toggle("open");
  overlay.classList.toggle("open", isOpen);
  overlay.setAttribute("aria-hidden", String(!isOpen));
  document.body.classList.toggle("sidebar-open", isOpen);
}

function renderComparaBazares() {
  const activeBazaar = getActiveBazaar();
  const selector = document.getElementById("compara-select-bazar");
  const content = document.getElementById("compara-bazares-content");
  if (content && !activeBazaar) {
    content.innerHTML = `<div class="chart-card compare-empty"><p>Crea un bazar para poder compararlo con otro.</p></div>`;
    return;
  }
  if (!activeBazaar || !selector || !content) return;

  const otherBazaars = getBazaarsNewestFirst().filter((bazaar) => bazaar.id !== activeBazaar.id);
  const previousSelection = selector.value;
  selector.innerHTML = otherBazaars.length
    ? otherBazaars.map((bazaar) => `<option value="${bazaar.id}">${escapeHTML(bazaar.name)}</option>`).join("")
    : `<option value="">No hay otro bazar</option>`;
  if (otherBazaars.some((bazaar) => bazaar.id === previousSelection)) selector.value = previousSelection;

  const comparedBazaar = otherBazaars.find((bazaar) => bazaar.id === selector.value);
  if (!comparedBazaar) {
    content.innerHTML = `<div class="chart-card compare-empty"><p>Crea otro bazar para poder compararlo con el bazar activo.</p></div>`;
    return;
  }

  const metrics = [
    ["Expositores", activeBazaar.expositores.length, comparedBazaar.expositores.length],
    ["Pagos completados", activeBazaar.expositores.filter((item) => item.pagado).length, comparedBazaar.expositores.filter((item) => item.pagado).length],
    ["Invitados", (activeBazaar.invitados || []).length, (comparedBazaar.invitados || []).length],
    ["Mesas", getActiveTables(activeBazaar).length, getActiveTables(comparedBazaar).length]
  ];
  content.innerHTML = `
    <div class="compare-grid">
      <div class="compare-column compare-column-active">
        <span class="compare-label">Bazar activo</span>
        <h3>${escapeHTML(activeBazaar.name)}</h3>
      </div>
      <div class="compare-column">
        <span class="compare-label">Bazar comparado</span>
        <h3>${escapeHTML(comparedBazaar.name)}</h3>
      </div>
    </div>
    <div class="compare-metrics">
      ${metrics.map(([label, activeValue, comparedValue]) => `
        <div class="compare-metric">
          <span>${label}</span>
          <strong>${activeValue}</strong>
          <span class="compare-divider">vs</span>
          <strong>${comparedValue}</strong>
        </div>`).join("")}
    </div>`;
}

// Botón flotante de redes y formularios (🔗). El "+" flotante se eliminó: cada pantalla
// tiene su propio botón de agregar, y tener dos para lo mismo confundía.
function toggleSocialFabMenu() {
  const menu = document.getElementById("fab-social-menu");
  if (!menu) return;
  const isOpen = menu.classList.toggle("open");
  menu.setAttribute("aria-hidden", String(!isOpen));
}

// ==========================================
// 5. MODO OSCURO Y MENÚ DE RESPALDO
// ==========================================
// Tema de la interfaz: modo claro/oscuro + 8 colores de acento. Se recuerda en este navegador y se
// aplica al abrir (el <head> de index.html restaura el color antes de pintar).
const THEME_COLORS = [
  { hex: "#0d9488", nombre: "Verde azulado" }, { hex: "#3b82f6", nombre: "Azul" },
  { hex: "#6366f1", nombre: "Índigo" },        { hex: "#8b5cf6", nombre: "Violeta" },
  { hex: "#ec4899", nombre: "Rosa" },          { hex: "#ef4444", nombre: "Rojo" },
  { hex: "#ea580c", nombre: "Naranja" },       { hex: "#16a34a", nombre: "Verde" }
];
const THEME_ACCENT_KEY = "BAZARIX_THEME_ACCENT";
const THEME_MODE_KEY = "BAZARIX_THEME_MODE";

/** Color de acento vigente (lo usan el plano y las gráficas, que dibujan en canvas). */
function getAccentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-accent").trim() || "#0d9488";
}

function _refreshThemeDependents() {
  if (typeof bazaarCanvas !== "undefined" && bazaarCanvas.ctx) bazaarCanvas.render();
  if (document.getElementById("sec-estadisticas")?.classList.contains("active") && typeof updateCharts === "function") updateCharts();
}

function setThemeColor(hex) {
  const color = THEME_COLORS.find((item) => item.hex.toLowerCase() === String(hex).toLowerCase());
  if (!color) return;
  const root = document.documentElement.style;
  root.setProperty("--color-accent", color.hex);
  root.setProperty("--accent-rgb", [1, 3, 5].map((i) => parseInt(color.hex.slice(i, i + 2), 16)).join(","));
  try { localStorage.setItem(THEME_ACCENT_KEY, color.hex); } catch {}
  _refreshThemeDependents();
  renderSettingsMenu();
}

function setThemeMode(mode) {
  document.body.classList.toggle("dark", mode !== "light");
  try { localStorage.setItem(THEME_MODE_KEY, mode === "light" ? "light" : "dark"); } catch {}
  _refreshThemeDependents();
  renderSettingsMenu();
}

function toggleDarkMode() {
  setThemeMode(document.body.classList.contains("dark") ? "light" : "dark");
}

function toggleSettingsMenu() {
  const menu = document.getElementById("settings-menu");
  if (!menu) return;
  const open = menu.classList.toggle("open");
  document.getElementById("btn-settings")?.setAttribute("aria-expanded", String(open));
  if (open) {
    document.getElementById("backup-menu")?.classList.remove("open");
    renderSettingsMenu();
  }
}

function renderSettingsMenu() {
  const menu = document.getElementById("settings-menu");
  if (!menu) return;
  const dark = document.body.classList.contains("dark");
  const accent = getAccentColor().toLowerCase();
  const bz = getActiveBazaar();
  const swatches = (selected, handler) => THEME_COLORS.map((c) =>
    `<button type="button" class="color-swatch ${selected === c.hex ? "is-selected" : ""}" style="background:${c.hex}"
      onclick="${handler}('${c.hex}')" aria-label="${c.nombre}" aria-pressed="${selected === c.hex}" title="${c.nombre}"></button>`).join("");
  menu.innerHTML = `
    <div class="settings-title">⚙️ Personalizar</div>
    <div class="settings-section">
      <div class="settings-label">Modo</div>
      <div class="segmented settings-mode" role="group" aria-label="Modo claro u oscuro">
        <button type="button" class="${dark ? "" : "active"}" aria-pressed="${!dark}" onclick="setThemeMode('light')">☀️ Claro</button>
        <button type="button" class="${dark ? "active" : ""}" aria-pressed="${dark}" onclick="setThemeMode('dark')">🌙 Oscuro</button>
      </div>
      <div class="settings-label">Color de la interfaz</div>
      <div class="color-palette">${swatches(accent, "setThemeColor")}</div>
    </div>
    ${bz ? `
    <div class="settings-section">
      <div class="settings-label">Bazar activo · ${escapeHTML(bz.name)}</div>
      <div class="color-palette">${swatches(String(bz.color || "").toLowerCase(), "setActiveBazaarColor")}</div>
      <div class="settings-actions">
        <button type="button" class="btn-secondary btn-sm" onclick="setActiveBazaarColor('')">Sin color</button>
        <button type="button" class="btn-secondary btn-sm" onclick="openBazaarColorModal('${bz.id}');toggleSettingsMenu()">Más colores…</button>
      </div>
      <p class="form-hint">Es la barra que marca a este bazar como activo en Mis Bazares e Inicio.</p>
    </div>` : ""}`;
}

function toggleBackupMenu() {
  document.getElementById("backup-menu")?.classList.toggle("open");
}

// ==========================================
// 6. EXPORTAR / IMPORTAR DATOS
// ==========================================
function exportarJSON() {
  const data = JSON.stringify(AppState, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bazarix_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  showToast("✅ JSON descargado correctamente");
}

function exportarJSONCompleto() {
  const backup = {
    app: "BAZARIX",
    version: 3,
    exportedAt: new Date().toISOString(),
    data: AppState
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bazarix_respaldo_completo_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  showToast("✅ Respaldo completo descargado");
}

function exportarCSV() {
  const bz = getActiveBazaar();
  if (!bz) return;
  const multi = bazarEsMultiDia(bz);
  const headers = ["Nombre", "Negocio", "Categoría", "Características", ...(multi ? ["Días de participación"] : []), "Teléfono", "Email",
                   "Ubicación", "Mesas Solicitadas", "Área Encargada", "Costo Total", "Adelanto", "Saldo", "Fecha Límite", "Estado", "Notas"];
  const rows = bz.expositores.map((e) => [
    e.nombre, e.negocio, getExpositorCategoryLabel(e),
    getExpositorCaracteristicas(e).map((c) => c.nombre).join(", "),
    ...(multi ? [getExpositorDiasLabel(e, bz)] : []),
    e.tel, e.email, getExpositorLocation(e, bz),
    e.mesaTipo === "media" ? "Media mesa" : (e.mesasCantidad === "otro" ? e.mesasCantidadOtro : e.mesasCantidad || 1),
    e.areaEncargada || "",
    e.costo, e.adelanto || 0,
    (e.costo - (e.adelanto || 0)),
    e.fechaLimitePago || "",
    e.pagado ? "Pagado" : "Pendiente",
    e.notas
  ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`));

  const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `expositores_${bz.name}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast("✅ CSV descargado correctamente");
}

// La lectura y aplicación de datos vive en backup.js (secciones + Combinar/Reemplazar).
function handleImportJSON(e) {
  const input = e.target;
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      backupPrepararImportacion(JSON.parse(evt.target.result));
    } catch {
      showToast("❌ Archivo JSON inválido", "error");
    } finally {
      input.value = ""; // permite volver a elegir el mismo archivo
    }
  };
  reader.readAsText(file);
}

// ==========================================
// 7. GESTIÓN DE BAZARES
// [EDITABLE: aquí vive toda la lógica de crear/cambiar/eliminar bazares]
// ==========================================
