// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { wireModalKeys } from "./dialogKeys.ts";

function setup(initialFocus?: string) {
  document.body.innerHTML = `<div class="consent-overlay" role="dialog"><button id="yes">Check in the cloud</button><button id="no">Do not send</button></div>`;
  const overlay = document.querySelector<HTMLElement>(".consent-overlay")!;
  const onCancel = vi.fn();
  wireModalKeys(overlay, onCancel, initialFocus);
  return { overlay, onCancel };
}

describe("wireModalKeys", () => {
  it("moves focus to the first button", () => {
    setup();
    expect(document.activeElement?.id).toBe("yes");
  });

  it("can start on the safe choice", () => {
    setup("#no");
    expect(document.activeElement?.id).toBe("no");
  });

  it("treats Escape as cancel", () => {
    const { overlay, onCancel } = setup();
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("keeps Tab inside the dialog", () => {
    const { overlay } = setup();
    document.getElementById("no")!.focus();
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(document.activeElement?.id).toBe("yes");
    overlay.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    expect(document.activeElement?.id).toBe("no");
  });
});
