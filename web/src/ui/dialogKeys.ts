/**
 * Keyboard basics for a modal dialog: move focus into it, keep Tab inside it,
 * and treat Escape as the cancel choice (for the consent dialog: Do not send).
 * The consent dialog starts on Do not send, so a stray Enter keeps the email on the device.
 */
export function wireModalKeys(overlay: HTMLElement, onCancel: () => void, initialFocus?: string): void {
  const focusables = () =>
    [...overlay.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]")].filter(
      (el) => !el.hasAttribute("disabled") && el.getAttribute("tabindex") !== "-1",
    );
  const start = initialFocus ? overlay.querySelector<HTMLElement>(initialFocus) : null;
  (start ?? focusables()[0])?.focus();
  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = overlay.ownerDocument.activeElement;
    if (event.shiftKey && (active === first || !overlay.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !overlay.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  });
}
