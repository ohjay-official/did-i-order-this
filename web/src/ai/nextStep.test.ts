import { describe, expect, it, vi } from "vitest";
import type { EmailClaim, Verdict } from "@did-i-order-this/core";
import { getOfficialPack } from "../packs/official.ts";
import { AppCheckBlockedError } from "./appCheckGate.ts";
import { CloudBudgetError } from "./cloudBudget.ts";
import { CloudTimeoutError } from "../ui/checkFlow.ts";
import {
  MAX_ADVICE_CHARS,
  NEXT_STEP_TIMEOUT_MS,
  buildNextStepPayload,
  buildNextStepPrompt,
  formatNextStepReason,
  isNextStepReason,
  brandForPayload,
  officialBrandFromClaimedName,
  riskyActionFromClaim,
  softensLeakedNumberWarning,
  softensWarning,
  suggestNextStep,
  validateNextStepAdvice,
  verdictNamesBrand,
  type NextStepDeps,
  type NextStepInput,
} from "./nextStep.ts";

const pack = getOfficialPack();

const CLAIM: EmailClaim = {
  claimed_party: { name: "DHL Express Desk", role: "carrier", domain: "dhl-parcel-desk.example" },
  asked_action: "pay",
  cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
  email_kind: "carrier_update",
};

const VERDICT: Pick<Verdict, "outcome" | "headline" | "reasons"> = {
  outcome: "warning",
  headline: "You're not expecting any parcel right now.",
  reasons: ["The claimed domain dhl-parcel-desk.example is not in the official-domain pack."],
};

const EMAIL_BODY =
  "From: DHL Express Desk <fees@dhl-parcel-desk.example>\nSubject: Pay the release fee\n\nPay $2.99 to release parcel GM123456789012345. Click http://evil.example/pay";

function input(overrides: Partial<NextStepInput> = {}): NextStepInput {
  return {
    claim: overrides.claim ?? CLAIM,
    verdict: overrides.verdict ?? VERDICT,
    pack: overrides.pack ?? pack,
    senderDomain: overrides.senderDomain,
  };
}

function deps(overrides: Partial<NextStepDeps> & { generate?: NextStepDeps["generateAdvice"] } = {}): NextStepDeps & { generateAdvice: ReturnType<typeof vi.fn> } {
  const { generate, ...rest } = overrides;
  const generateAdvice = vi.fn(
    generate ??
      (async () => ({
        text: "Pay DHL fees only on dhl.com, and report a fake at dhl.com.",
        inferenceSource: "in_cloud" as const,
      })),
  );
  return {
    firebaseConfigured: () => true,
    cloudAvailable: () => true,
    cloudBlocked: () => false,
    takeBudget: () => undefined,
    ensureAppCheck: async () => undefined,
    blockAppCheck: () => undefined,
    isAppCheckError: () => false,
    timeoutMs: 50,
    ...rest,
    generateAdvice,
  };
}

describe("officialBrandFromClaimedName", () => {
  it("returns the canonical pack name for an exact or whole-word match", () => {
    expect(officialBrandFromClaimedName("DHL", pack)).toBe("DHL");
    expect(officialBrandFromClaimedName("dhl", pack)).toBe("DHL");
    expect(officialBrandFromClaimedName("DHL Express Desk", pack)).toBe("DHL");
    expect(officialBrandFromClaimedName("PayPal", pack)).toBe("PayPal");
    expect(officialBrandFromClaimedName("The UPS Store", pack)).toBe("UPS");
  });

  it("does not send a claimed name that is not on the official list", () => {
    expect(officialBrandFromClaimedName("Definitely Honest Logistics", pack)).toBeUndefined();
    expect(officialBrandFromClaimedName("Amazon", pack)).toBeUndefined();
    expect(officialBrandFromClaimedName("US Postal", pack)).toBeUndefined();
    expect(officialBrandFromClaimedName("", pack)).toBeUndefined();
  });
});

