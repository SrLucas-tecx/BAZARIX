/**
 * BAZARIX — historial.js
 * Sprint 3: Historial de cambios por expositor
 * Registra pagos, publicación, baneo, asistencia, checklist y ediciones.
 * Se guarda en exp.historial = [{ id, ts, texto }] (más reciente primero).
 * Dependencias: state.js, utils.js
 */

const HISTORIAL_MAX_ENTRIES = 200;

/**
 * Agrega una entrada al historial de un expositor.
 * NO llama a saveState(): quien la invoca ya guarda después de su cambio.
 */
function registrarHistorial(expId, texto, bz = getActiveBazaar()) {
  const exp = bz?.expositores?.find((item) => item.id === expId);
  if (!exp || !texto) return;
  if (!Array.isArray(exp.historial)) exp.historial = [];
  exp.historial.unshift({
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ts: new Date().toISOString(),
    texto: String(texto)
  });
  if (exp.historial.length > HISTORIAL_MAX_ENTRIES) exp.historial.length = HISTORIAL_MAX_ENTRIES;

  // Si el modal de este expositor está abierto, se refresca en vivo.
  const openId = document.getElementById("historial-exp-id")?.value;
  const modalOpen = document.getElementById("modal-historial")?.classList.contains("open");
  if (modalOpen && openId === expId) renderHistorial(expId);
}

/** Compara dos versiones de un expositor y devuelve una lista de cambios legibles. */
function describeExpositorChanges(before, after) {
  const changes = [];

  [
    ["negocio", "Negocio"],
    ["nombre", "Titular"],
    ["ubicacion", "Ubicación"],
    ["areaEncargada", "Área encargada"],
    ["mesasCantidad", "Mesas solicitadas"],
    ["sillasPorMesa", "Sillas por mesa"],
    ["sillasCantidad", "Sillas asignadas"],
    ["sillasExtraCantidad", "Sillas extra"],
    ["fechaLimitePago", "Fecha límite de pago"],
    ["mesaTipo", "Tipo de espacio"]
  ].forEach(([key, label]) => {
    const a = String(before[key] ?? "");
    const b = String(after[key] ?? "");
    if (a !== b) changes.push(`${label}: ${a || "—"} → ${b || "—"}`);
  });

  [["costoBase", "Costo base"], ["costoSillaExtra", "Costo por silla extra"],
    ["costoExtraSillas", "Cargo por sillas extra"], ["costo", "Costo final"], ["adelanto", "Adelanto"]].forEach(([key, label]) => {
    if (Number(before[key] || 0) !== Number(after[key] || 0)) {
      changes.push(`${label}: ${formatCurrency(before[key])} → ${formatCurrency(after[key])}`);
    }
  });

  if (before.categoria !== after.categoria) {
    const catName = (id) => AppState.categorias.find((c) => c.id === id)?.nombre || "Sin categoría";
    changes.push(`Categoría: ${catName(before.categoria)} → ${catName(after.categoria)}`);
  }
  const caracteristicasKey = (item) => [...(item.caracteristicas || [])].sort().join(",");
  if (caracteristicasKey(before) !== caracteristicasKey(after)) {
    const nombres = (item) => (item.caracteristicas || [])
      .map((id) => AppState.caracteristicas.find((c) => c.id === id)?.nombre).filter(Boolean).join(", ") || "ninguna";
    changes.push(`Características: ${nombres(before)} → ${nombres(after)}`);
  }

  const diasKey = (item) => [...(item.diasParticipacion || [])].sort().join(",");
  if (diasKey(before) !== diasKey(after)) {
    const bz = getActiveBazaar();
    const nombres = (item) => (item.diasParticipacion || [])
      .map((id) => { const i = (bz?.evento?.dias || []).findIndex((d) => d.id === id); return i < 0 ? null : getDiaLabel(bz.evento.dias[i], i); })
      .filter(Boolean).join(", ") || "todos";
    changes.push(`Días de participación: ${nombres(before)} → ${nombres(after)}`);
  }

  if (Boolean(before.pagado) !== Boolean(after.pagado)) {
    changes.push(`Pago: ${after.pagado ? "marcado como pagado" : "marcado como pendiente"}`);
  }

  return changes;
}

function openHistorial(expId) {
  const exp = getActiveBazaar()?.expositores.find((item) => item.id === expId);
  if (!exp) return;
  document.getElementById("historial-exp-id").value = expId;
  const title = document.getElementById("historial-modal-title");
  if (title) title.textContent = `Historial — ${exp.negocio}`;
  renderHistorial(expId);
  openModal("modal-historial");
}

function renderHistorial(expId) {
  const container = document.getElementById("historial-list");
  if (!container) return;
  const exp = getActiveBazaar()?.expositores.find((item) => item.id === expId);
  const entries = exp?.historial || [];

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="catalog-empty" style="padding:var(--space-6);">
        <span class="catalog-empty-icon">🕘</span>
        <h3>Sin movimientos</h3>
        <p>Aquí aparecerán pagos, cambios de estado y asistencia de este expositor.</p>
      </div>`;
    return;
  }

  container.innerHTML = entries.map((entry) => {
    const date = new Date(entry.ts);
    const when = Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
    return `
      <div class="card-meta-item" style="border-left:3px solid var(--color-accent);margin-bottom:8px;padding:8px 12px;">
        <div style="font-size:var(--fs-xs);color:var(--color-text-muted);font-weight:700;">${escapeHTML(when)}</div>
        <div style="font-size:var(--fs-sm);">${escapeHTML(entry.texto)}</div>
      </div>`;
  }).join("");
}

async function clearHistorial(expId) {
  if (!expId) return;
  const exp = getActiveBazaar()?.expositores.find((item) => item.id === expId);
  if (!exp) return;
  if (!(exp.historial || []).length) {
    showToast("El historial ya está vacío");
    return;
  }
  if (!await appConfirm(`¿Limpiar el historial de "${exp.negocio}"?`, "Limpiar historial", "Limpiar")) return;
  exp.historial = [];
  saveState();
  renderHistorial(expId);
  showToast("🗑️ Historial limpiado");
}
