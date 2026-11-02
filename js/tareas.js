/**
 * BAZARIX — tareas.js
 * Tareas del evento por fase (equivale a las hojas "Previo" y "Post" de la plantilla).
 * La fase "Durante" es la sección Minuto a Minuto.
 * Datos: bz.tareas = [{ id, fase: "previo"|"post", actividad, descripcion, responsableId, fecha, avance, hecho }]
 * responsableId referencia bz.responsables (ver responsables.js).
 * Dependencias: state.js, utils.js
 */

const TAREAS_FASES = {
  previo: { label: "Previo", title: "Antes del evento" },
  post:   { label: "Post",   title: "Después del evento" },
};

function tareasDeFase(bz, fase) {
  ensureEventoFields(bz);
  return bz.tareas.filter((t) => t.fase === fase);
}

function tareasStats(bz, fase) {
  const list = tareasDeFase(bz, fase);
  return { total: list.length, hechas: list.filter((t) => t.hecho).length };
}

function _tareaVencida(t) {
  if (t.hecho || !t.fecha) return false;
  const d = diasParaEvento(t.fecha); // reutiliza el cálculo de días respecto a hoy
  return d !== null && d < 0;
}

function setTareasFase(fase) {
  if (!TAREAS_FASES[fase]) return;
  AppState.tareasFase = fase;
  saveState();
  renderTareas();
}

function renderTareas() {
  const body = document.getElementById("tareas-list");
  const bz = getActiveBazaar();
  if (!body || !bz) return;
  updateAlertBadge(); // una fecha de entrega puede haber cambiado
  const fase = TAREAS_FASES[AppState.tareasFase] ? AppState.tareasFase : "previo";

  Object.keys(TAREAS_FASES).forEach((key) => {
    const btn = document.getElementById(`tareas-tab-${key}`);
    if (!btn) return;
    const s = tareasStats(bz, key);
    btn.classList.toggle("active", key === fase);
    btn.textContent = `${TAREAS_FASES[key].label} (${s.hechas}/${s.total})`;
  });

  const list = tareasDeFase(bz, fase);
  const stats = tareasStats(bz, fase);
  const pct = stats.total ? Math.round((stats.hechas / stats.total) * 100) : 0;
  const progress = document.getElementById("tareas-progreso");
  if (progress) {
    progress.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:var(--fs-xs);font-weight:700;margin-bottom:4px;">
        <span>${TAREAS_FASES[fase].title}</span><span>${stats.hechas} / ${stats.total} · ${pct}%</span>
      </div>
      <div style="height:8px;background:var(--color-border);border-radius:999px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:var(--color-accent);transition:width .3s;"></div>
      </div>`;
  }

  const showAvance = fase === "previo"; // "Avances" solo existe en la fase Previo (igual que la plantilla)
  const head = document.getElementById("tareas-avance-th");
  if (head) head.style.display = showAvance ? "" : "none";

  if (!list.length) {
    body.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--color-text-muted);padding:24px;">Sin tareas. Agrega la primera con "+ Agregar tarea".</td></tr>`;
    return;
  }

  body.innerHTML = list.map((t, index) => `
    <tr>
      <td><input type="checkbox" ${t.hecho ? "checked" : ""} onchange="toggleTarea('${t.id}')" aria-label="Tarea lista" style="accent-color:var(--color-accent);width:18px;height:18px;"></td>
      <td>${index + 1}</td>
      <td><input class="form-input" value="${escapeHTML(t.actividad)}" placeholder="Ej. Apartar auditorio" style="${t.hecho ? "text-decoration:line-through;opacity:.7;" : ""}" oninput="debouncedUpdateTarea('${t.id}','actividad',this.value)"></td>
      <td>${notePreviewHTML(t.descripcion, "tarea", t.id)}</td>
      <td>${responsableCellHTML("tarea", t, bz)}</td>
      <td>
        <input class="form-input" type="date" value="${escapeHTML(t.fecha)}" onchange="updateTarea('${t.id}','fecha',this.value)">
        ${_tareaVencida(t) ? `<div style="font-size:var(--fs-xs);font-weight:800;color:var(--color-danger);margin-top:2px;">⚠️ Vencida</div>` : ""}
      </td>
      ${showAvance ? `<td><input class="form-input" value="${escapeHTML(t.avance)}" placeholder="Estado / avances" oninput="debouncedUpdateTarea('${t.id}','avance',this.value)"></td>` : ""}
      <td><button class="btn-danger btn-sm" onclick="deleteTarea('${t.id}')" title="Eliminar">🗑️</button></td>
    </tr>`).join("");
}

// Alta en ventana emergente (la edición posterior sigue siendo en la propia fila).
function addTarea() {
  const bz = getActiveBazaar();
  if (!bz) return;
  ensureEventoFields(bz);
  document.getElementById("form-tarea").reset();
  document.getElementById("tarea-fase").value = TAREAS_FASES[AppState.tareasFase] ? AppState.tareasFase : "previo";
  fillModalResponsable("tarea", bz);
  toggleTareaAvance();
  openModal("modal-tarea");
  setTimeout(() => document.getElementById("tarea-actividad")?.focus(), 50);
}

// "Avances" solo existe en la fase Previo.
function toggleTareaAvance() {
  const group = document.getElementById("tarea-avance-group");
  if (group) group.style.display = document.getElementById("tarea-fase").value === "previo" ? "" : "none";
}

function saveTareaHandler(e) {
  e.preventDefault();
  const bz = getActiveBazaar();
  if (!bz) return;
  const fase = document.getElementById("tarea-fase").value === "post" ? "post" : "previo";
  bz.tareas.push({
    id: `tarea-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    fase,
    actividad: document.getElementById("tarea-actividad").value.trim(),
    descripcion: document.getElementById("tarea-descripcion").value.trim(),
    ...readModalResponsable("tarea"),
    fecha: document.getElementById("tarea-fecha").value,
    avance: fase === "previo" ? document.getElementById("tarea-avance").value.trim() : "",
    hecho: false
  });
  AppState.tareasFase = fase;   // se muestra la fase donde quedó la tarea
  saveState();
  closeModal("modal-tarea");
  renderTareas();
  renderFichaResumen(bz);
  showToast("✅ Tarea agregada");
}

function updateTarea(id, field, value) {
  const bz = getActiveBazaar();
  const tarea = bz?.tareas.find((t) => t.id === id);
  if (!tarea || !["actividad", "descripcion", "responsableId", "fecha", "avance"].includes(field)) return;
  tarea[field] = value;
  saveState();
  if (field === "fecha") renderTareas(); // para mostrar/ocultar "Vencida"
}

// Autoguardado mientras se escribe, sin esperar a perder el foco.
const debouncedUpdateTarea = debounce(updateTarea, 500);

function toggleTarea(id) {
  const bz = getActiveBazaar();
  const tarea = bz?.tareas.find((t) => t.id === id);
  if (!tarea) return;
  tarea.hecho = !tarea.hecho;
  saveState();
  renderTareas();
  renderFichaResumen(bz);
}

async function deleteTarea(id) {
  const bz = getActiveBazaar();
  if (!bz || !await appConfirm("¿Eliminar esta tarea?", "Eliminar tarea")) return;
  bz.tareas = bz.tareas.filter((t) => t.id !== id);
  saveState();
  renderTareas();
  renderFichaResumen(bz);
}