describe("riskyActionFromClaim", () => {
  it("keeps only pay, log_in and download, and maps everything else to none", () => {
    expect(riskyActionFromClaim("pay")).toBe("pay");
    expect(riskyActionFromClaim("log_in")).toBe("log_in");
    expect(riskyActionFromClaim("download")).toBe("download");
    expect(riskyActionFromClaim("confirm")).toBe("none");
    expect(riskyActionFromClaim("other")).toBe("none");
    expect(riskyActionFromClaim("none")).toBe("none");
  });
});

describe("buildNextStepPayload", () => {
  it("includes outcome, our headline and action, and never the email body, numbers or sender", () => {
    const payload = buildNextStepPayload(input({ senderDomain: "dhl-parcel-desk.example" }));
    expect(payload).toEqual({
      outcome: "warning",
      headline: "You're not expecting any parcel right now.",
      action: "pay",
    });
    const blob = JSON.stringify(payload);
    expect(blob).not.toContain("GM123456789012345");
    expect(blob).not.toContain("dhl-parcel-desk.example");
    expect(blob).not.toContain("fees@");
    expect(blob).not.toContain("$2.99");
    expect(blob).not.toContain(EMAIL_BODY);
    expect(blob).not.toContain("evil.example");
    const prompt = buildNextStepPrompt(payload, pack);
    expect(prompt).not.toContain("GM123456789012345");
    expect(prompt).not.toContain("dhl-parcel-desk.example");
    expect(prompt).not.toContain(EMAIL_BODY);
  });

  it("omits brand when the claimed name matches the list but the sender is unofficial and the verdict does not name the brand", () => {
    const payload = buildNextStepPayload(input({ senderDomain: "dhl-parcel-desk.example" }));
    expect(payload.brand).toBeUndefined();
    expect(brandForPayload(input({ senderDomain: "dhl-parcel-desk.example" }))).toBeUndefined();
    expect(verdictNamesBrand(VERDICT, "DHL")).toBe(false);
    expect(verdictNamesBrand({ headline: "Warning", reasons: ["See dhl-parcel-desk.example for the fee."] }, "DHL")).toBe(false);
  });

  it("includes the official sender brand when the real From domain is official", () => {
    const payload = buildNextStepPayload(input({ senderDomain: "alerts.ups.com" }));
    expect(payload.brand).toBe("UPS");
  });

  it("includes the claimed official brand only when the verdict text already names it", () => {
    const named = {
      ...VERDICT,
      reasons: ["The email claims to be DHL, but you are not expecting a parcel."],
    };
    expect(buildNextStepPayload(input({ verdict: named, senderDomain: "dhl-parcel-desk.example" })).brand).toBe("DHL");
    expect(verdictNamesBrand(named, "DHL")).toBe(true);
  });
});

