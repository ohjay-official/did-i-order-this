import { extractCandidateNumbers } from "./limitedCheck.ts";
import { normalizeDomain, normalizeTracking } from "./normalize.ts";
import type { EmailClaim } from "./types.ts";

const DOMAIN = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function looksLikeDomain(value: string): boolean {
  return DOMAIN.test(normalizeDomain(value));
}

/**
 * Small models sometimes return a display name ("DHL Express Desk") as the
 * domain, or miss a tracking number that is plainly in the text. Fill those
 * gaps from the email itself, in code, so the verdict does not depend on it:
 * - the sender's own domain (from the From line) is used as the claimed domain
 *   when there is one, so a body that only claims "ups.com" cannot borrow
 *   the official domain; a non-domain value with no sender is dropped;
 * - tracking-shaped numbers found in the text are added if the model left them out.
 * No cited number the model returned is removed.
 */
export function reconcileClaim(claim: EmailClaim, emailText: string, senderDomain: string): EmailClaim {
  const party = { ...claim.claimed_party };
  const sender = normalizeDomain(senderDomain || "");
  if (looksLikeDomain(sender)) {
    party.domain = sender;
  } else if (party.domain && !looksLikeDomain(party.domain)) {
    delete party.domain;
  }
  const cited = new Set(claim.cited_numbers.map((item) => normalizeTracking(item.value)));
  const extra = extractCandidateNumbers(emailText)
    .filter((value) => !cited.has(value))
    .map((value) => ({ kind: "tracking" as const, value }));
  return { ...claim, claimed_party: party, cited_numbers: [...claim.cited_numbers, ...extra] };
}

/** The domain of the address on the From line only, or "" when there is none. */
export function senderDomainFromHeader(emailText: string): string {
  const line = emailText.match(/^From:[^\n]*$/im)?.[0] ?? "";
  const address = line.match(/<[^<>@\s]+@([^<>\s]+)>/) ?? line.match(/[^\s<>@]+@([^\s<>]+)/);
  return address?.[1] ? normalizeDomain(address[1]) : "";
}
