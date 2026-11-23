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
  /** A demand to pay: "pay the fee", "pay $2.99", "payment of", "settle", "outstanding balance". */
  asksToPay: boolean;
  /** A demand to log in or sign in, or to verify or update account or card details. */
  asksToLogIn: boolean;
  /** A demand to download something or open an attachment. */
  asksToDownload: boolean;
  /** Parcel-hold wording: a release, customs, duty or redelivery fee. */
  parcelFeeLure: boolean;
  /**
   * A non-zero money amount next to "needed", "required", "due", "cover",
   * "adjustment", "remaining", "balance", "outstanding" or "owed", or
   * "cover ... cost/fee": a softer way to ask for money.
   */
  amountDue: boolean;
  /** Hosts the text links to or names: URLs, www. names, email addresses and bare domain names. */
  linkHosts: string[];
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
  amountDue: false,
  linkHosts: [],
  carrierNamed: false,
  carrierTracking: false,
};

/**
 * Common Cyrillic and Greek letters that look like Latin ones. Scam text uses
 * them so "pay" no longer matches a plain regex (a Cyrillic \u0430 in place of "a").
 */
const LOOKALIKES: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x",
  "\u0456": "i", "\u0458": "j", "\u0455": "s", "\u0501": "d", "\u04cf": "l", "\u043a": "k", "\u043c": "m",
  "\u043d": "h", "\u0442": "t", "\u0432": "b", "\u0261": "g",
  "\u0410": "a", "\u0415": "e", "\u041e": "o", "\u0420": "p", "\u0421": "c", "\u0423": "y", "\u0425": "x",
  "\u0406": "i", "\u0408": "j", "\u0405": "s", "\u041a": "k", "\u041c": "m", "\u041d": "h", "\u0422": "t", "\u0412": "b",
  "\u03b1": "a", "\u03bf": "o", "\u03c1": "p", "\u03b5": "e", "\u03b9": "i", "\u03ba": "k", "\u03bd": "v",
  "\u03c4": "t", "\u03c5": "u", "\u03c7": "x", "\u03b3": "y", "\u03b7": "n",
  "\u0391": "a", "\u0392": "b", "\u0395": "e", "\u0396": "z", "\u0397": "h", "\u0399": "i", "\u039a": "k",
  "\u039c": "m", "\u039d": "n", "\u039f": "o", "\u03a1": "p", "\u03a4": "t", "\u03a5": "y", "\u03a7": "x",
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "g");

/**
 * The text the signal patterns read: Unicode NFKC (so full-width and styled
 * letters become plain ones), with zero-width, bidi and other format
 * characters removed, Cyrillic and Greek lookalikes folded to Latin, and
 * runs of spaces collapsed.
 */
export function normalizeForSignals(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(LOOKALIKE_RE, (ch) => LOOKALIKES[ch] ?? ch)
    .replace(/[^\S\n]+/g, " ");
}

/**
 * The same text with letter-spaced words joined: "p a y" and "p\u00b7ay"
 * become "pay". Runs of single letters split by spaces are joined, and a
 * single letter followed by a dot-like separator is joined to what follows.
 */
export function joinSpacedLetters(text: string): string {
  const runs = text.replace(/\b[a-z](?:[ \t\u00b7\u2022.\-_]+[a-z]\b){2,}/gi, (run) => run.replace(/[ \t\u00b7\u2022.\-_]+/g, ""));
  return runs.replace(/\b([a-z])[\u00b7\u2022._-]+(?=[a-z])/gi, "$1");
}

const MONEY = String.raw`(?:[$\u20ac\u00a3]\s?(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s?(?:usd|eur|gbp|dollars?|euros?|pounds?)\b)`;
const DUE_WORD = String.raw`\b(?:needed|required|due|cover|adjustment|remaining|balance|outstanding|owed|owing)\b`;
const AMOUNT_NEAR = new RegExp(`${MONEY}[^.!?\n]{0,40}?${DUE_WORD}|${DUE_WORD}[^.!?\n]{0,40}?${MONEY}`, "gi");
const COVER_COST = /\bcover\b[^.!?\n]{0,40}?\b(?:cost|costs|fee|fees|charge|charges|shipping|postage|delivery)\b/i;

function isZero(amount: string | undefined): boolean {
  return amount !== undefined && Number(amount.replace(",", ".")) === 0;
}

function hasAmountDue(text: string): boolean {
  if (COVER_COST.test(text)) return true;
  for (const match of text.matchAll(AMOUNT_NEAR)) {
    const amount = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (!isZero(amount)) return true;
  }
  return false;
}

// Bare names are counted only with common or reserved top-level domains, so a
// file name like label.pdf or a price like 1.99 is not taken for a link.
const BARE_TLDS =
  "com|net|org|info|biz|io|co|uk|de|us|eu|fr|nl|es|it|ca|au|ru|cn|in|me|ly|link|click|live|xyz|top|shop|online|site|app|store|support|help|delivery|parcel|express|services|example|test|invalid";
