import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as Array<{ text: string; inferenceSource: unknown }>,
  params: [] as Array<Record<string, unknown>>,
  prompts: [] as string[],
  initCalls: 0,
  initErrors: [] as Error[],
}));

vi.mock("firebase/ai", () => ({
  GoogleAIBackend: class {},
  InferenceMode: {
    ONLY_ON_DEVICE: "only_on_device",
    PREFER_ON_DEVICE: "prefer_on_device",
    ONLY_IN_CLOUD: "only_in_cloud",
  },
  InferenceSource: { ON_DEVICE: "on_device", IN_CLOUD: "in_cloud" },
  getAI: () => ({}),
  getGenerativeModel: (_ai: unknown, params: Record<string, unknown>) => {
    state.params.push(params);
    return {
      initializeDeviceModel: async () => {
        state.initCalls += 1;
        const error = state.initErrors.shift();
        if (error) throw error;
      },
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

vi.mock("../firebase/app.ts", () => ({ getFirebaseApp: () => ({}) }));

const take = vi.fn();
vi.mock("./cloudBudget.ts", () => ({ cloudBudget: { take: () => take() } }));

const { readClaim } = await import("./readClaim.ts");

const GOOD = JSON.stringify({
  claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
  asked_action: "pay",
  cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
  email_kind: "carrier_update",
});

beforeEach(() => {
  state.responses = [];
  state.params = [];
  state.prompts = [];
  state.initCalls = 0;
  state.initErrors = [];
  take.mockReset();
});

describe("readClaim through Firebase AI Logic", () => {
  it("on-device only: warms the device model, spends no cloud budget, labels on_device", async () => {
    state.responses.push({ text: GOOD, inferenceSource: "on_device" });
    const result = await readClaim("email body", "only_on_device");
    expect(result.inferenceSource).toBe("on_device");
    expect(result.claim.cited_numbers[0].value).toBe("GM123456789012345");
    expect(state.initCalls).toBe(1);
    expect(take).not.toHaveBeenCalled();
    expect(state.params[0].mode).toBe("only_on_device");
    expect(state.prompts[0]).toContain("Do not invent numbers");
    expect(state.prompts[0]).toContain("email body");
  });

  it("cloud only: skips the device model, spends one budget unit, uses the brief model", async () => {
    state.responses.push({ text: GOOD, inferenceSource: "in_cloud" });
    const result = await readClaim("email body", "only_in_cloud");
    expect(result.inferenceSource).toBe("in_cloud");
    expect(state.initCalls).toBe(0);
    expect(take).toHaveBeenCalledTimes(1);
    const cloud = state.params[0].inCloudParams as { model: string; generationConfig: { responseMimeType: string } };
    expect(cloud.model).toBe("gemini-3.5-flash-lite");
    expect(cloud.generationConfig.responseMimeType).toBe("application/json");
  });

  it("stops before any request when the cloud budget refuses", async () => {
    take.mockImplementation(() => {
      throw new Error("budget spent");
    });
    await expect(readClaim("email body", "prefer_on_device")).rejects.toThrow("budget spent");
    expect(state.prompts).toHaveLength(0);
  });

  it("retries the on-device warm-up while Chrome says the model is not ready yet", async () => {
    vi.useFakeTimers();
    state.initErrors.push(new Error("Prompt API is not available in this environment."));
    state.responses.push({ text: GOOD, inferenceSource: "on_device" });
    const pending = readClaim("email body", "only_on_device");
    await vi.advanceTimersByTimeAsync(2500);
    const result = await pending;
    vi.useRealTimers();
    expect(state.initCalls).toBe(2);
    expect(result.inferenceSource).toBe("on_device");
  });

  it("does not retry other warm-up failures", async () => {
    state.initErrors.push(new Error("download failed"));
    await expect(readClaim("email body", "only_on_device")).rejects.toThrow("download failed");
    expect(state.initCalls).toBe(1);
  });

  it("retries once with the same mode when the structured claim is unusable", async () => {
    state.responses.push({ text: "{\"nope\":true}", inferenceSource: "on_device" });
    state.responses.push({ text: GOOD, inferenceSource: "on_device" });
    const result = await readClaim("email body", "only_on_device");
    expect(result.claim.email_kind).toBe("carrier_update");
    expect(state.prompts).toHaveLength(2);
  });

  it("rejects a reply with no usable inference source instead of guessing a label", async () => {
    state.responses.push({ text: GOOD, inferenceSource: undefined });
    await expect(readClaim("email body", "only_on_device")).rejects.toThrow("inferenceSource");
  });
});
