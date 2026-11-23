import { describe, expect, it, vi } from "vitest";
import type { EmailClaim } from "@did-i-order-this/core";
import {
  NEXT_STEP_TEMPLATES,
  actionFromEmail,
  brandForPayload,
  buildNextStepPayload,
  buildNextStepPrompt,
  formatNextStepReason,
  isNextStepReason,
  officialSiteFor,
  parseChoice,
  renderNextStep,
  suggestNextStep,
  templatesFor,
  type NextStepDeps,
  type NextStepInput,
} from "./nextStep.ts";
import { getOfficialPack } from "../packs/official.ts";

const pack = getOfficialPack();

const claim = (over: Partial<EmailClaim> = {}): EmailClaim => ({
  claimed_party: { name: "DHL", role: "carrier" },
  asked_action: "none",
  cited_numbers: [],
  email_kind: "carrier_update",
  ...over,
});

const warn = { outcome: "warning" as const, headline: "You're not expecting any parcel right now.", reasons: [] as string[] };

const input = (over: Partial<NextStepInput> = {}): NextStepInput => ({
  claim: claim(),
  verdict: warn,
  pack,
  emailText: "From: DHL <x@dhl.com>\n\nPay the 2.99 customs fee now.",
  senderDomain: "dhl.com",
  cloudAgreed: true,
  ...over,
});

const deps = (over: Partial<NextStepDeps> = {}): NextStepDeps => ({
  firebaseConfigured: () => true,
  cloudAvailable: () => true,
  onDeviceAvailable: () => false,
  cloudBlocked: () => false,
  takeBudget: () => undefined,
  ensureAppCheck: async () => undefined,
  blockAppCheck: () => undefined,
  isAppCheckError: () => false,
  generate: async () => ({ raw: JSON.stringify({ template: "warn_pay_own_site", brand: "DHL" }), inferenceSource: "in_cloud" }),
  timeoutMs: 1000,
  ...over,
});

describe("templates", () => {
  it("every template has a unique id, at least one action, and no em dash", () => {
    const ids = NEXT_STEP_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of NEXT_STEP_TEMPLATES) {
      expect(t.actions.length).toBeGreaterThan(0);
      expect(t.text).not.toMatch(/\u2014/);
    }
  });
  it("every outcome and action has at least one template", () => {
    for (const outcome of ["warning", "neutral"] as const) {
      for (const action of ["pay", "log_in", "download", "none"] as const) {
        expect(templatesFor({ outcome, action }).length).toBeGreaterThan(0);
      }
    }
    expect(templatesFor({ outcome: "safe", action: "none" }).length).toBeGreaterThan(0);
    expect(templatesFor({ outcome: "safe", action: "pay" })).toEqual([]);
  });
});

describe("payload", () => {
  it("reads the action from the email text, whatever the model labelled", () => {
    expect(actionFromEmail(claim(), "Pay the 2.99 customs fee.", pack)).toBe("pay");
    expect(actionFromEmail(claim(), "Sign in to your account to confirm.", pack)).toBe(actionFromEmail(claim({ asked_action: "log_in" }), "", pack));
    expect(actionFromEmail(claim({ asked_action: "download" }), "", pack)).toBe("download");
    expect(actionFromEmail(claim(), "Your parcel arrives tomorrow.", pack)).toBe("none");
  });
  it("names a brand only from an official sender domain, never from a claimed name", () => {
    expect(brandForPayload({ senderDomain: "dhl.com", pack })).toBe("DHL");
    expect(brandForPayload({ senderDomain: "dhl-parcel-desk.example", pack })).toBeUndefined();
    expect(brandForPayload({ pack })).toBeUndefined();
    expect(buildNextStepPayload(input({ senderDomain: "evil.example" }))).toEqual({ outcome: "warning", action: "pay" });
  });
  it("the prompt holds only the outcome, action, brand and template texts", () => {
    const p = buildNextStepPayload(input());
    const prompt = buildNextStepPrompt(p, templatesFor(p));
    expect(prompt).toContain('"brand":"DHL"');
    expect(prompt).toContain("warn_pay_own_site");
    expect(prompt).not.toContain("customs fee now");
  });
});