const URL_HOST = /\b(?:https?|hxxps?):\/\/([^\s/?#<>"')\]]+)/gi;
const WWW_HOST = /\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const EMAIL_HOST = /[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
const BARE_HOST = new RegExp(String.raw`(?<![@\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${BARE_TLDS}))(?![\w-])`, "gi");

/** Every host the text links to or names, lower case, without "www.", user info or port. */
export function readLinkHosts(text: string): string[] {
  const hosts = new Set<string>();
  const add = (raw: string) => {
    const host = raw.replace(/^.*@/, "").replace(/:\d+$/, "").toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
    if (host.includes(".")) hosts.add(host);
  };
  for (const m of text.matchAll(URL_HOST)) add(m[1]);
  for (const m of text.matchAll(WWW_HOST)) add(m[0]);
  for (const m of text.matchAll(EMAIL_HOST)) add(m[1]);
  for (const m of text.matchAll(BARE_HOST)) add(m[1]);
  return [...hosts];
}

const PAY = new RegExp(
  [
    String.raw`\bpay(?:\s+(?:the|a|an|your|this|our|now|today|online|here|immediately|within|by|\$|€|£|usd|eur|gbp)\b|\s*[$€£]|\s+\d)`,
    String.raw`\bpayable\b`,
    String.raw`\bpaying\b`,
    String.raw`\bpayment\s+(?:of|(?:is\s+|was\s+)?(?:required|needed|due|failed|declined|overdue|pending|outstanding|unsuccessful))\b`,
    String.raw`\b(?:make|complete|submit|send|confirm|authori[sz]e|update)\s+(?:a\s+|the\s+|your\s+)?payment\b`,
    String.raw`\bsettle\b`,
    String.raw`\boutstanding\s+(?:balance|amount|fee|fees|charge|charges|payment|sum)\b`,
    String.raw`\b(?:a|the|this)\s+(?:\w+\s+)?charges?\s+of\b`,
    String.raw`\bcharges?\s+(?:apply|applies|is\s+due|are\s+due|due|outstanding|pending)\b`,
  ].join("|"),
  "gi",
);
const LOG_IN = new RegExp(
  [
    String.raw`\blog\s?-?(?:in|on)\b`,
    String.raw`\blogin\b`,
    String.raw`\bsign\s?-?(?:in|on)\b`,
    String.raw`\bverify\s+your\s+(?:account|identity|payment|card|details|email|address)\b`,
    String.raw`\bconfirm\s+your\s+(?:account|identity|password|payment|card|details|billing)\b`,
    String.raw`\benter\s+your\s+(?:password|card|pin)\b`,
    String.raw`\bupdate\s+your\s+(?:card|payment|billing|bank|account)\s+(?:details|information|info|method)\b`,
  ].join("|"),
  "gi",
);
const DOWNLOAD = new RegExp(
  [String.raw`\bdownload\b`, String.raw`\bopen\s+(?:the\s+|this\s+|your\s+)?(?:attached|attachment|file|invoice|label|form|document|receipt)\b`].join("|"),
  "gi",
);
const PARCEL_FEE = /\b(?:release|customs|duty|redelivery|re-delivery|clearance|handling|storage|import)\s+(?:fee|fees|charge|charges|payment)\b|\b(?:customs|import)\s+dut(?:y|ies)\b|\bduty\s+(?:is\s+)?(?:due|owed|unpaid)\b/i;

/**
 * Words just before a match, in the same clause, that turn it into a
 * reassurance rather than a demand: "you do not need to pay or sign in",
 * "thank you for your payment", "we will never ask you to log in". A
 * condition ("if you do not pay") is still a demand.
 */
const NEGATION = /\b(?:not|never|no|don't|dont|won't|wont|without|nothing|thank\s+you\s+for|thanks\s+for)\b/i;
const CONDITION = /\b(?:if|unless)\b/i;
const NEGATION_WINDOW_WORDS = 6;

function hasDemand(pattern: RegExp, text: string): boolean {
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(0, match.index);
    const clauseStart = Math.max(...[".", "!", "?", "\n", ":", ";", ","].map((mark) => before.lastIndexOf(mark)));
    const words = before.slice(clauseStart + 1).trim().split(/\s+/);
    const near = words.slice(-NEGATION_WINDOW_WORDS).join(" ");
    if (!NEGATION.test(near) || CONDITION.test(near)) return true;
  }
  return false;
}

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
  const text = normalizeForSignals(emailText);
  // Patterns also run on a copy with letter-spaced words joined ("p a y").
  const joined = joinSpacedLetters(text);
  const demand = (pattern: RegExp) => hasDemand(pattern, text) || (joined !== text && hasDemand(pattern, joined));
  return {
    asksToPay: demand(PAY),
    asksToLogIn: demand(LOG_IN),
    asksToDownload: demand(DOWNLOAD),
    parcelFeeLure: PARCEL_FEE.test(text) || PARCEL_FEE.test(joined),
    amountDue: hasAmountDue(text),
    linkHosts: readLinkHosts(text),
    carrierNamed: namesCarrier(text, pack),
    carrierTracking: extractCandidateNumbers(text).some(looksLikeCarrierTracking),
  };
}
