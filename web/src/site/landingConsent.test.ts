// @vitest-environment jsdom
/**
 * Regression tests for the 23 Nov 2026 audit, M4 / claims F1 and F2: the home
 * page's Allow cloud path asks with the same consent dialog as /app/ before any
 * cloud read, sends nothing on Do not send, and shows why a cloud check failed.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ modes: [] as string[], cloudError: null as Error | null }));
vi.mock("../ai/readClaim.ts", () => ({
  readClaim: async (_text: string, mode: string) => {
    state.modes.push(mode);
    if (mode === "only_on_device") throw new Error("no on-device model");
    if (state.cloudError) throw state.cloudError;
    return {
      claim: {
        claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
        asked_action: "pay",
        cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
        email_kind: "carrier_update",
      },
      inferenceSource: "in_cloud",
    };
  },
}));
vi.mock("../firebase/app.ts", () => ({ isFirebaseConfigured: () => true, isCloudAiAvailable: () => true }));

const { runChecker } = await import("./landing.ts");
const { askCloudConsentOnPage, isConsentDialogOpen } = await import("../ui/consentDialog.ts");
const { formatEmailText, sampleThreads } = await import("../demo/seed.ts");
const { appCheckGate } = await import("../ai/appCheckGate.ts");

const DHL = formatEmailText(sampleThreads[0]);
const PASTED = "From: Desk <a@desk.example>\nSubject: Fee\n\nPay the customs fee today for parcel GM123456789012345.";

beforeEach(() => {
  state.modes = [];
  state.cloudError = null;
  appCheckGate.clear();
  document.body.innerHTML = "";
});

describe("home page Allow cloud", () => {
  it("asks first; Check in the cloud gives a cloud verdict with its label", async () => {
    const ask = vi.fn(async () => true);
    const result = await runChecker(DHL, "cloud", { askForCloudConsent: ask });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(state.modes).toEqual(["only_on_device", "prefer_on_device"]);
    expect(result.sourceLabel).toBe("Checked in the cloud");
    expect(result.outcome).toBe("warning");
  });

  it("Do not send sends nothing: the sample uses its prepared claim with a not-sent line", async () => {
    const result = await runChecker(DHL, "cloud", { askForCloudConsent: async () => false });
    expect(state.modes).toEqual(["only_on_device"]);
    expect(result.sampleNote).toMatch(/prepared for this sample/);
    expect(result.detail).toBe("The email was not sent to the cloud.");
  });

  it("Do not send on pasted mail sends nothing and gives a labelled limited check", async () => {
    const result = await runChecker(PASTED, "cloud", { askForCloudConsent: async () => false });
    expect(state.modes).toEqual(["only_on_device"]);
    expect(result.kind).toBe("limited");
    expect(result.detail).toMatch(/You chose not to send/);
  });

  it("asks every time on the home page, even for samples", async () => {
    const ask = vi.fn(async () => true);
    await runChecker(DHL, "cloud", { askForCloudConsent: ask });
    await runChecker(DHL, "cloud", { askForCloudConsent: ask });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("a failed cloud check says why on the result (F2)", async () => {
    state.cloudError = new Error("Firebase App Check token is invalid.");
    const sample = await runChecker(DHL, "cloud", { askForCloudConsent: async () => true });
    expect(sample.detail).toMatch(/^The cloud check could not run\. This browser could not pass Google's App Check/);
    state.cloudError = new Error("Failed to fetch");
    const pasted = await runChecker(PASTED, "cloud", { askForCloudConsent: async () => true });
    expect(pasted.kind).toBe("limited");
    expect(pasted.detail).toMatch(/could not be reached/);
  });

  it("after an App Check failure in this tab, no dialog and no cloud call", async () => {
    appCheckGate.block();
    const ask = vi.fn(async () => true);
    const result = await runChecker(DHL, "cloud", { askForCloudConsent: ask });
    expect(ask).not.toHaveBeenCalled();
    expect(state.modes).toEqual(["only_on_device"]);
    expect(result.detail).toMatch(/App Check/);
  });

  it("On this device mode never asks and never calls the cloud", async () => {
    const ask = vi.fn(async () => true);
    await runChecker(PASTED, "device", { askForCloudConsent: ask });
    expect(ask).not.toHaveBeenCalled();
    expect(state.modes).toEqual(["only_on_device"]);
  });
});

describe("the shared consent dialog on the page", () => {
  it("shows the same title and buttons as /app/, starts on Do not send, and Escape means Do not send", async () => {
    const pending = askCloudConsentOnPage(document);
    expect(isConsentDialogOpen()).toBe(true);
    expect(document.querySelector("#consent-title")?.textContent).toBe("Check this email in the cloud?");
    expect(document.activeElement?.getAttribute("data-action")).toBe("consent-no");
    expect(askCloudConsentOnPage(document)).toBe(pending);
    document.querySelector(".consent-overlay")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect(pending).resolves.toBe(false);
    expect(document.querySelector(".consent-overlay")).toBeNull();
    expect(isConsentDialogOpen()).toBe(false);
  });

  it("resolves true only for Check in the cloud", async () => {
    const pending = askCloudConsentOnPage(document);
    document.querySelector<HTMLButtonElement>("[data-action=consent-yes]")!.click();
    await expect(pending).resolves.toBe(true);
  });
});
