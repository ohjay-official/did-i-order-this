import { describe, expect, it, vi } from "vitest";
import { NOTHING_EXPECTED_HEADLINE, decideVerdict, type EmailClaim } from "@did-i-order-this/core";
import { AIError, AIErrorCode } from "firebase/ai";
import { CloudBudgetError } from "../ai/cloudBudget.ts";
import { CloudConsentMemory } from "../ai/consentMemory.ts";
import { NoOnDeviceModelError } from "../ai/onDevice.ts";
import type { ReadClaimMode } from "../ai/readClaim.ts";
import { demoSeed, formatEmailText, sampleThreads } from "../demo/seed.ts";
import { getOfficialPack } from "../packs/official.ts";
import { CLOUD_TIMEOUT_MS, NOT_SENT_NOTE, SAMPLE_NOTE, runCheckFlow, withTimeout, type CheckFlowDeps } from "./checkFlow.ts";

const dhl = sampleThreads[0];
const PASTED = "From: Someone <a@b.example>\nSubject: Hello\n\nPay this fee.";
const CLAIM: EmailClaim = dhl.expectedClaim;

function memoryStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

function deps(overrides: Partial<CheckFlowDeps> & { onDevice?: () => Promise<never> | Promise<{ claim: EmailClaim; inferenceSource: "on_device" }>; cloud?: () => Promise<unknown> } = {}) {
  const calls: ReadClaimMode[] = [];
  const consent = vi.fn(async () => true);
  const memory = new CloudConsentMemory(memoryStore());
  const onDevice = overrides.onDevice ?? (async () => Promise.reject(new NoOnDeviceModelError()));
  const cloud = overrides.cloud ?? (async () => ({ claim: CLAIM, inferenceSource: "in_cloud" as const }));
  const base: CheckFlowDeps = {
    readClaim: async (_text, mode) => {
      calls.push(mode);
      if (mode === "only_on_device") return (await onDevice()) as never;
      return (await cloud()) as never;
    },
    firebaseConfigured: () => true,
    cloudAvailable: () => true,
    askForCloudConsent: consent,
    consentMemory: memory,
  };
  return { deps: { ...base, ...overrides }, calls, consent, memory };
}

const thread = { text: formatEmailText(dhl), sample: dhl };
const pasted = { text: PASTED };

