/**
 * BAZARIX — dialogs.js
 * Shared, accessible replacements for browser alert, confirm, and prompt dialogs.
 */

let appDialogResolver = null;
let appDialogKind = "alert";
let appDialogReturnFocus = null;

function showAppDialog(kind, { title, message, defaultValue = "", confirmLabel = "Aceptar" }) {
  if (appDialogResolver) {
    const previousValue = appDialogKind === "prompt" ? null : appDialogKind === "confirm" ? false : undefined;
    appDialogResolver(previousValue);
    appDialogResolver = null;
  }

  const overlay = document.getElementById("modal-app-dialog");
  const form = document.getElementById("app-dialog-form");
  const inputGroup = document.getElementById("app-dialog-input-group");
  const input = document.getElementById("app-dialog-input");
  const cancel = document.getElementById("app-dialog-cancel");
  if (!overlay || !form || !inputGroup || !input || !cancel) {
    return Promise.reject(new Error("No se encontró el modal de diálogo de la aplicación."));
  }

  appDialogKind = kind;
  appDialogReturnFocus = document.activeElement;
  document.getElementById("app-dialog-title").textContent = title;
  document.getElementById("app-dialog-message").textContent = message;
  document.getElementById("app-dialog-confirm").textContent = confirmLabel;
  inputGroup.style.display = kind === "prompt" ? "" : "none";
  cancel.style.display = kind === "alert" ? "none" : "";
  input.value = defaultValue;
  overlay.setAttribute("aria-hidden", "false");

  const result = new Promise((resolve) => { appDialogResolver = resolve; });
  openModal("modal-app-dialog");
  requestAnimationFrame(() => {
    if (kind === "prompt") input.focus();
    else document.getElementById("app-dialog-confirm").focus();
  });
  return result;
}

function appAlert(message, title = "Aviso") {
  return showAppDialog("alert", { title, message });
}

function appConfirm(message, title = "Confirmar", confirmLabel = "Continuar") {
  return showAppDialog("confirm", { title, message, confirmLabel });
}

function appPrompt(message, defaultValue = "", title = "Escribe un nombre") {
  return showAppDialog("prompt", { title, message, defaultValue });
}

function finishAppDialog(value) {
  const resolve = appDialogResolver;
  appDialogResolver = null;
  document.getElementById("modal-app-dialog")?.setAttribute("aria-hidden", "true");
  closeModal("modal-app-dialog");
  if (appDialogReturnFocus instanceof HTMLElement) appDialogReturnFocus.focus();
  appDialogReturnFocus = null;
  if (resolve) resolve(value);
}

function submitAppDialog(event) {
  event.preventDefault();
  if (appDialogKind === "prompt") {
    finishAppDialog(document.getElementById("app-dialog-input").value);
  } else {
    finishAppDialog(appDialogKind === "confirm");
  }
}

function cancelAppDialog() {
  finishAppDialog(appDialogKind === "prompt" ? null : false);
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.getElementById("modal-app-dialog")?.classList.contains("open")) {
    cancelAppDialog();
  }
});
