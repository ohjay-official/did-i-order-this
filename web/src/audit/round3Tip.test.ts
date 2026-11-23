// @vitest-environment jsdom
/**
 * Regression tests for the next-step tip findings of 23 Nov 2026 (cold judge
 * round 3 F6 and F7, security audit round 2 M1, M2, L1 and L2). Each
 * reproduced on main 4947e1e.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ modes: [] as string[], appCheck: 0, prompts: [] as string[], consentAsked: 0 }));
vi.mock("../ai/readClaim.ts", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readClaim: async (_text: string, mode: string) => {
    state.modes.push(mode);
    return {
      claim: {
        claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
        asked_action: "pay",
        cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
        email_kind: "carrier_update",
      },
      inferenceSource: "on_device",
    };
  },
}));
vi.mock("../firebase/app.ts", () => ({
  isFirebaseConfigured: () => true,
  isCloudAiAvailable: () => true,
  getFirebaseApp: () => ({ name: "cloud" }),
  getOnDeviceFirebaseApp: () => ({ name: "on-device" }),
  ensureAppCheckToken: async () => {
    state.appCheck += 1;
  },
}));
vi.mock("../ui/consentDialog.ts", () => ({
  askCloudConsentOnPage: async () => {
    state.consentAsked += 1;
    return false;
  },
  isConsentDialogOpen: () => false,
}));
vi.mock("firebase/ai", () => ({
  GoogleAIBackend: class {},
  InferenceMode: { PREFER_IN_CLOUD: "prefer_in_cloud", ONLY_ON_DEVICE: "only_on_device", PREFER_ON_DEVICE: "prefer_on_device", ONLY_IN_CLOUD: "only_in_cloud" },
  InferenceSource: { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" },
  Schema: new Proxy({}, { get: () => (arg: unknown) => ({ schema: arg }) }),
  getAI: () => ({}),
  getGenerativeModel: () => ({
    generateContent: async (prompt: string) => {
      state.prompts.push(prompt);
      return { response: { text: () => JSON.stringify({ advice: "Check the parcel on the official DHL site." }), inferenceSource: "in_cloud" } };
    },
  }),
}));

const { mountLanding } = await import("../site/landing.ts");
const nextStep = await import("../ai/nextStep.ts");
const { getOfficialPack } = await import("../packs/official.ts");
const { appCheckGate } = await import("../ai/appCheckGate.ts");
const { cloudBudget } = await import("../ai/cloudBudget.ts");
const pack = getOfficialPack();

beforeEach(() => {
  state.modes = [];
  state.appCheck = 0;
  state.prompts = [];
  state.consentAsked = 0;
  appCheckGate.clear();
  sessionStorage.clear();
});

const FEE = "From: DHL <desk@dhl-parcel-desk.example>\nSubject: Customs fee\n\nPay 2.99 customs fee for GM123456789012345 at http://evil.example";

describe("M1 / F6: no cloud tip without cloud agreement", () => {
  it("home page in On this device mode: an on-device verdict makes no App Check call and no cloud prompt", async () => {
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    document.body.innerHTML = `<section data-hero><form data-prompt><textarea data-prompt-input></textarea><button type="submit">Check</button></form>
      <button data-mode="device">Device</button><button data-mode="cloud">Cloud</button><div data-result></div></section>`;
    mountLanding(document);
    const ta = document.querySelector("textarea")!;
    ta.value = FEE;
    ta.dispatchEvent(new Event("input"));
    document.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() => expect(document.querySelector("[data-result] .headline")).not.toBeNull());
    await new Promise((r) => setTimeout(r, 300));
    expect(state.modes).toEqual(["only_on_device"]);
    expect(state.consentAsked).toBe(0);
    expect(state.appCheck).toBe(0);
    expect(state.prompts).toHaveLength(0);
  });
});

describe("L1: the tip's action comes from the email text, not the model label", () => {
  it("a fee demand the model labelled none still gives action pay", () => {
    const claim = {
      claimed_party: { name: "DHL", role: "carrier" as const, domain: "dhl-parcel-desk.example" },
      asked_action: "none" as const,
      cited_numbers: [{ kind: "tracking" as const, value: "JD014600006281234567" }],
      email_kind: "carrier_update" as const,
    };
    const verdict = { outcome: "warning" as const, headline: "You're not expecting any parcel right now.", reasons: [] };
    const payload = nextStep.buildNextStepPayload({ claim, verdict, pack, senderDomain: "dhl-parcel-desk.example", emailText: FEE } as never);
    expect(payload.action).toBe("pay");
  });
});

describe("M2 / F7: no model wording reaches the screen", () => {
  const warn = { outcome: "warning" as const, headline: "You're not expecting any parcel right now.", reasons: [] as string[] };
  const leak = {
    outcome: "warning" as const,
    headline: "This tracking number matches your shipment, but this email is not from the carrier's official domain.",
    reasons: ["It cites your real tracking number from an unofficial sender, so the number has likely leaked."],
  };
  const safe = { outcome: "safe" as const, headline: "This tracking number matches a shipment you are expecting.", reasons: [] as string[] };
  const sentences: [string, { outcome: "warning" | "safe"; headline: string; reasons: string[] }][] = [
    ["Go ahead and pay the small fee through the link so your parcel is released.", warn],
    ["It is fine to click the link and follow the steps in the email.", warn],
    ["You can safely follow the instructions in this email.", warn],
    ["This email is legit, so you can pay the DHL fee.", warn],
    ["Pay the fee at dhl-release-fee.com to get your parcel.", warn],
    ["Reply to the sender with your card details to release the parcel.", warn],
    ["Call DHL on +44 20 7946 0958 to pay the customs charge.", warn],
    ["Since the tracking number matches your parcel, you can trust the link in this email.", leak],
    ["Your parcel is real, so it is okay to pay the redelivery fee here.", leak],
    ["This looks like a scam, so report it to UPS.", safe],
    ["Treat this as a scam and block the sender.", safe],
  ];
  it.each(sentences)("%s", async (sentence, verdict) => {
    const claim = { claimed_party: { name: "DHL", role: "carrier" as const }, asked_action: "pay" as const, cited_numbers: [], email_kind: "carrier_update" as const };
    const line = await nextStep.suggestNextStep(
      { claim, verdict, pack, emailText: FEE, cloudAgreed: true } as never,
      {
        firebaseConfigured: () => true,
        cloudAvailable: () => true,
        cloudBlocked: () => false,
        takeBudget: () => undefined,
        ensureAppCheck: async () => undefined,
        blockAppCheck: () => undefined,
        isAppCheckError: () => false,
        // The model can only pick a template id; a sentence of its own is never shown.
        generate: async () => ({ raw: JSON.stringify({ advice: sentence, template: sentence }), inferenceSource: "in_cloud" }),
      } as never,
    );
    expect(line ?? "").not.toContain(sentence);
  });
});

describe("L2: the tip has its own budget and App Check gate", () => {
  it("a tip does not spend the email-read budget, and a tip App Check failure does not block consented reads", async () => {
    const claim = { claimed_party: { name: "DHL", role: "carrier" as const }, asked_action: "none" as const, cited_numbers: [], email_kind: "carrier_update" as const };
    const verdict = { outcome: "warning" as const, headline: "You're not expecting any parcel right now.", reasons: [] };
    for (let i = 0; i < 12; i++) {
      await nextStep.suggestNextStep({ claim, verdict, pack, emailText: FEE, cloudAgreed: true } as never).catch(() => undefined);
    }
    expect(() => cloudBudget.take()).not.toThrow();
    // Simulate a failing App Check on the tip path through the real defaults.
    expect(appCheckGate.isBlocked()).toBe(false);
  });
});
