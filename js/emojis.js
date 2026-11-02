const AVAILABLE_EMOJIS = [
  "😀", "😃", "😄", "😁", "😆", "🥹", "😂", "🤣",
  "😊", "😍", "🥰", "😘", "😎", "🤩", "🥳", "😇",
  "🙌", "👏", "👍", "👎", "👌", "🤝", "🙏", "💪",
  "❤️", "💛", "💚", "💙", "💜", "✨", "⭐", "🔥",
  "🎉", "🎊", "🎈", "🎁", "🛍️", "🛒", "🏪", "📍",
  "✅", "❌", "⚠️", "💰", "📅", "⏰", "🍰", "☕"
];

document.addEventListener("DOMContentLoaded", () => {
  const picker = document.getElementById("emoji-picker");
  const grid = document.getElementById("emoji-picker-grid");
  const hint = document.getElementById("emoji-picker-hint");
  const closeButton = document.getElementById("emoji-picker-close");
  const fieldButtons = document.querySelectorAll(".emoji-field-button");
  if (!picker || !grid || !hint || !closeButton || !fieldButtons.length) return;

  let activeField = null;
  let activeButton = null;

  const closePicker = (restoreFocus = false) => {
    picker.hidden = true;
    if (activeButton) activeButton.setAttribute("aria-expanded", "false");
    if (restoreFocus && activeButton?.isConnected) activeButton.focus();
    activeField = null;
    activeButton = null;
  };

  const insertEmoji = (emoji) => {
    if (!(activeField instanceof HTMLInputElement) || !activeField.isConnected
        || activeField.disabled || activeField.readOnly) {
      hint.textContent = "Selecciona un campo de emoji válido.";
      return;
    }

    activeField.value = emoji;
    activeField.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      inputType: "insertText",
      data: emoji
    }));
    activeField.dispatchEvent(new Event("change", { bubbles: true }));
    activeField.focus();
    closePicker();
  };

  AVAILABLE_EMOJIS.forEach((emoji) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "emoji-picker-item";
    button.textContent = emoji;
    button.setAttribute("aria-label", emoji);
    button.title = emoji;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => insertEmoji(emoji));
    grid.append(button);
  });

  fieldButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const field = document.getElementById(button.dataset.emojiTarget);
      if (!(field instanceof HTMLInputElement)) return;

      if (!picker.hidden && activeButton === button) {
        closePicker();
        return;
      }

      if (activeButton) activeButton.setAttribute("aria-expanded", "false");
      activeField = field;
      activeButton = button;
      button.setAttribute("aria-expanded", "true");
      hint.textContent = "Selecciona un emoji para agregarlo al campo.";
      picker.hidden = false;
      grid.querySelector("button")?.focus();
    });
  });

  closeButton.addEventListener("click", () => closePicker(true));

  document.addEventListener("click", (event) => {
    if (!picker.hidden && !picker.contains(event.target)
        && !Array.from(fieldButtons).some((button) => button.contains(event.target))) {
      closePicker();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !picker.hidden) closePicker(true);
  });
});
