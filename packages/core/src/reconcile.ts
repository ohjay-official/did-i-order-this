import { extractCandidateNumbers } from "./limitedCheck.ts";
import { normalizeDomain, normalizeTracking } from "./normalize.ts";
import type { EmailClaim } from "./types.ts";

const DOMAIN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export function looksLikeDomain(value: string): boolean {
  return DOMAIN.test(normalizeDomain(value));
}

/**
 * Small models sometimes return a display name ("DHL Express Desk") as the
 * domain, or miss a tracking number that is plainly in the text. Fill those
 * gaps from the email itself, in code, so the verdict does not depend on it:
 * - the claimed domain is always the sender's own domain, read in code from
 *   the address actually used. A domain the model wrote (which text in the
 *   email can steer) is never kept, and when the sender's domain is missing or
 *   not a valid domain the claim has no domain, which the verdict treats as
 *   unofficial;
 * - tracking-shaped numbers found in the text are added if the model left them out.
 * No cited number the model returned is removed.
 */
export function reconcileClaim(claim: EmailClaim, emailText: string, senderDomain: string): EmailClaim {
  const party = { ...claim.claimed_party };
  const sender = normalizeDomain(senderDomain || "");
  if (looksLikeDomain(sender)) {
    party.domain = sender;
  } else {
    delete party.domain;
  }
  const cited = new Set(claim.cited_numbers.map((item) => normalizeTracking(item.value)));
  const extra = extractCandidateNumbers(emailText)
    .filter((value) => !cited.has(value))
    .map((value) => ({ kind: "tracking" as const, value }));
  return { ...claim, claimed_party: party, cited_numbers: [...claim.cited_numbers, ...extra] };
}

const HEADER_LINE = /^[A-Za-z][A-Za-z0-9-]*:/;

/**
 * The From line of the header block only: the lines at the very top of the
 * text, up to the first blank line or the first line that is not a header. A
 * "From:" line further down, inside the body, is ignored.
 */
function headerFromLine(emailText: string): string {
  for (const line of emailText.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!line.trim()) break;
    if (/^\s/.test(line)) continue; // folded header continuation
    if (!HEADER_LINE.test(line)) break;
    if (/^From:/i.test(line)) return line;
  }
  return "";
}

/**
 * The domain of the address the email was really sent from, or "" when there is
 * none. The display name is attacker-chosen text, so quoted names are removed
 * and the last <address> on the line wins: in
 * `From: "UPS <alerts@ups.com>" <billing@ups-release.example>` the sender is
 * ups-release.example.
 */
export function senderDomainFromHeader(emailText: string): string {
  const line = headerFromLine(emailText).replace(/^From:/i, "").replace(/"(?:[^"\\]|\\.)*"/g, " ");
  const angled = [...line.matchAll(/<\s*[^<>@\s]+@([^<>\s]+)\s*>/g)];
  const bare = [...line.matchAll(/[^\s<>@"]+@([^\s<>@"]+)/g)];
  const last = angled.at(-1) ?? bare.at(-1);
  return last?.[1] ? normalizeDomain(last[1]) : "";
}
