import { findOfficialDomain, looksLikeTracking, normalizeDomain, normalizeTracking } from "./normalize.ts";
import { readTextSignals } from "./signals.ts";
import type { InferenceSourceLabel, LedgerSnapshot, OfficialPack } from "./types.ts";

export interface LimitedCheckResult {
  headline: string;
  findings: string[];
  inferenceSourceLabel: Extract<InferenceSourceLabel, "Limited check (no AI)">;
}

const TOKEN = /[A-Z0-9][A-Z0-9-]{5,30}/gi;

export function extractCandidateNumbers(emailText: string): string[] {
  const matches = emailText.match(TOKEN) ?? [];
  const found = new Set<string>();
  for (const match of matches) {
    if (looksLikeTracking(match)) found.add(normalizeTracking(match));
  }
  return [...found];
}

/**
 * The no-AI check. Findings are ordered by importance, because small screens
 * show only the first few: a fee or risky ask first, then a real tracking
 * number from an unofficial sender, then the domain line, then the numbers.
 */
export function runLimitedCheck(
  emailText: string,
  emailMeta: { fromDomain: string },
  ledger: LedgerSnapshot,
  pack: OfficialPack,
): LimitedCheckResult {
  const lure: string[] = [];
  const leaked: string[] = [];
  const domainLines: string[] = [];
  const numberLines: string[] = [];
  const domain = normalizeDomain(emailMeta.fromDomain || "");
  const official = domain ? findOfficialDomain(pack, domain) : undefined;
  if (domain) {
    if (official) {
      domainLines.push(`The From domain ${domain} is listed as official for ${official.name}.`);
    } else {
      domainLines.push(`The From domain ${domain} is not in the official-domain pack.`);
    }
  } else {
    domainLines.push("No sender domain was available to check against the official-domain pack.");
  }

  const numbers = extractCandidateNumbers(emailText);
  if (numbers.length === 0) {
    numberLines.push("No tracking-like numbers were found in the email text.");
  } else {
    const expected = ledger.shipments
      .filter((item) => item.expected)
      .map((item) => normalizeTracking(item.trackingNumber));
    const all = ledger.shipments.map((item) => normalizeTracking(item.trackingNumber));
    for (const value of numbers) {
      if (expected.includes(value)) {
        numberLines.push(`The number ${value} matches a shipment you are expecting.`);
        if (official?.role !== "carrier") {
          leaked.push(`The email cites your real tracking number ${value} from a sender that is not the carrier's official domain, so the number has likely leaked.`);
        }
      } else if (all.includes(value)) {
        numberLines.push(`The number ${value} is stored on this device, but not as an expected parcel.`);
      } else if (all.length === 0) {
        numberLines.push(`The number ${value} was found in the email. There are no saved tracking numbers on this device to compare.`);
      } else {
        numberLines.push(`The number ${value} does not match a tracking number stored on this device.`);
      }
    }
  }

  // Read from the normalised text in code, the same floors the verdict uses.
  const signals = readTextSignals(emailText, pack);
  for (const template of pack.lureTemplates) {
    let matched = false;
    try {
      matched = new RegExp(template.pattern, "i").test(emailText);
    } catch {
      matched = emailText.toLowerCase().includes(template.pattern.toLowerCase());
    }
    // The official pack patterns may be written against a structured claim.
    // Also count fee or payment demands found in the raw email.
    if (!matched && template.id === "fee-to-release" && (signals.parcelFeeLure || signals.asksToPay)) matched = true;
    if (matched) lure.push(template.note);
  }
  if (signals.asksToLogIn || signals.asksToDownload) {
    lure.push("The wording asks you to log in, sign in or download, which a real delivery or billing notice rarely needs.");
  }

  return {
    headline: "Limited check only. This is not a full verdict.",
    findings: [...lure, ...leaked, ...domainLines, ...numberLines],
    inferenceSourceLabel: "Limited check (no AI)",
  };
}
