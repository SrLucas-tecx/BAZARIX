/**
 * EXPOSITORES.COM — utils.js
 * Helpers puros: escapeHTML, formatCurrency, showToast, _darkenHex
 * Dependencias: state.js (solo showToast usa el DOM)
 */

// 3. UTILIDADES GENERALES
// ==========================================
function escapeHTML(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCurrency(val) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(val) || 0);
}

function showToast(message, type = "success") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = message;
  t.style.background = type === "error" ? "#8f2028" : "#12383c";
  t.style.color = "#f4fffe";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
}

// Retrasa la ejecución hasta que pasen `wait` ms sin nuevas llamadas.
// Se usa para autoguardar mientras el usuario escribe, sin disparar
// una escritura a localStorage en cada tecla.
function debounce(fn, wait = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// Indicador "Guardado" en el header. saveState() lo llama cada vez que
// persiste algo, para que el usuario nunca tenga que adivinar (o
// recargar la página) si un cambio ya quedó guardado.
let _saveIndicatorTimer = null;
function showSaveIndicator() {
  const el = document.getElementById("save-indicator");
  if (!el) return;
  el.textContent = "✓ Guardado";
  el.classList.add("show");
  clearTimeout(_saveIndicatorTimer);
  _saveIndicatorTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

// ==========================================
// 4. NAVEGACIÓN / TABS
// [EDITABLE: para agregar un tab nuevo, agrega su ID aquí y el botón .nav-item en index.html]
// ==========================================
