import { extractCandidateNumbers } from "./limitedCheck.ts";
import { looksLikeCarrierTracking } from "./normalize.ts";
import type { OfficialPack } from "./types.ts";

/**
 * Facts read from the raw email text in code, with no model involved. The
 * verdict uses them as floors, so a model that mislabels the claim (or is told
 * to by text inside the email) cannot turn a fee lure into a neutral or safe
 * result.
 */
export interface TextSignals {
  /** A demand to pay: "pay the fee", "pay $2.99", "pay now". */
  asksToPay: boolean;
  /** A demand to log in or confirm an account. */
  asksToLogIn: boolean;
  /** A demand to download or open a file. */
  asksToDownload: boolean;
  /** Parcel-hold wording: a release, customs, duty or redelivery fee. */
  parcelFeeLure: boolean;
  /** A carrier from the official pack is named in the text. */
  carrierNamed: boolean;
  /** The text holds a carrier-shaped tracking number. */
  carrierTracking: boolean;
}

export const NO_SIGNALS: TextSignals = {
  asksToPay: false,
  asksToLogIn: false,
  asksToDownload: false,
  parcelFeeLure: false,
  carrierNamed: false,
  carrierTracking: false,
};

const PAY = /\bpay(?:\s+(?:the|a|an|your|this|our|now|today|online|here|immediately|within|by|\$|€|£|usd|eur|gbp)\b|\s*[$€£]|\s+\d)/i;
const LOG_IN = /\b(?:log|sign)\s?-?in\s+(?:to|at|here|now|below|using|with)\b|\bverify\s+your\s+(?:account|identity|payment|card|details)\b|\bconfirm\s+your\s+(?:account|identity|password|payment|card|details)\b|\benter\s+your\s+(?:password|card)\b/i;
const DOWNLOAD = /\b(?:download|open)\s+(?:the|this|your)\s+(?:attached|attachment|file|invoice|label|form|document|receipt)\b|\bdownload\s+(?:the|this|your)\b/i;
const PARCEL_FEE = /\b(?:release|customs|duty|redelivery|re-delivery|clearance|handling|storage|import)\s+(?:fee|fees|charge|charges|payment)\b|\b(?:customs|import)\s+dut(?:y|ies)\b|\bduty\s+(?:is\s+)?(?:due|owed|unpaid)\b/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function carrierNames(pack: OfficialPack): string[] {
  return [...new Set(pack.officialDomains.filter((entry) => entry.role === "carrier").map((entry) => entry.name))];
}

export function namesCarrier(text: string, pack: OfficialPack): boolean {
  return carrierNames(pack).some((name) => new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(text));
}

export function readTextSignals(emailText: string | undefined, pack: OfficialPack): TextSignals {
  if (!emailText) return NO_SIGNALS;
  return {
    asksToPay: PAY.test(emailText),
    asksToLogIn: LOG_IN.test(emailText),
    asksToDownload: DOWNLOAD.test(emailText),
    parcelFeeLure: PARCEL_FEE.test(emailText),
    carrierNamed: namesCarrier(emailText, pack),
    carrierTracking: extractCandidateNumbers(emailText).some(looksLikeCarrierTracking),
  };
}
