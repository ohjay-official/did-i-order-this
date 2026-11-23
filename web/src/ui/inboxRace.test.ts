// @vitest-environment jsdom
/** Regression tests for the 23 Nov 2026 audit: M5 (stale results), cold judge fix 4 (Do not send is not an Error). */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pending: [] as Array<{ mode: string; resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
  cloud: false,
}));
vi.mock("../ai/readClaim.ts", () => ({
  readClaim: (_text: string, mode: string) =>
    new Promise((resolve, reject) => {
      state.pending.push({ mode, resolve, reject });
    }),
}));
vi.mock("../firebase/app.ts", () => ({ isFirebaseConfigured: () => true, isCloudAiAvailable: () => state.cloud }));
vi.mock("../ai/nextStep.ts", () => ({
  suggestNextStep: async () => undefined,
  isNextStepReason: (reason: string) =>
    reason.startsWith("Next step written in the cloud:") || reason.startsWith("Next step written on this device:"),
}));

const tick = () => new Promise((r) => setTimeout(r, 20));

function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase("did-i-order-this");
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}

async function mount() {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as unknown as typeof window.requestAnimationFrame;
  window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
  const { InboxApp } = await import("./InboxApp.ts");
  const { sampleThreads } = await import("../demo/seed.ts");
  document.body.innerHTML = "";
  const root = document.createElement("div");
  document.body.append(root);
  const app = new InboxApp(root);
  await app.start();
  return { root, sampleThreads };
}

const SAFE_CLAIM = {
  claimed_party: { name: "Northwind Outfitters", role: "merchant", domain: "shop.northwind-outfitters.example" },
  asked_action: "none",
  cited_numbers: [{ kind: "order", value: "NW-10001" }],
  email_kind: "receipt",
};

beforeEach(async () => {
  state.pending = [];
  state.cloud = false;
  sessionStorage.clear();
  await deleteDb();
});

describe("sample inbox: a result belongs to the email it was checked for (M5)", () => {
  it("drops thread A's verdict when the person has moved to thread B", async () => {
    const { root, sampleThreads } = await mount();
    const A = sampleThreads[0].id;
    const B = sampleThreads[1].id;
    root.querySelector<HTMLButtonElement>(`[data-thread="${A}"]`)!.click();
    root.querySelector<HTMLButtonElement>("[data-action=check]")!.click();
    await tick();
    root.querySelector<HTMLButtonElement>(`[data-thread="${B}"]`)!.click();
    state.pending[0].resolve({ claim: SAFE_CLAIM, inferenceSource: "on_device" });
    await tick();
    expect(root.querySelector(".thread-item.is-current")?.getAttribute("data-thread")).toBe(B);
    expect(root.querySelector(".result .outcome")).toBeNull();
  });

  it("disables Check while a check runs, so a double tap starts one flow", async () => {
    const { root } = await mount();
    root.querySelector<HTMLButtonElement>("[data-action=check]")!.click();
    await tick();
    const button = root.querySelector<HTMLButtonElement>("[data-action=check]")!;
    expect(button.disabled).toBe(true);
    button.click();
    await tick();
    expect(state.pending).toHaveLength(1);
    state.pending[0].resolve({ claim: SAFE_CLAIM, inferenceSource: "on_device" });
    await tick();
    expect(root.querySelector<HTMLButtonElement>("[data-action=check]")!.disabled).toBe(false);
  });
});

describe("sample inbox: Do not send on a pasted email (cold judge fix 4)", () => {
  it("shows Not checked with AI and the limited-check button, not Error", async () => {
    state.cloud = true;
    const { root } = await mount();
    const paste = root.querySelector<HTMLTextAreaElement>("[data-paste]")!;
    paste.value = "From: Shop <a@shop.example>\nSubject: Hello\n\nYour order shipped.";
    paste.dispatchEvent(new Event("input"));
    root.querySelector<HTMLFormElement>("[data-paste-form]")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await tick();
    state.pending[0].reject(new Error("no on-device model"));
    await tick();
    root.querySelector<HTMLButtonElement>("[data-action=consent-no]")!.click();
    await tick();
    expect(state.pending).toHaveLength(1);
    expect(root.querySelector(".result .headline")?.textContent).toBe("Not checked with AI");
    expect(root.querySelector(".result .outcome")?.textContent).not.toMatch(/error/i);
    expect(root.querySelector(".result .note")?.textContent).toBe(
      "You chose not to send this email to the cloud. Run a limited check (no AI) instead.",
    );
    root.querySelector<HTMLButtonElement>("[data-action=limited]")!.click();
    await tick();
    expect(root.querySelector(".result .source-label")?.textContent).toBe("Limited check (no AI)");
  });
});
