import { looksLikeTracking, normalizeDomain, normalizeTracking } from "./normalize.ts";
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

export function runLimitedCheck(
  emailText: string,
  emailMeta: { fromDomain: string },
  ledger: LedgerSnapshot,
  pack: OfficialPack,
): LimitedCheckResult {
  const findings: string[] = [];
  const domain = normalizeDomain(emailMeta.fromDomain || "");
  if (domain) {
    const official = pack.officialDomains.find((entry) => normalizeDomain(entry.domain) === domain);
    if (official) {
      findings.push(`The From domain ${domain} is listed as official for ${official.name}.`);
    } else {
      findings.push(`The From domain ${domain} is not in the official-domain pack.`);
    }
  } else {
    findings.push("No sender domain was available to check against the official-domain pack.");
  }

  const numbers = extractCandidateNumbers(emailText);
  if (numbers.length === 0) {
    findings.push("No tracking-like numbers were found in the email text.");
  } else {
    const expected = ledger.shipments
      .filter((item) => item.expected)
      .map((item) => normalizeTracking(item.trackingNumber));
    const all = ledger.shipments.map((item) => normalizeTracking(item.trackingNumber));
    for (const value of numbers) {
      if (expected.includes(value)) {
        findings.push(`The number ${value} matches a shipment you are expecting.`);
      } else if (all.includes(value)) {
        findings.push(`The number ${value} is in your ledger, but not as an expected parcel.`);
      } else if (all.length === 0) {
        findings.push(`The number ${value} was found in the email. Your ledger has no saved tracking numbers to compare.`);
      } else {
        findings.push(`The number ${value} does not match a tracking number in your ledger.`);
      }
    }
  }

  const blob = emailText.toLowerCase();
  for (const lure of pack.lureTemplates) {
    let matched = false;
    try {
      matched = new RegExp(lure.pattern, "i").test(emailText);
    } catch {
      matched = blob.includes(lure.pattern.toLowerCase());
    }
    // The official pack patterns may be written against a structured claim.
    // Also look for plain fee-to-release wording in the raw email.
    if (!matched && /pay|release fee|customs|duty/.test(blob) && lure.id === "fee-to-release") {
      matched = true;
    }
    if (matched) findings.push(lure.note);
  }

  return {
    headline: "Limited check only. This is not a full verdict.",
    findings,
    inferenceSourceLabel: "Limited check (no AI)",
  };
}