describe("rendering", () => {
  const p = { outcome: "warning" as const, action: "pay" as const, brand: "DHL" };
  it("renders a matching template with the brand's official site", () => {
    expect(renderNextStep({ template: "warn_pay_own_site", brand: "DHL" }, p, pack)).toBe(
      "Do not pay anything through this email. If you think a fee is real, open the official DHL app or dhl.com yourself and pay only there.",
    );
  });
  it("drops a brand that is not the payload's", () => {
    expect(renderNextStep({ template: "warn_pay_own_site", brand: "UPS" }, p, pack)).toContain("the carrier's or store's own app or site");
    expect(officialSiteFor("Nobody", pack)).toBe("the carrier's or store's own app or site");
  });
  it("refuses unknown ids, another outcome's template, and a template for another action", () => {
    expect(renderNextStep({ template: "Go ahead and pay" }, p, pack)).toBeUndefined();
    expect(renderNextStep({ template: "safe_follow_own_site" }, p, pack)).toBeUndefined();
    expect(renderNextStep({ template: "warn_download_delete" }, p, pack)).toBeUndefined();
  });
  it("parses only JSON objects", () => {
    expect(parseChoice('{"template":"x"}')).toEqual({ template: "x" });
    expect(parseChoice("pay the fee")).toEqual({});
    expect(parseChoice("3")).toEqual({});
  });
  it("labels where the choice was made", () => {
    expect(formatNextStepReason("in_cloud", "x")).toBe("Next step, chosen in the cloud: x");
    expect(isNextStepReason(formatNextStepReason("on_device", "x"))).toBe(true);
    expect(isNextStepReason("Next step written in the cloud: x")).toBe(false);
  });
});

describe("suggestNextStep", () => {
  it("after cloud agreement: one budget take, one App Check, a rendered template", async () => {
    const takeBudget = vi.fn();
    const ensureAppCheck = vi.fn(async () => undefined);
    const generate = vi.fn(deps().generate);
    const line = await suggestNextStep(input(), deps({ takeBudget, ensureAppCheck, generate }));
    expect(line).toBe(
      "Next step, chosen in the cloud: Do not pay anything through this email. If you think a fee is real, open the official DHL app or dhl.com yourself and pay only there.",
    );
    expect(takeBudget).toHaveBeenCalledTimes(1);
    expect(ensureAppCheck).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[3]).toBe("cloud");
    expect(generate.mock.calls[0]?.[2]).toEqual(["DHL"]);
  });
  it("without cloud agreement: on this device only, with no budget and no App Check", async () => {
    const takeBudget = vi.fn();
    const ensureAppCheck = vi.fn(async () => undefined);
    const generate = vi.fn(async (_p: string, _ids: string[], _brands: string[], _where: "cloud" | "device") => ({ raw: JSON.stringify({ template: "warn_pay_report" }), inferenceSource: "on_device" as const }));
    const line = await suggestNextStep(input({ cloudAgreed: false }), deps({ onDeviceAvailable: () => true, takeBudget, ensureAppCheck, generate }));
    expect(line).toBe("Next step, chosen on this device: Do not pay through this email. Report it as phishing in your mail app, then delete it.");
    expect(takeBudget).not.toHaveBeenCalled();
    expect(ensureAppCheck).not.toHaveBeenCalled();
    expect(generate.mock.calls[0]?.[3]).toBe("device");
  });
  it("without cloud agreement and no on-device model: no tip and no call", async () => {
    const generate = vi.fn(deps().generate);
    expect(await suggestNextStep(input({ cloudAgreed: false }), deps({ generate }))).toBeUndefined();
    expect(generate).not.toHaveBeenCalled();
  });
  it("shows nothing when the model picks no valid template", async () => {
    const generate = async () => ({ raw: JSON.stringify({ advice: "Go ahead and pay the fee." }), inferenceSource: "in_cloud" as const });
    expect(await suggestNextStep(input(), deps({ generate }))).toBeUndefined();
  });
  it("stops at the gates: not configured, cloud off or blocked, budget, App Check, timeout, error", async () => {
    expect(await suggestNextStep(input(), deps({ firebaseConfigured: () => false }))).toBeUndefined();
    expect(await suggestNextStep(input(), deps({ cloudAvailable: () => false }))).toBeUndefined();
    expect(await suggestNextStep(input(), deps({ cloudBlocked: () => true }))).toBeUndefined();
    expect(await suggestNextStep(input(), deps({ takeBudget: () => { throw new Error("budget"); } }))).toBeUndefined();
    const blockAppCheck = vi.fn();
    expect(
      await suggestNextStep(input(), deps({ ensureAppCheck: async () => { throw new Error("app check"); }, isAppCheckError: () => true, blockAppCheck })),
    ).toBeUndefined();
    expect(blockAppCheck).toHaveBeenCalledTimes(1);
    const slow = () => new Promise<never>(() => undefined);
    expect(await suggestNextStep(input(), deps({ generate: slow, timeoutMs: 10 }))).toBeUndefined();
    const blockOnGenerate = vi.fn();
    expect(
      await suggestNextStep(input(), deps({ generate: async () => { throw new Error("x"); }, isAppCheckError: () => true, blockAppCheck: blockOnGenerate })),
    ).toBeUndefined();
    expect(blockOnGenerate).toHaveBeenCalledTimes(1);
  });
  it("gives no tip for an outcome and action with no template", async () => {
    const safe = { outcome: "safe" as const, headline: "x", reasons: [] };
    expect(await suggestNextStep(input({ verdict: safe }), deps())).toBeUndefined();
  });
});
