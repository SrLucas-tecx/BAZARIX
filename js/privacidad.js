/**
 * BAZARIX — privacidad.js (Sprint 6)
 * Aviso de privacidad del modo Equipo: se muestra una vez por dispositivo y se puede reabrir desde el pie de página.
 * Dependencias: storage.js (StorageAdapter), modales.js (openModal/closeModal)
 */
const PRIVACY_KEY = "BAZARIX_PRIVACY_OK";

function privacyAccepted() {
  try { return localStorage.getItem(PRIVACY_KEY) === "1"; } catch { return false; }
}
function openPrivacidad() { openModal("modal-privacidad"); }
function acceptPrivacidad() {
  try { localStorage.setItem(PRIVACY_KEY, "1"); } catch { /* sin espacio: se volverá a mostrar */ }
  closeModal("modal-privacidad");
}
/** Solo en modo Equipo (ahí los datos viajan a la hoja de Google del grupo) y solo si aún no se aceptó. */
function maybeShowPrivacidad() {
  if (StorageAdapter.mode() === "team" && !privacyAccepted()) openPrivacidad();
}
if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("load", () => setTimeout(maybeShowPrivacidad, 600));
}
if (typeof module !== "undefined") module.exports = { privacyAccepted, maybeShowPrivacidad };
