import type { EmailClaim, InferenceSourceValue } from "@did-i-order-this/core";
import type { ReadClaimMode } from "../ai/readClaim.ts";
import { describeAiError } from "../ai/aiError.ts";
import type { SampleThread } from "../demo/seed.ts";
import { chooseInferenceMode } from "../consent.ts";

/**
 * The order of one check in the sample inbox, with no DOM in it:
 * on-device first, then cloud only after consent, and for sample threads a
 * labelled prepared claim whenever AI did not run. Pasted emails without a
 * prepared claim keep the limited check.
 */

export const SAMPLE_NOTE =
  "On-device AI did not run in this browser. This check used the structured claim prepared for this sample thread.";
export const NOT_SENT_NOTE = "The email was not sent to the cloud.";

export type SampleFallbackReason = "not_configured" | "no_cloud" | "declined" | "cloud_failed";

export type CheckFlowResult =
  | { kind: "ai"; claim: EmailClaim; inferenceSource: InferenceSourceValue; usedRememberedConsent: boolean }
  | { kind: "sample"; claim: EmailClaim; reason: SampleFallbackReason; detail: string }
  | { kind: "limited" }
  | { kind: "error"; message: string; canLimited: true };

export interface CheckFlowDeps {
  readClaim: (text: string, mode: ReadClaimMode) => Promise<{ claim: EmailClaim; inferenceSource: InferenceSourceValue }>;
  firebaseConfigured: () => boolean;
  cloudAvailable: () => boolean;
  askForCloudConsent: () => Promise<boolean>;
  consentMemory: { has(): boolean; remember(): void };
  /** Called once the judge has agreed (or a remembered yes applies) and the cloud read starts. */
  onCloudStart?: () => void;
  warn?: (message: string, error: unknown) => void;
}

function sample(thread: SampleThread, reason: SampleFallbackReason, detail = ""): CheckFlowResult {
  return { kind: "sample", claim: thread.expectedClaim, reason, detail };
}

export async function runCheckFlow(
  email: { text: string; sample?: SampleThread },
  deps: CheckFlowDeps,
): Promise<CheckFlowResult> {
  const thread = email.sample;

  if (!deps.firebaseConfigured()) {
    return thread ? sample(thread, "not_configured") : { kind: "limited" };
  }

  try {
    const first = await deps.readClaim(email.text, "only_on_device");
    return { kind: "ai", claim: first.claim, inferenceSource: first.inferenceSource, usedRememberedConsent: false };
  } catch {
    // Continue to cloud consent or the prepared-claim fallback.
  }

  if (!deps.cloudAvailable()) {
    return thread ? sample(thread, "no_cloud") : { kind: "limited" };
  }

  // A remembered yes covers sample threads only. A pasted email is the
  // person's own mail, so it is always asked about before it leaves the device.
  const remembered = Boolean(thread) && deps.consentMemory.has();
  if (!remembered) {
    const mode = await chooseInferenceMode(false, deps.askForCloudConsent);
    if (mode === "cancelled") {
      if (thread) return sample(thread, "declined", NOT_SENT_NOTE);
      return { kind: "error", message: `The AI read could not run. ${NOT_SENT_NOTE}`, canLimited: true };
    }
    deps.consentMemory.remember();
  }

  deps.onCloudStart?.();
  try {
    const second = await deps.readClaim(email.text, "only_in_cloud");
    return {
      kind: "ai",
      claim: second.claim,
      inferenceSource: second.inferenceSource,
      usedRememberedConsent: remembered,
    };
  } catch (cloudError) {
    deps.warn?.("Cloud read failed", cloudError);
    const reason = describeAiError(cloudError);
    if (thread) return sample(thread, "cloud_failed", `The cloud check could not run. ${reason}`);
    return { kind: "error", message: `The AI read could not run. ${reason}`, canLimited: true };
  }
}
