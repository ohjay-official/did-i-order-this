// Round 5 regression (security audit J2-2): a Prompt API global that exists
// but is falsy must not let an "only on device" read reach the cloud.
// This test runs the real Firebase AI Logic SDK with fetch recorded.
import { afterEach, describe, expect, it, vi } from "vitest";

const FAKE_ENV = {
  VITE_FIREBASE_API_KEY: "fake-key-for-test",
  VITE_FIREBASE_AUTH_DOMAIN: "test.example",
  VITE_FIREBASE_PROJECT_ID: "test-project",
  VITE_FIREBASE_STORAGE_BUCKET: "test.example",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
  VITE_FIREBASE_APP_ID: "1:1:web:1",
};

function recordFetch() {
  const calls: { url: string; body: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { body?: string } = {}) => {
    calls.push({ url: String(url), body: String(init.body ?? "") });
    const claim = { claimed_party: { name: "UPS", role: "carrier" }, asked_action: "none", cited_numbers: [], email_kind: "carrier_update" };
    return new Response(
      JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(claim) }] }, finishReason: "STOP" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  return calls;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("J2-2: falsy on-device global", () => {
  for (const [label, value] of [
    ["undefined", undefined],
    ["null", null],
    ["false", false],
    ["an object", {}],
  ] as const) {
    it(`the Prompt API global set to ${label}: hasOnDeviceApi is false and readClaim sends nothing`, async () => {
      for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
      const calls = recordFetch();
      vi.stubGlobal("LanguageModel", value);
      const { hasOnDeviceApi } = await import("./onDevice.ts");
      expect(hasOnDeviceApi()).toBe(false);
      const { readClaim } = await import("./readClaim.ts");
      await expect(readClaim("From: UPS <mcinfo@ups.com>\nSubject: marker\n\nPRIVATE EMAIL BODY", "only_on_device")).rejects.toThrow(
        /No on-device model/,
      );
      expect(calls).toHaveLength(0);
    });
  }

  it("a function-valued global counts as present (the only shape the SDK uses)", async () => {
    vi.stubGlobal("LanguageModel", function Stub() {});
    const { hasOnDeviceApi } = await import("./onDevice.ts");
    expect(hasOnDeviceApi()).toBe(true);
  });

  it("the second lock: with the presence check bypassed, the missing adapter still stops the read", async () => {
    for (const [k, v] of Object.entries(FAKE_ENV)) vi.stubEnv(k, v);
    const calls = recordFetch();
    vi.stubGlobal("LanguageModel", undefined);
    vi.doMock("./onDevice.ts", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./onDevice.ts")>();
      return { ...actual, hasOnDeviceApi: () => true };
    });
    const { readClaim } = await import("./readClaim.ts");
    await expect(readClaim("From: UPS <mcinfo@ups.com>\n\nPRIVATE EMAIL BODY", "only_on_device")).rejects.toThrow(/No on-device model/);
    expect(calls).toHaveLength(0);
    vi.doUnmock("./onDevice.ts");
  });

  it("the fetch block refuses Google AI and App Check hosts while an on-device call runs", async () => {
    const calls = recordFetch();
    const { withCloudFetchBlocked, CloudRequestBlockedError } = await import("./onDevice.ts");
    await withCloudFetchBlocked(async () => {
      await expect(fetch("https://firebasevertexai.googleapis.com/v1beta/x:generateContent")).rejects.toBeInstanceOf(CloudRequestBlockedError);
      await expect(fetch("https://content-firebaseappcheck.googleapis.com/v1/x")).rejects.toBeInstanceOf(CloudRequestBlockedError);
      await expect(fetch("https://www.google.com/recaptcha/enterprise.js")).rejects.toBeInstanceOf(CloudRequestBlockedError);
      await expect(fetch(new URL("https://generativelanguage.googleapis.com/v1"))).rejects.toBeInstanceOf(CloudRequestBlockedError);
      await fetch("/build-info.json");
    });
    expect(calls.map((c) => c.url)).toEqual(["/build-info.json"]);
    await fetch("https://firebasevertexai.googleapis.com/after");
    expect(calls).toHaveLength(2);
  });

  it("the fetch block is restored after an error and nests", async () => {
    const calls = recordFetch();
    const original = globalThis.fetch;
    const { withCloudFetchBlocked, isGoogleAiRequest } = await import("./onDevice.ts");
    await expect(
      withCloudFetchBlocked(() => withCloudFetchBlocked(async () => Promise.reject(new Error("boom")))),
    ).rejects.toThrow("boom");
    expect(globalThis.fetch).toBe(original);
    expect(calls).toHaveLength(0);
    expect(isGoogleAiRequest({ url: "https://x.gstatic.com/a" })).toBe(true);
    expect(isGoogleAiRequest(42)).toBe(true);
    expect(isGoogleAiRequest("data:text/plain,hi")).toBe(false);
    expect(isGoogleAiRequest("https://did-i-order-this.vercel.app/")).toBe(false);
  });
});

describe("CLAIM_PROMPT (round 5)", () => {
  it("asks for a request label on any contact or payment ask, and keeps a plain app note as none", async () => {
    const { CLAIM_PROMPT } = await import("./schema");
    expect(CLAIM_PROMPT).toContain("Any request to contact, message, call, reply with details, pay by any method, or visit a site is other or the matching action, never none.");
    expect(CLAIM_PROMPT).toContain("a phone number, a messaging app or @handle, a payment app, a gift card or voucher, a QR code, and card or bank details");
    expect(CLAIM_PROMPT).toContain("Use download only when the email asks the reader to download, open or install a file, attachment or app.");
    expect(CLAIM_PROMPT).toContain("in the sender's own app or account, with no other request, is none.");
  });
});
