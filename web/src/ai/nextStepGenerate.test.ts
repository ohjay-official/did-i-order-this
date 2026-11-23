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
  Schema: new Proxy(
    {},
    { get: () => (arg: unknown) => ({ schema: arg }) },
  ),
}));

vi.mock("../firebase/app.ts", () => ({
  getFirebaseApp: () => ({ name: "cloud" }),
  ensureAppCheckToken: async () => {
    state.tokenCalls += 1;
  },
  isFirebaseConfigured: () => true,
  isCloudAiAvailable: () => true,
}));

const { generateNextStepAdvice, buildNextStepPayload } = await import("./nextStep.ts");
const { getOfficialPack } = await import("../packs/official.ts");

const pack = getOfficialPack();

beforeEach(() => {
  state.params = [];
  state.prompts = [];
  state.responses = [];
  state.apps = [];
  state.tokenCalls = 0;
});

describe("generateNextStepAdvice", () => {
  it("uses PREFER_IN_CLOUD on the cloud Firebase app and returns the SDK source", async () => {
    state.responses.push({
      text: JSON.stringify({ advice: "Pay DHL fees only on dhl.com." }),
      inferenceSource: "in_cloud",
    });
    const payload = buildNextStepPayload({
      claim: {
        claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
        asked_action: "pay",
        cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
        email_kind: "carrier_update",
      },
      verdict: {
        outcome: "warning",
        headline: "You're not expecting any parcel right now.",
        reasons: ["The email claims to be DHL, but you are not expecting a parcel."],
      },
      pack,
      senderDomain: "dhl-parcel-desk.example",
    });
    const result = await generateNextStepAdvice(payload, pack);
    expect(state.apps).toEqual(["cloud"]);
    expect(state.params[0]?.mode).toBe("prefer_in_cloud");
    expect(result).toEqual({ text: "Pay DHL fees only on dhl.com.", inferenceSource: "in_cloud" });
    expect(state.prompts[0]).toContain('"brand":"DHL"');
    expect(state.prompts[0]).toContain("Do not say the email is genuine");
    expect(state.prompts[0]).not.toContain("GM123456789012345");
    expect(state.prompts[0]).not.toContain("dhl-parcel-desk.example");
  });
});