describe("validateNextStepAdvice and labels", () => {
  it("accepts plain advice and official-domain links, and labels the source", () => {
    expect(validateNextStepAdvice("Pay fees only on https://www.dhl.com/claim.", pack)).toBe(
      "Pay fees only on https://www.dhl.com/claim.",
    );
    expect(formatNextStepReason("in_cloud", "Pay fees only on dhl.com.")).toBe(
      "Next step written in the cloud: Pay fees only on dhl.com.",
    );
    expect(formatNextStepReason("on_device", "Pay fees only on dhl.com.")).toBe(
      "Next step written on this device: Pay fees only on dhl.com.",
    );
    expect(isNextStepReason("Next step written in the cloud: Pay fees only on dhl.com.")).toBe(true);
    expect(isNextStepReason("A cited number matched a shipment you are expecting.")).toBe(false);
  });

  it("rejects HTML, email addresses, tracking-shaped numbers, and off-list links", () => {
    expect(validateNextStepAdvice("<script>alert(1)</script>", pack)).toBeUndefined();
    expect(validateNextStepAdvice("Write to fees@dhl-parcel-desk.example for help.", pack)).toBeUndefined();
    expect(validateNextStepAdvice("Check tracking 1Z999AA10123456784 on the site.", pack)).toBeUndefined();
    expect(validateNextStepAdvice("Pay at http://evil.example/pay now.", pack)).toBeUndefined();
    expect(validateNextStepAdvice("See [this](https://evil.example/pay).", pack)).toBeUndefined();
    expect(validateNextStepAdvice("   ", pack)).toBeUndefined();
  });

  it("on Warning, rejects a sentence that calls the email genuine or safe, but allows official-site advice", () => {
    expect(validateNextStepAdvice("This email is genuine; you can pay the fee.", pack, "warning")).toBeUndefined();
    expect(validateNextStepAdvice("This is a safe email from DHL.", pack, "warning")).toBeUndefined();
    expect(validateNextStepAdvice("The message looks legitimate, so you can proceed.", pack, "warning")).toBeUndefined();
    expect(softensWarning("This email is not a scam.")).toBe(true);
    const ok = validateNextStepAdvice("Pay fees only on the official DHL website, https://www.dhl.com.", pack, "warning");
    expect(ok).toBe("Pay fees only on the official DHL website, https://www.dhl.com.");
    expect(softensWarning(ok!)).toBe(false);
  });

  it("on a leaked-number Warning, rejects a sentence that treats the unofficial match as Safe", () => {
    const leaked = {
      headline: "This tracking number matches your shipment, but this email is not from the carrier's official domain.",
      reasons: [
        "It cites your real tracking number from an unofficial sender, so the number has likely leaked.",
      ],
    };
    expect(
      validateNextStepAdvice(
        "This tracking number matches a shipment you are expecting.",
        pack,
        "warning",
        leaked,
      ),
    ).toBeUndefined();
    expect(
      validateNextStepAdvice("This email is safe because it cites your tracking number.", pack, "warning", leaked),
    ).toBeUndefined();
    expect(validateNextStepAdvice("This email is from the official carrier.", pack, "warning", leaked)).toBeUndefined();
    expect(softensLeakedNumberWarning("This tracking number matches a shipment you are expecting.")).toBe(true);
    const ok = validateNextStepAdvice(
      "Pay fees only on the official UPS website, https://www.ups.com.",
      pack,
      "warning",
      leaked,
    );
    expect(ok).toBe("Pay fees only on the official UPS website, https://www.ups.com.");
    expect(softensLeakedNumberWarning(ok!)).toBe(false);
  });

  it("drops advice that cannot be cut to the length cap cleanly", () => {
    const long = `${"Please go to the official site and pay there. ".repeat(20)}`;
    expect(long.length).toBeGreaterThan(MAX_ADVICE_CHARS);
    const kept = validateNextStepAdvice(long, pack);
    expect(kept).toBeTruthy();
    expect(kept!.length).toBeLessThanOrEqual(MAX_ADVICE_CHARS);
    expect(kept).toMatch(/official site/);
  });
});

