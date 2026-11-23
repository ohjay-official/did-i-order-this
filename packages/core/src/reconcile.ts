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
 * "From:" line further down, inside the body, is ignored. The block must hold
 * exactly one From line, written "From: " (as mail clients show it), and the
 * text must not start with a byte-order mark. Anything else (two From lines,
 * "from:" with a tab, a BOM) gives "" and so no domain.
 */
function headerFromLine(emailText: string): string {
  if (emailText.startsWith("\uFEFF")) return "";
  const fromLines: string[] = [];
  for (const line of emailText.split(/\r?\n/)) {
    if (!line.trim()) break;
    if (/^\s/.test(line)) continue; // folded header continuation
    if (!HEADER_LINE.test(line)) break;
    if (/^from\s*:/i.test(line)) fromLines.push(line);
  }
  if (fromLines.length !== 1) return "";
  return fromLines[0].startsWith("From: ") ? fromLines[0] : "";
}

/** Removes RFC 5322 comments, "(...)", including nested ones. Returns null if parentheses do not balance. */
function stripComments(value: string): string | null {
  let out = "";
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === "\\" && depth > 0) {
      i++;
      continue;
    }
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      if (depth === 0) return null;
      depth--;
      if (depth === 0) out += " ";
      continue;
    }
    if (depth === 0) out += ch;
  }
  return depth === 0 ? out : null;
}

/**
 * The domain of the address the email was really sent from, or "" when that
 * cannot be told for sure. The display name and comments are attacker-chosen
 * text, so quoted strings ("...") and comments in parentheses (nested and
 * repeated) are removed first. Exactly one address must be left:
 * `From: "UPS <alerts@ups.com>" <billing@ups-release.example>` gives
 * ups-release.example, while `From: UPS <alerts@ups.com> <billing@ups-release.example>`
 * holds two addresses and gives "" (which the verdict treats as unofficial).
 * Group syntax, a second From line or a byte-order mark also give "".
 * A domain read from pasted text is still only what the text says: the verdict
 * never gives Safe to pasted text (see VerdictOptions.senderCheck).
 * The web paste paths, the limited check and readClaim all use this parser.
 */
export function senderDomainFromHeader(emailText: string): string {
  const raw = headerFromLine(emailText).replace(/^From:/i, "");
  const unquoted = raw.replace(/"(?:[^"\\]|\\.)*"/g, " ");
  const line = stripComments(unquoted);
  if (line === null || line.includes('"')) return "";
  // Group syntax ("UPS: <a@ups.com>;") and address lists are not one sender.
  if (/[:;]/.test(line)) return "";
  const angled = [...line.matchAll(/<\s*([^<>@\s]+)@([^<>\s]+?)\s*>/g)];
  const rest = line.replace(/<[^<>]*>/g, " ");
  if (/[<>]/.test(rest)) return "";
  const bare = [...rest.matchAll(/[^\s<>@,;]+@([^\s<>@,;]+)/g)];
  const domains = [...angled.map((m) => m[2]), ...bare.map((m) => m[1])];
  if (domains.length !== 1) return "";
  return normalizeDomain(domains[0]);
}
