import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  params: [] as Array<Record<string, unknown>>,
  prompts: [] as string[],
  responses: [] as Array<{ text: string; inferenceSource: unknown }>,
  apps: [] as string[],
  tokenCalls: 0,
}));

vi.mock("firebase/ai", () => ({
  GoogleAIBackend: class {},
  InferenceMode: {
    PREFER_IN_CLOUD: "prefer_in_cloud",
    ONLY_IN_CLOUD: "only_in_cloud",
    PREFER_ON_DEVICE: "prefer_on_device",
    ONLY_ON_DEVICE: "only_on_device",
  },
  InferenceSource: { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" },
  getAI: (app: { name: string }) => {
    state.apps.push(app.name);
    return {};
  },
  getGenerativeModel: (_ai: unknown, params: Record<string, unknown>) => {
    state.params.push(params);
    return {
      generateContent: async (prompt: string) => {
        state.prompts.push(prompt);
        const next = state.responses.shift();
        if (!next) throw new Error("no response queued");
        return { response: { text: () => next.text, inferenceSource: next.inferenceSource } };
      },
    };
  },
  Schema: new Proxy({}, { get: () => (arg: unknown) => ({ schema: arg }) }),
}));

vi.mock("../firebase/app.ts", () => ({
  getFirebaseApp: () => ({ name: "cloud" }),
  getOnDeviceFirebaseApp: () => ({ name: "on-device" }),
  ensureAppCheckToken: async () => {
    state.tokenCalls += 1;
  },
  isFirebaseConfigured: () => true,
  isCloudAiAvailable: () => true,
}));

const { generateNextStepChoice, buildNextStepPayload, buildNextStepPrompt, templatesFor } = await import("./nextStep.ts");
const { getOfficialPack } = await import("../packs/official.ts");

const pack = getOfficialPack();

beforeEach(() => {
  state.params = [];
  state.prompts = [];
  state.responses = [];
  state.apps = [];
  state.tokenCalls = 0;
});

const payload = () =>
  buildNextStepPayload({
    claim: {
      claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
      asked_action: "pay",
      cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
      email_kind: "carrier_update",
    },
    verdict: { outcome: "warning", headline: "You're not expecting any parcel right now.", reasons: [] },
    pack,
    senderDomain: "dhl-parcel-desk.example",
  });

describe("generateNextStepChoice", () => {
  it("in the cloud: the App Check app, ONLY_IN_CLOUD, and only template ids in the prompt", async () => {
    state.responses.push({ text: JSON.stringify({ template: "warn_pay_report" }), inferenceSource: "in_cloud" });
    const p = payload();
    const templates = templatesFor(p);
    const result = await generateNextStepChoice(buildNextStepPrompt(p, templates), templates.map((t) => t.id), [], "cloud");
    expect(state.apps).toEqual(["cloud"]);
    expect(state.params[0]?.mode).toBe("only_in_cloud");
    expect(result).toEqual({ raw: JSON.stringify({ template: "warn_pay_report" }), inferenceSource: "in_cloud" });
    expect(state.prompts[0]).not.toContain("GM123456789012345");
    expect(state.prompts[0]).not.toContain("dhl-parcel-desk.example");
    expect(state.prompts[0]).not.toContain('"brand":"DHL"');
  });
  it("on this device: the app with no App Check and ONLY_ON_DEVICE", async () => {
    state.responses.push({ text: "{}", inferenceSource: "on_device" });
    await generateNextStepChoice("x", ["warn_report"], [], "device");
    expect(state.apps).toEqual(["on-device"]);
    expect(state.params[0]?.mode).toBe("only_on_device");
    expect(state.tokenCalls).toBe(0);
  });
  it("refuses a reply from somewhere other than asked", async () => {
    state.responses.push({ text: "{}", inferenceSource: "in_cloud" });
    await expect(generateNextStepChoice("x", ["warn_report"], [], "device")).rejects.toThrow(/other than asked/);
    state.responses.push({ text: "{}", inferenceSource: "mystery" });
    await expect(generateNextStepChoice("x", ["warn_report"], [], "cloud")).rejects.toThrow(/inferenceSource/);
  });
});
