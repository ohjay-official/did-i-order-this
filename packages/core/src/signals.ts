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
  /**
   * A demand to call, ring, text or message a phone number, to reply with card
   * digits, a PIN, a code or a date of birth, or to text YES back.
   */
  asksToCall: boolean;
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
  /**
   * Ways to reach or pay someone outside the official site, named in the
   * text even without a demand verb: a phone-shaped number (also spaced or
   * spelled out), an @handle or $cashtag, a messaging app, a payment app or
   * money transfer service, a voucher or gift card, a disguised link
   * ("site[.]com", "site dot com"), card or bank details, a reply with
   * details, or a QR code. Any of them stops Safe.
   */
  offPlatform: string[];
  /** Most of the text, or a whole sentence of it, is not English. The text checks read English only, so it can't be Safe. */
  mostlyNonEnglish: boolean;
  /** Set by the caller (not read from text): hidden text that differs from what is shown. */
  hiddenText?: boolean;
  /** A carrier from the official pack is named in the text. */
  carrierNamed: boolean;
  /** The text holds a carrier-shaped tracking number. */
  carrierTracking: boolean;
}

export const NO_SIGNALS: TextSignals = {
  asksToPay: false,
  asksToLogIn: false,
  asksToDownload: false,
  asksToCall: false,
  parcelFeeLure: false,
  amountDue: false,
  linkHosts: [],
  offPlatform: [],
  mostlyNonEnglish: false,
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
const WWW_HOST = /\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
const EMAIL_HOST = /[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
const BARE_HOST = new RegExp(String.raw`(?<![@\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:${BARE_TLDS}))(?![\w-])`, "gi");

// Any other dotted name whose last label is letters counts too (round 6), unless
// that label is a common file extension, so "ups-customs.pw" or "is.gd/x" is a
// link while "label.pdf" is not. Over-matching only costs Safe, never adds it.
const FILE_EXTS = "pdf|png|jpe?g|gif|webp|svg|bmp|tiff?|heic|docx?|xlsx?|pptx?|odt|rtf|txt|csv|zip|rar|7z|gz|eml|msg|ics|vcf|html?|xml|json|mp[34]|mov|wav";
// Round 7: the last label may hold digits and hyphens as well as letters, so an
// attacker can't slip "evi1.c0m" or "evil.c-om" past the scanner — but it must
// still hold at least one letter, so a price like "1.99" or a version like
// "2.0.1" is not a link. The file-extension list keeps "label.pdf" out too.
// Over-matching only costs Safe, never grants it.
const ANY_HOST = new RegExp(
  String.raw`(?<![@\w.-])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?!(?:${FILE_EXTS})(?![a-z0-9-]))(?=[a-z0-9-]{2,24}(?![\w-]))[a-z0-9]*[a-z][a-z0-9-]*)(?![\w-])`,
  "gi",
);
const IPV4_HOST = /(?<![\w.])(\d{1,3}(?:\.\d{1,3}){3})(?![\w.]*\d)/g;

/** Dots written another way: ideographic and full-width stops, %2e, and " . " between name parts. */
function normaliseDots(text: string): string {
  return text
    .replace(/[。．｡․﹒]/g, ".")
    .replace(/%2e/gi, ".")
    .replace(/(?<=[a-z0-9])[ \t]+\.[ \t]*(?=[a-z0-9])/gi, ".");
}

const FULL_URL = /\b(?:https?|hxxps?):\/\/[^\s<>"')\]]+/gi;

/**
 * A redirect wrapper's real target: Gmail and Google wrap links as
 * google.com/url?q=TARGET (also url= and the googleusercontent image proxy,
 * which puts the target after "#"). Returns the inner URL, or the URL itself
 * when it is not a known wrapper. Wrappers can nest, so this unwraps up to five times.
 */
export function unwrapRedirect(url: string): string {
  let current = url.trim();
  for (let i = 0; i < 5; i++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return current;
    }
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (/^google\.[a-z.]+$/.test(host) && parsed.pathname === "/url") {
      const inner = parsed.searchParams.get("q") ?? parsed.searchParams.get("url");
      if (!inner) return current;
      current = inner;
      continue;
    }
    if (host.endsWith("googleusercontent.com") && /#https?:\/\//i.test(current)) {
      current = current.slice(current.search(/#https?:\/\//i) + 1);
      continue;
    }
    return current;
  }
  return current;
}

/**
 * The host a link, form or image target points at, after unwrapping
 * redirects, lower case and without "www.". A target with no readable web
 * host (javascript:, data:, a broken URL) gives "unreadable-target.invalid",
 * which is outside every list, so it can never help an email to Safe. Plain
 * mailto:, tel: and in-page "#" targets give "".
 */
export function hostOfTarget(target: string): string {
  const raw = target.trim();
  if (!raw || raw.startsWith("#") || /^(?:mailto|tel|sms|cid):/i.test(raw)) return "";
  let parsed: URL;
  try {
    parsed = new URL(unwrapRedirect(raw));
  } catch {
    return "unreadable-target.invalid";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "unreadable-target.invalid";
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
  // A pay-me page anyone can open on paypal.com counts as paypal.me, which is on no list.
  if (host === "paypal.com" && /^\/paypalme(?:\/|$)/i.test(parsed.pathname)) return "paypal.me";
  return host.includes(".") ? host : "unreadable-target.invalid";
}

/** Every host the text links to or names, lower case, without "www.", user info or port. */
export function readLinkHosts(text: string): string[] {
  const hosts = new Set<string>();
  const add = (raw: string) => {
    const host = raw.replace(/^.*@/, "").replace(/:\d+$/, "").toLowerCase().replace(/^www\./, "").replace(/\.+$/, "");
    if (host.includes(".")) hosts.add(host);
  };
  // A google.com/url?q= wrapper counts as the site it sends you to, not as google.com.
  const unwrapped = normaliseDots(text).replace(FULL_URL, (url) => {
    const inner = unwrapRedirect(url);
    return inner === url ? url : ` ${inner} `;
  });
  for (const m of unwrapped.matchAll(FULL_URL)) {
    const hostMatch = /^(?:https?|hxxps?):\/\/([^\s/?#<>"')\]]+)/i.exec(m[0]);
    if (!hostMatch) continue;
    add(hostMatch[1]);
    // Also read the host the way a browser does (it decodes %2E and folds width).
    try {
      const parsed = new URL(m[0].replace(/^hxxp/i, "http")).hostname;
      add(parsed.includes(".") ? parsed : "unreadable-target.invalid");
    } catch {
      add("unreadable-target.invalid");
    }
  }
  for (const m of unwrapped.matchAll(WWW_HOST)) add(m[0]);
  for (const m of unwrapped.matchAll(EMAIL_HOST)) add(m[1]);
  for (const m of unwrapped.matchAll(BARE_HOST)) add(m[1]);
  for (const m of unwrapped.matchAll(ANY_HOST)) add(m[1]);
  for (const m of unwrapped.matchAll(IPV4_HOST)) add(m[1]);
  return [...hosts];
}

/** A money amount in any common form: $5, 5 USD, 4,99 EUR, five dollars. */
const MONEY_ANY = String.raw`(?:[$\u20ac\u00a3]\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:usd|eur|gbp|ngn|cad|aud|dollars?|euros?|pounds?|bucks|quid)\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred)\s+(?:dollars?|euros?|pounds?|bucks|quid)\b)`;
/** Payment apps, transfer services and pay-me links. */
const PAY_RAIL = String.raw`\b(?:zelle|venmo|cash\s?app|bizum|revolut|western\s+union|money\s?gram|remit(?:ly|tance|ted|ting|s)?|paypal\s*\.\s*me|paypal\.com\/paypalme|world\s?remit|skrill|payoneer)\b|(?<![\w$])\$[a-z][a-z0-9_-]{1,19}\b|\b(?:via|through|by|with|using|on|to)\s+wise\b|\bwise\s+(?:transfer|account|app|payment|tag)\b`;
/** Card or bank details, also said the long way round. */
const CARD_OR_BANK = String.raw`\b(?:long\s+)?(?:number|numbers|digits|code)\s+on\s+the\s+(?:front|back|reverse)\b|\b(?:three|3|four|4)\s+(?:digits|numbers)\s+on\s+the\s+back\b|\bcard\s+(?:number|details|info|information|expiry|expiration)\b|\bexpir(?:y|ation)\s+date\b|\bcvv2?\b|\bcvc\b|\bbank(?:ing)?\s+(?:info|information|details|account|login|credentials|number)\b|\brouting\s+number\b|\biban\b|\bsort\s+code\b`;
/** A request to answer by email with personal details, rather than on the official site. */
const REPLY_WITH_DETAILS = String.raw`\bby\s+replying\b|\b(?:reply|respond|write\s+back)\b(?:\s+\S+){0,8}?\s+(?:with|containing|including|and\s+(?:send|share|confirm|attach))\s+(?:your\s+|a\s+|the\s+)?(?:details|information|info|address|full\s+name|name|phone|number|photo|id|copy|passport|licen[cs]e|ssn|social\s+security|bank)`;

/** Phone-shaped numbers: international, (area) code, 0-led national and 3-3-4 forms. Digits glued to a longer number do not count. */
const PHONE_SHAPES = [
  String.raw`(?<![\w+])\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4}(?![\d])`,
  String.raw`(?<![\d][\s.-]?)\(\d{2,5}\)\s?\d{3,4}[\s.-]?\d{3,4}(?![\s.-]?\d)`,
  String.raw`(?<![\d][\s.-]?)(?<![\w])0\d{2,4}[\s.-]\d{3,4}[\s.-]?\d{3,4}(?![\s.-]?\d)`,
  String.raw`(?<![\d][\s.-]?)(?<![\w])1?[\s.-]?\d{3}[\s.-]\d{3}[\s.-]\d{4}(?![\s.-]?\d)`,
  String.raw`\b(?:tel|telephone|phone|mobile|cell|whatsapp|call|ring|text|sms|buzz|number\s+is)\b[^.!?\n]{0,20}?\d{7,15}\b`,
];
const PHONE_SHAPE_RE = new RegExp(PHONE_SHAPES.join("|"), "i");
const DIGIT_WORD = String.raw`(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|double\s+(?:zero|oh|one|two|three|four|five|six|seven|eight|nine))`;
/** Seven or more digits spelled out or spaced one by one: "four four seven seven zero ...". */
const SPELLED_PHONE = new RegExp(String.raw`(?:\b(?:${DIGIT_WORD}|\d)\b[\s,.-]*){7,}`, "i");
const HANDLE = /(?<![\w.@+-])@[a-z0-9_][a-z0-9_.-]{1,30}[a-z0-9_]/i;
const MESSAGING_APP =
  /\b(?:whats\s?app|telegram|wechat|weixin|viber|skype|kakao(?:talk)?|imessage|snapchat)\b|\bsignal\s+(?:app|me|us|messenger|chat)\b|\b(?:on|via|through|over|using|in|add\s+(?:me|us)\s+on)\s+signal\b|\bline\s+(?:app|id|me)\b|\b(?:on|via|through|over|using|add\s+(?:me|us)\s+on)\s+line\b(?!\s+(?:item|items|\d))/i;
const QR_CODE = /\bqr\b/i;
const OBFUSCATED_LINK =
  /\[\s*\.\s*\]|\(\s*\.\s*\)|\{\s*\.\s*\}|[[({]\s*dot\s*[\])}]|\bhxxps?\b|\b[a-z0-9-]{2,}\s+dot\s+(?:com|net|org|info|biz|io|co|uk|me|ly|xyz|top|shop|online|site|app|store|support|help|link|click|live|de|fr|es|ru|cn|in)\b/i;
const VOUCHER = /\bvouchers?\b|\bgift\s*-?cards?\b|\bprepaid\s+cards?\b/i;
const CARD_OR_BANK_RE = new RegExp(CARD_OR_BANK, "i");
const PAY_RAIL_RE = new RegExp(PAY_RAIL, "i");
const WIRE_WORD = /\b(?:wire|bank|money)\s+transfers?\b|\bwire\b/i;

/** Names of what was found, for the reason line. The order is the reading order of the list in the docs. */
export function readOffPlatform(text: string, joined: string, demandFound: (pattern: RegExp) => boolean): string[] {
  const found: string[] = [];
  const either = (re: RegExp) => re.test(text) || re.test(joined);
  if (either(PHONE_SHAPE_RE) || either(SPELLED_PHONE)) found.push("a phone number");
  if (either(HANDLE)) found.push("an @handle");
  if (either(MESSAGING_APP)) found.push("a messaging app");
  if (either(PAY_RAIL_RE) || either(WIRE_WORD)) found.push("a payment app or money transfer");
  if (either(VOUCHER)) found.push("a voucher or gift card");
  if (either(OBFUSCATED_LINK)) found.push("a disguised link");
  if (either(CARD_OR_BANK_RE)) found.push("card or bank details");
  if (demandFound(new RegExp(REPLY_WITH_DETAILS, "gi"))) found.push("a reply with your details");
  if (either(QR_CODE)) found.push("a QR code");
  return found;
}

const ENGLISH_WORDS = new Set(
  "the and to of a an your you is are for on in this that we our it be with has have will at by from or as not can please if was were been here there order parcel package delivery shipped shipment tracking number thank thanks hello dear today tomorrow its it's my me us they their what when how more about all any no yes".split(" "),
);
const FOREIGN_WORDS = new Set(
  "le la les des du et vous votre vos nous pour par est une avec sur dans pas cette veuillez merci colis commande frais je il elle sont aux au ou los las por para usted del que es una su sus pedido envío envio gracias paquete debe mediante señor estimado der das und sie ihr ist mit für nicht bitte ihre ein eine sendung paket zahlen het een van voor niet uw u gli della che sono di il pacco você seu sua não obrigado encomenda pagamento".split(" "),
);

/**
 * True when the text is mostly not English, or holds a sentence that is:
 * more foreign function words than English ones, or mostly letters outside
 * the Latin script. The wording checks read English, so such text can't
 * earn Safe.
 */
export function isMostlyNonEnglish(raw: string): boolean {
  const text = raw.replace(/\b(?:https?|hxxps?):\/\/\S+/gi, " ").replace(/\S+@\S+/g, " ");
  const letters = text.match(/\p{L}/gu) ?? [];
  // Round 7: the 8-letter floor catches short lures ("Zahlen Sie") too, not just full paragraphs.
  if (letters.length >= 8) {
    const latin = text.match(/\p{Script=Latin}/gu) ?? [];
    if (latin.length / letters.length < 0.7) return true;
  }
  const count = (part: string) => {
    let en = 0;
    let other = 0;
    for (const word of part.toLowerCase().match(/\p{L}+(?:'\p{L}+)?/gu) ?? []) {
      if (ENGLISH_WORDS.has(word)) en++;
      else if (FOREIGN_WORDS.has(word)) other++;
    }
    return { en, other };
  };
  const whole = count(text);
  if (whole.other >= 3 && whole.other > whole.en) return true;
  for (const sentence of text.split(/[.!?\n]+/)) {
    const part = count(sentence);
    if (part.other >= 3 && part.other > part.en) return true;
  }
  return false;
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
    String.raw`\b(?:fee|fees|cost|costs|surcharge|levy)\s+(?:applies|apply|will\s+apply|is\s+due|are\s+due|is\s+payable|is\s+required|must\s+be\s+paid)\b`,
    String.raw`\b(?:bank|wire|money)\s+transfer\b`,
    String.raw`\btransfer\s+(?:[$\u20ac\u00a3]|\d|the\s+(?:fee|amount|sum|balance|money|funds)|funds|money|payment)`,
    String.raw`\bwire\s+(?:[$\u20ac\u00a3]|\d|the\s+(?:fee|amount|sum|balance|money|funds)|funds|money|payment)`,
    String.raw`\bgift\s*-?cards?\b`,
    String.raw`\b(?:itunes|google\s+play|steam|amazon)\s+(?:card|voucher|code)s?\b`,
    String.raw`\b(?:bitcoin|btc|crypto|usdt)\b`,
    String.raw`\bto\s+(?:keep|save|secure|release|protect)\s+(?:your|the|this)\s+(?:order|parcel|package|delivery|shipment|item)\b`,
    // Payment apps and money transfer services, and a pay-me link.
    PAY_RAIL,
    // A money amount with a send, transfer or pay verb either side: "send 49.99 USD", "$3 ... venmo".
    String.raw`\b(?:send|transfer|remit|wire|deposit|top\s?-?up|lodge|forward)\b[^.!?\n]{0,40}?${MONEY_ANY}`,
    String.raw`${MONEY_ANY}[^.!?\n]{0,30}?\b(?:by|via|through|using|with|to)\s+(?:zelle|venmo|cash\s?app|bizum|revolut|wise|paypal|western\s+union|moneygram|bank|wire|transfer)\b`,
    String.raw`\b(?:buy|purchase|get)\s+(?:a|an|the|some)?\s*(?:[$\u20ac\u00a3]?\d+\s*)?(?:\w+\s+){0,2}(?:voucher|gift\s*-?card|prepaid\s+card|coupon)s?\b`,
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
    CARD_OR_BANK,
    REPLY_WITH_DETAILS,
    String.raw`\b(?:reply|respond|send|text|tell\s+us|share|provide|give\s+us|enter|type)\b[^.!?\n]{0,50}?\b(?:card\s+(?:number|digits|details)|digits|pin|cvv|cvc|security\s+code|verification\s+code|one-?time\s+(?:code|password|passcode)|otp|passcode|password|date\s+of\s+birth|dob|sort\s+code|account\s+number)\b`,
  ].join("|"),
  "gi",
);
const DOWNLOAD = new RegExp(
  [String.raw`\bdownload\b`, String.raw`\bscan\b[^.!?\n]{0,30}?\b(?:qr|code|barcode)\b`, String.raw`\bopen\s+(?:the\s+|this\s+|your\s+)?(?:attached|attachment|file|invoice|label|form|document|receipt)\b`].join("|"),
  "gi",
);
/** A request to call, ring, text or message back, usually to a number in the email. */
const PHONE = String.raw`\+?\(?\d[\d\s().-]{6,}\d`;
const CALL = new RegExp(
  [
    String.raw`\b(?:call|ring|phone|dial|whatsapp|text|sms|contact|reach)\b(?:\s+\S+){0,6}?\s*(?:on|at|:|-)?\s*${PHONE}`,
    String.raw`\b(?:call|ring|phone|dial)\s+(?:us|our|the|this|that|a)\b[^.!?\n]{0,40}?\b(?:desk|line|team|department|centre|center|hotline|number|helpline|support|agent)\b`,
    String.raw`\b(?:text|reply|sms|send|respond)\s+(?:with\s+)?["'\u201c\u2018]?(?:yes|y|ok|confirm|1)["'\u201d\u2019]?(?=[\s.,!?]|$)`,
    String.raw`\bcharged\b[^.!?\n]{0,80}?\b(?:call|ring|phone|dial|contact|reply|text)\b`,
    // Off-platform contact: a messaging app or an @handle after a contact verb.
    String.raw`\b(?:message|contact|text|chat|reach|add|dm|ping|write\s+to|talk\s+to|speak\s+to|find)\b[^.!?\n]{0,40}?(?:\b(?:whats\s?app|telegram|wechat|viber|signal|line|skype|kakao(?:talk)?)\b|(?<![\w.@+-])@[a-z0-9_])`,
    // A spelled-out number after a call verb: "ring me on four four seven ...".
    String.raw`\b(?:call|ring|phone|dial|text|whatsapp|buzz|reach)\b[^.!?\n]{0,20}?(?:\b(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b[\s,-]+){6,}`,
    String.raw`\bgive\s+(?:me|us)\s+a\s+(?:buzz|ring|call|bell|shout)\b`,
  ].join("|"),
  "gi",
);
const PARCEL_FEE = /\b(?:release|customs|duty|redelivery|re-delivery|clearance|handling|storage|import)\s+(?:fee|fees|charge|charges|payment)\b|\b(?:customs|import)\s+dut(?:y|ies)\b|\bduty\s+(?:is\s+)?(?:due|owed|unpaid)\b/i;

/**
 * A reassurance rather than a demand, only when the negation directly governs
 * the verb: "you do not need to pay", "we will never ask you to log in",
 * "no need to sign in", "thank you for your payment". A negation word further
 * back in the clause ("No worries, simply pay $4.99") does not count, and a
 * condition ("if you do not pay") is still a demand.
 */
const NEGATED_VERB =
  /(?:\b(?:do|does|did|will|would|should|shall|must|can|could|need|may)\s*(?:not|n't)|\b(?:don't|dont|doesn't|doesnt|won't|wont|cannot|can't|cant|never|not)|\bno\s+(?:need|requirement)|\bwithout|\bnothing\s+(?:to|more\s+to))(?:\s+(?:ever|have|need|needs|be|been|required|asked|ask|asks|request|requests|you|to|further|again|anything|separately))*\s*$/i;
const THANKS_FOR = /\b(?:thank\s+you|thanks)\s+for\s+(?:your\s+|the\s+)?$/i;
const CONDITION = /\b(?:if|unless)\b/i;
const COORDINATED = /\s*\b[a-z]+(?:\s+[a-z]+)?\s+(?:or|and|nor)\s*$/i;

function hasDemand(pattern: RegExp, text: string): boolean {
  for (const match of text.matchAll(pattern)) {
    // Look back at most 300 characters: a clause is short, and a whole-prefix scan per match is quadratic (round 6).
    const before = text.slice(Math.max(0, (match.index ?? 0) - 300), match.index);
    const clauseStart = Math.max(...[".", "!", "?", "\n", ":", ";", ","].map((mark) => before.lastIndexOf(mark)));
    let clause = before.slice(clauseStart + 1);
    if (CONDITION.test(clause)) return true;
    // "do not need to pay or sign in": the negation governs every verb in the list.
    for (let i = 0; i < 3 && COORDINATED.test(clause); i++) clause = clause.replace(COORDINATED, " ");
    if (NEGATED_VERB.test(clause) || THANKS_FOR.test(clause)) continue;
    return true;
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
    asksToCall: demand(CALL),
    parcelFeeLure: PARCEL_FEE.test(text) || PARCEL_FEE.test(joined),
    amountDue: hasAmountDue(text),
    // A disguised link ("site[.]com", "site dot com") counts as a link to a site off every list.
    linkHosts: OBFUSCATED_LINK.test(text) || OBFUSCATED_LINK.test(joined) ? [...readLinkHosts(text), "disguised-link.invalid"] : readLinkHosts(text),
    offPlatform: readOffPlatform(text, joined, demand),
    mostlyNonEnglish: isMostlyNonEnglish(emailText.normalize("NFKC")),
    carrierNamed: namesCarrier(text, pack),
    carrierTracking: extractCandidateNumbers(text).some(looksLikeCarrierTracking),
  };
}