describe("suggestNextStep", () => {
  it("returns a cloud-labelled reason on success, after App Check and the budget", async () => {
    const takeBudget = vi.fn();
    const ensureAppCheck = vi.fn(async () => undefined);
    const result = await suggestNextStep(input(), deps({ takeBudget, ensureAppCheck }));
    expect(ensureAppCheck).toHaveBeenCalledOnce();
    expect(takeBudget).toHaveBeenCalledOnce();
    expect(result).toBe("Next step written in the cloud: Pay DHL fees only on dhl.com, and report a fake at dhl.com.");
  });

  it("labels an on-device inferenceSource on the appended line", async () => {
    const result = await suggestNextStep(
      input(),
      deps({
        generate: async () => ({ text: "Open the UPS app or ups.com to check a fee.", inferenceSource: "on_device" }),
      }),
    );
    expect(result).toBe("Next step written on this device: Open the UPS app or ups.com to check a fee.");
  });

  it("sends the generate call only the redacted payload, never body, numbers or sender", async () => {
    const t = deps();
    await suggestNextStep(input(), t);
    expect(t.generateAdvice).toHaveBeenCalledOnce();
    const sent = t.generateAdvice.mock.calls[0][0];
    const blob = JSON.stringify(sent);
    expect(sent).toMatchObject({ outcome: "warning", action: "pay" });
    expect(sent.brand).toBeUndefined();
    expect(blob).not.toContain("GM123456789012345");
    expect(blob).not.toContain("dhl-parcel-desk.example");
    expect(blob).not.toContain("From:");
  });

  it("shows nothing when the budget is exhausted, without calling the model", async () => {
    const generate = vi.fn();
    const result = await suggestNextStep(
      input(),
      deps({
        takeBudget: () => {
          throw new CloudBudgetError("This session has used its 30 cloud reads.", Number.POSITIVE_INFINITY);
        },
        generate,
      }),
    );
    expect(result).toBeUndefined();
    expect(generate).not.toHaveBeenCalled();
  });

  it("shows nothing when App Check is already blocked, without taking the budget", async () => {
    const takeBudget = vi.fn();
    const generate = vi.fn();
    const result = await suggestNextStep(input(), deps({ cloudBlocked: () => true, takeBudget, generate }));
    expect(result).toBeUndefined();
    expect(takeBudget).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it("shows nothing and blocks the gate when App Check fails", async () => {
    const blockAppCheck = vi.fn();
    const generate = vi.fn();
    const result = await suggestNextStep(
      input(),
      deps({
        ensureAppCheck: async () => {
          throw new Error("Firebase App Check token is invalid.");
        },
        isAppCheckError: () => true,
        blockAppCheck,
        generate,
      }),
    );
    expect(result).toBeUndefined();
    expect(blockAppCheck).toHaveBeenCalledOnce();
    expect(generate).not.toHaveBeenCalled();
  });

  it("shows nothing when a blocked-gate error is thrown while getting the token", async () => {
    const blockAppCheck = vi.fn();
    const result = await suggestNextStep(
      input(),
      deps({
        ensureAppCheck: async () => {
          throw new AppCheckBlockedError();
        },
        blockAppCheck,
      }),
    );
    expect(result).toBeUndefined();
    expect(blockAppCheck).toHaveBeenCalledOnce();
  });

  it("shows nothing on a generate error or timeout, and does not throw", async () => {
    await expect(
      suggestNextStep(
        input(),
        deps({
          generate: async () => {
            throw new Error("model down");
          },
        }),
      ),
    ).resolves.toBeUndefined();
    await expect(
      suggestNextStep(
        input(),
        deps({
          timeoutMs: 20,
          generate: () => new Promise(() => undefined),
        }),
      ),
    ).resolves.toBeUndefined();
    expect(NEXT_STEP_TIMEOUT_MS).toBe(8_000);
    expect(new CloudTimeoutError().message).toBe("The cloud did not answer in time.");
  });

  it("blocks the gate when generateContent fails as App Check", async () => {
    const blockAppCheck = vi.fn();
    const result = await suggestNextStep(
      input(),
      deps({
        isAppCheckError: () => true,
        blockAppCheck,
        generate: async () => {
          throw new Error("Firebase App Check token is invalid.");
        },
      }),
    );
    expect(result).toBeUndefined();
    expect(blockAppCheck).toHaveBeenCalledOnce();
  });

  it("shows nothing when the model output fails validation", async () => {
    const result = await suggestNextStep(
      input(),
      deps({
        generate: async () => ({
          text: "Pay at http://evil.example/pay and quote GM123456789012345.",
          inferenceSource: "in_cloud",
        }),
      }),
    );
    expect(result).toBeUndefined();
  });

  it("shows nothing when Firebase or the cloud is not available", async () => {
    await expect(suggestNextStep(input(), deps({ firebaseConfigured: () => false }))).resolves.toBeUndefined();
    await expect(suggestNextStep(input(), deps({ cloudAvailable: () => false }))).resolves.toBeUndefined();
  });
});
