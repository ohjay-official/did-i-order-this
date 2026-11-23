import { wireModalKeys } from "./dialogKeys.ts";

/**
 * The one cloud consent dialog. The sample inbox renders it inside its own
 * view; the home page mounts the same markup (same classes, same words) with
 * askCloudConsentOnPage(). Focus starts on Do not send, and Escape means Do not send.
 */
export const CONSENT_DIALOG_HTML = `
      <div class="consent-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <div class="consent-card">
          <h2 id="consent-title">Check this email in the cloud?</h2>
          <p>No on-device AI is available. Checking in the cloud would send this email off the device.</p>
          <p>The cloud uses Google's free Gemini tier, so Google may keep this text and people at Google may review it.</p>
          <div class="actions">
            <button type="button" class="btn btn-primary" data-action="consent-yes">Check in the cloud</button>
            <button type="button" class="btn btn-secondary" data-action="consent-no">Do not send</button>
          </div>
        </div>
      </div>
    `;

let open: Promise<boolean> | null = null;

/** Shows the consent dialog over the page and resolves true only for Check in the cloud. */
export function askCloudConsentOnPage(doc: Document = document): Promise<boolean> {
  if (open) return open;
  const host = doc.createElement("div");
  host.setAttribute("data-consent-host", "");
  host.innerHTML = CONSENT_DIALOG_HTML;
  doc.body.append(host);
  const previous = doc.activeElement as HTMLElement | null;
  open = new Promise<boolean>((resolve) => {
    const finish = (value: boolean) => {
      host.remove();
      open = null;
      previous?.focus?.();
      resolve(value);
    };
    host.querySelector("[data-action=consent-yes]")?.addEventListener("click", () => finish(true));
    host.querySelector("[data-action=consent-no]")?.addEventListener("click", () => finish(false));
    const overlay = host.querySelector<HTMLElement>(".consent-overlay");
    if (overlay) wireModalKeys(overlay, () => finish(false), "[data-action=consent-no]");
  });
  return open;
}

export function isConsentDialogOpen(): boolean {
  return open !== null;
}