describe("sample inbox check flow", () => {
  it("uses the on-device read when it works, with no consent and no cloud call", async () => {
    const t = deps({ onDevice: async () => ({ claim: CLAIM, inferenceSource: "on_device" }) });
    const result = await runCheckFlow(thread, t.deps);
    expect(result).toEqual({ kind: "ai", claim: CLAIM, inferenceSource: "on_device", usedRememberedConsent: false });
    expect(t.calls).toEqual(["only_on_device"]);
    expect(t.consent).not.toHaveBeenCalled();
  });

  it("no Nano, judge declines: sample thread gets the prepared claim and a not-sent note, never an Error", async () => {
    const t = deps({ askForCloudConsent: async () => false });
    const result = await runCheckFlow(thread, t.deps);
    expect(result).toMatchObject({ kind: "sample", reason: "declined", detail: NOT_SENT_NOTE, claim: dhl.expectedClaim });
    expect(t.calls).toEqual(["only_on_device"]);
    expect(t.memory.has()).toBe(false);
    if (result.kind !== "sample") throw new Error("expected sample");
    const verdict = decideVerdict(result.claim, demoSeed(), getOfficialPack(), undefined);
    expect(verdict.outcome).toBe("warning");
    expect(verdict.headline).toBe(NOTHING_EXPECTED_HEADLINE);
    expect(verdict.inferenceSourceLabel).not.toMatch(/Checked on this device|Checked in the cloud/);
  });

  it("App Check failure: sample thread falls back with the App Check sentence", async () => {
    const t = deps({ cloud: async () => Promise.reject(new AIError(AIErrorCode.FETCH_ERROR, "Firebase App Check token is invalid.")) });
    const result = await runCheckFlow(thread, t.deps);
    expect(result).toMatchObject({
      kind: "sample",
      reason: "cloud_failed",
      detail: "The cloud check could not run. This page could not prove it is the real site (App Check). Reload the page and try again.",
    });
  });

  it("project quota: sample thread falls back with the quota sentence", async () => {
    const t = deps({ cloud: async () => Promise.reject(new Error("429 RESOURCE_EXHAUSTED quota")) });
    const result = await runCheckFlow(thread, t.deps);
    expect(result).toMatchObject({ kind: "sample", reason: "cloud_failed" });
    if (result.kind === "sample") expect(result.detail).toContain("The cloud limit for this project was reached.");
  });

  it("client cap: sample thread falls back with the cap sentence", async () => {
    const t = deps({ cloud: async () => Promise.reject(new CloudBudgetError("Cloud reads are limited to 10 a minute. Try again in 30 seconds.", 30_000)) });
    const result = await runCheckFlow(thread, t.deps);
    if (result.kind !== "sample") throw new Error("expected sample");
    expect(result.detail).toBe("The cloud check could not run. Cloud reads are limited to 10 a minute. Try again in 30 seconds.");
  });

  it("network failure: sample thread falls back with the connection sentence", async () => {
    const warn = vi.fn();
    const t = deps({ warn, cloud: async () => Promise.reject(new TypeError("Failed to fetch")) });
    const result = await runCheckFlow(thread, t.deps);
    if (result.kind !== "sample") throw new Error("expected sample");
    expect(result.detail).toContain("The cloud could not be reached.");
    expect(warn).toHaveBeenCalledOnce();
  });

  it("a cloud read that never answers (reCAPTCHA blocked) falls back after the timeout", async () => {
    const t = deps({ cloudTimeoutMs: 20, cloud: () => new Promise(() => undefined) });
    const result = await runCheckFlow(thread, t.deps);
    expect(result).toMatchObject({
      kind: "sample",
      reason: "cloud_failed",
      detail: "The cloud check could not run. The cloud did not answer in time. Check your connection and try again.",
    });
    const pastedResult = await runCheckFlow(pasted, t.deps);
    expect(pastedResult).toMatchObject({ kind: "error", canLimited: true });
    expect(CLOUD_TIMEOUT_MS).toBe(20_000);
  });

  it("withTimeout passes a prompt answer through untouched", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 50)).resolves.toBe("ok");
    await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });

  it("no Firebase config or no cloud AI: sample thread uses the prepared claim, pasted email gets the limited check", async () => {
    const off = deps({ firebaseConfigured: () => false });
    expect(await runCheckFlow(thread, off.deps)).toMatchObject({ kind: "sample", reason: "not_configured", detail: "" });
    expect(await runCheckFlow(pasted, off.deps)).toEqual({ kind: "limited" });
    expect(off.calls).toEqual([]);
    const noCloud = deps({ cloudAvailable: () => false });
    expect(await runCheckFlow(thread, noCloud.deps)).toMatchObject({ kind: "sample", reason: "no_cloud" });
    expect(await runCheckFlow(pasted, noCloud.deps)).toEqual({ kind: "limited" });
    expect(noCloud.consent).not.toHaveBeenCalled();
  });

  it("pasted email with no prepared claim keeps Run a limited check after a decline or a cloud failure", async () => {
    const declined = deps({ askForCloudConsent: async () => false });
    expect(await runCheckFlow(pasted, declined.deps)).toEqual({
      kind: "error",
      message: "The AI read could not run. The email was not sent to the cloud.",
      canLimited: true,
    });
    const failed = deps({ cloud: async () => Promise.reject(new Error("App Check attestation failed")) });
    const result = await runCheckFlow(pasted, failed.deps);
    expect(result).toMatchObject({ kind: "error", canLimited: true });
  });

  it("cloud success after consent is a real cloud read and remembers the yes", async () => {
    const onCloudStart = vi.fn();
    const t = deps({ onCloudStart });
    const result = await runCheckFlow(thread, t.deps);
    expect(result).toEqual({ kind: "ai", claim: CLAIM, inferenceSource: "in_cloud", usedRememberedConsent: false });
    expect(t.calls).toEqual(["only_on_device", "only_in_cloud"]);
    expect(onCloudStart).toHaveBeenCalledOnce();
    expect(t.memory.has()).toBe(true);
  });

  it("a remembered yes skips the dialog for the next sample thread", async () => {
    const t = deps();
    t.memory.remember();
    const result = await runCheckFlow(thread, t.deps);
    expect(t.consent).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: "ai", inferenceSource: "in_cloud", usedRememberedConsent: true });
  });

  it("a remembered yes never covers a pasted email: it is asked about every time", async () => {
    const t = deps({ askForCloudConsent: vi.fn(async () => false) });
    t.memory.remember();
    await runCheckFlow(pasted, t.deps);
    expect(t.deps.askForCloudConsent).toHaveBeenCalledOnce();
    expect(t.calls).toEqual(["only_on_device"]);
  });

  it("a decline is not remembered, so the next check asks again", async () => {
    const answers = [false, true];
    const ask = vi.fn(async () => answers.shift() ?? false);
    const t = deps({ askForCloudConsent: ask });
    expect((await runCheckFlow(thread, t.deps)).kind).toBe("sample");
    expect((await runCheckFlow(thread, t.deps)).kind).toBe("ai");
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("keeps the exact prepared-sample note the film looks for", () => {
    expect(SAMPLE_NOTE).toBe(
      "On-device AI did not run in this browser. This check used the structured claim prepared for this sample thread.",
    );
    expect(SAMPLE_NOTE).toContain("prepared for this sample thread");
  });
});
