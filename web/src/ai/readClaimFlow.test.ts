import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  responses: [] as Array<{ text: string; inferenceSource: unknown }>,
  params: [] as Array<Record<string, unknown>>,
  prompts: [] as string[],
  initCalls: 0,
  initErrors: [] as Error[],
  hasApi: true,
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

vi.mock("./onDevice.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./onDevice.ts")>();
  return { ...actual, hasOnDeviceApi: () => state.hasApi };
});

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
  state.hasApi = true;
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

  it("retries the on-device warm-up while Chrome has just started", async () => {
    vi.useFakeTimers();
    const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
    state.initErrors.push(new Error("Prompt API is not available in this environment."));
    state.responses.push({ text: GOOD, inferenceSource: "on_device" });
    const pending = readClaim("email body", "only_on_device");
    await vi.advanceTimersByTimeAsync(1500);
    const result = await pending;
    now.mockRestore();
    vi.useRealTimers();
    expect(state.initCalls).toBe(2);
    expect(result.inferenceSource).toBe("on_device");
  });

  it("fails fast with no retry once the page is past the warm-up window", async () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(60_000);
    state.initErrors.push(new Error("Prompt API is not available in this environment."));
    const started = Date.now();
    await expect(readClaim("email body", "only_on_device")).rejects.toThrow("not available");
    now.mockRestore();
    expect(state.initCalls).toBe(1);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("never sends an on-device request anywhere when the browser has no on-device API", async () => {
    state.hasApi = false;
    state.responses.push({ text: GOOD, inferenceSource: "in_cloud" });
    await expect(readClaim("email body", "only_on_device")).rejects.toThrow(/on-device model/);
    expect(state.params).toHaveLength(0);
    expect(state.prompts).toHaveLength(0);
    expect(take).not.toHaveBeenCalled();
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

describe("readClaim input cap", () => {
  it("sends at most 20,000 characters of email text, like the extension", async () => {
    state.responses.push({ text: GOOD, inferenceSource: "in_cloud" });
    const huge = "A".repeat(19_990) + "TAIL-MARKER" + "B".repeat(30_000);
    await readClaim(huge, "only_in_cloud");
    const prompt = state.prompts[0] ?? "";
    expect(prompt).not.toContain("TAIL-MARKER");
    expect(prompt).not.toContain("B");
    expect(prompt.split("---\n")[1]?.replace(/\n---$/, "").length).toBe(20_000);
  });
});
