import {
  findOfficialDomain,
  inferCarrierFromTracking,
  isFreeMailDomain,
  looksLikeTracking,
  normalizeDomain,
  normalizeOrderId,
  normalizeTracking,
} from "./normalize.ts";
import { carrierNames, readTextSignals, type TextSignals } from "./signals.ts";
import { isExpectedShipment } from "./expected.ts";
import {
  LOOKALIKE_MATCH_HEADLINE,
  NOTHING_EXPECTED_HEADLINE,
  type EmailClaim,
  type InferenceSourceLabel,
  type InferenceSourceValue,
  type LedgerOrder,
  type LedgerSender,
  type LedgerShipment,
  type LedgerSnapshot,
  type NumberKind,
  type OfficialPack,
  type Verdict,
} from "./types.ts";

export function hasExpectedParcel(ledger: { shipments: LedgerShipment[] }): boolean {
  return ledger.shipments.some((shipment) => isExpectedShipment(shipment));
}

export function labelForSource(source?: InferenceSourceValue): InferenceSourceLabel {
  if (source === "on_device") return "Checked on this device";
  if (source === "in_cloud") return "Checked in the cloud";
  return "Check not completed";
}

export function isCarrierClaim(claim: EmailClaim, pack: OfficialPack): boolean {
  if (claim.claimed_party.role === "carrier") return true;
  const name = claim.claimed_party.name.trim().toLowerCase();
  if (name && carrierNames(pack).some((carrier) => new RegExp(`\\b${carrier.toLowerCase()}\\b`).test(name))) return true;
  if (claim.email_kind === "carrier_update") return true;
  if (claim.email_kind === "delivery_problem") {
    const domain = claim.claimed_party.domain;
    if (!domain) return false;
    const official = findOfficial(pack, domain);
    return official?.role === "carrier";
  }
  return false;
}

export const findOfficial = findOfficialDomain;

function lureApplies(claim: EmailClaim, appliesTo: OfficialPack["lureTemplates"][number]["appliesTo"]): boolean {
  if (!appliesTo) return true;
  return Boolean(
    appliesTo.roles?.includes(claim.claimed_party.role) || appliesTo.kinds?.includes(claim.email_kind),
  );
}

/**
 * Asks that a real notice rarely needs: money, a login, or a download. Read
 * in code from the email text (fee, payment, login and download wording, and
 * a money amount said to be due), and also from the model's label, which can
 * only add to it: a model that labels a fee demand "none" does not hide it.
 */
function asksForRiskyAction(claim: EmailClaim, signals: TextSignals = NO_TEXT): boolean {
  return (
    claim.asked_action === "pay" ||
    claim.asked_action === "log_in" ||
    claim.asked_action === "download" ||
    textAsksRisky(signals)
  );
}

/** The code-detected part only: no model label involved. */
export function textAsksRisky(signals: TextSignals): boolean {
  return (
    signals.asksToPay ||
    signals.asksToLogIn ||
    signals.asksToDownload ||
    signals.asksToCall ||
    signals.parcelFeeLure ||
    signals.amountDue ||
    Boolean(signals.hiddenText)
  );
}

/**
 * The signals the verdict reads: the text signals, plus link, image and form
 * targets the caller read from the email's markup (the Chrome extension reads
 * them from Gmail), plus hidden text the caller found.
 */
export function signalsForVerdict(options: VerdictOptions, pack: OfficialPack): TextSignals {
  const base = readTextSignals(options.emailText, pack);
  const extra = (options.linkHosts ?? []).map((host) => host.toLowerCase()).filter(Boolean);
  return {
    ...base,
    linkHosts: [...new Set([...base.linkHosts, ...extra])],
    hiddenText: Boolean(options.hiddenText),
  };
}

/**
 * The stricter test used before an order match may give Safe: any risky ask
 * from the model or the text, a "confirm" label, or parcel-fee wording.
 */
function storeAsksRisky(claim: EmailClaim, signals: TextSignals): boolean {
  return asksForRiskyAction(claim, signals) || claim.asked_action === "confirm";
}

/** Hosts in the text that are neither the given domain (or its subdomains) nor an official pack domain. */
function outsideHosts(signals: TextSignals, pack: OfficialPack, ownDomain?: string): string[] {
  return signals.linkHosts.filter((host) => {
    if (ownDomain && sameSender(host, ownDomain)) return false;
    return !findOfficial(pack, host);
  });
}

/**
 * Hosts a Safe may not link to: for a parcel, anything but the sender's own
 * domain and other domains of the same carrier; for an order, anything but
 * the store's own domain. Official domains of someone else count too: a
 * ups.com email has no reason to link to paypal.com or dhl.com.
 */
function notOwnHosts(signals: TextSignals, pack: OfficialPack, senderDomain: string | undefined, parcel: boolean): string[] {
  const sender = senderDomain ? findOfficial(pack, senderDomain) : undefined;
  return signals.linkHosts.filter((host) => {
    if (senderDomain && sameSender(host, senderDomain)) return false;
    if (parcel && sender?.role === "carrier") {
      const other = findOfficial(pack, host);
      if (other?.role === "carrier" && namesSameCarrier(sender.name, other.name)) return false;
    }
    return true;
  });
}

/** Common long names for carriers in order files and shipment records. */
const CARRIER_ALIASES: Record<string, string> = {
  "united parcel service": "ups",
  "federal express": "fedex",
  "united states postal service": "usps",
  "us postal service": "usps",
  "u.s. postal service": "usps",
  "deutsche post": "dhl",
  hermes: "evri",
};

function carrierKey(name: string | undefined): string {
  const n = (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!n) return "";
  for (const [alias, key] of Object.entries(CARRIER_ALIASES)) if (n.includes(alias)) return key;
  return n;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "DHL" names the same carrier as "DHL Express"; "DPD" does not name "UPS". */
function namesSameCarrier(official: string, other: string | undefined): boolean {
  const a = carrierKey(official);
  const b = carrierKey(other);
  if (!a || !b) return false;
  return a === b || new RegExp(`(^|[^a-z0-9])${escapeRegExp(a)}([^a-z0-9]|$)`).test(b);
}

type CarrierSender = "same_carrier" | "other_official" | "unknown_carrier" | "unofficial";

/**
 * Whether the sender is the official domain of the carrier that holds this
 * parcel: the carrier stored with the shipment, and the carrier its number
 * implies (1Z means UPS), whichever are known. Any official carrier domain is
 * not enough: a dpd.com sender cannot vouch for a UPS parcel.
 */
function carrierSender(claim: EmailClaim, pack: OfficialPack, shipment: LedgerShipment): CarrierSender {
  const domain = claim.claimed_party.domain;
  const official = domain ? findOfficial(pack, domain) : undefined;
  if (!official || official.role !== "carrier") return "unofficial";
  const stored = shipment.carrier?.trim();
  const implied = inferCarrierFromTracking(shipment.trackingNumber);
  if (!stored && !implied) return "unknown_carrier";
  if (stored && !namesSameCarrier(official.name, stored)) return "other_official";
  if (implied && !namesSameCarrier(official.name, implied)) return "other_official";
  return "same_carrier";
}

export const LEAKED_NUMBER_REASON =
  "It cites your real tracking number from an unofficial sender, so the number has likely leaked. Use the carrier's own app or site instead of this email.";
export const RISKY_ORDER_MATCH_HEADLINE =
  "This order number matches your order, but this email asks you to pay, log in or download, or links to another site.";
export const OFFICIAL_RISKY_HEADLINE =
  "This parcel is yours, but this email asks you to pay, log in or download. Do that only in the carrier's own app.";
export const OFFICIAL_RISKY_REASON =
  "It asks you to pay, log in or download. The carrier's own app or site is the place to do that, even when the email looks right.";
export const OFFICIAL_LINK_HEADLINE =
  "This parcel is yours, but this email links to a site that is not the carrier's. Open the parcel in the carrier's own app.";
export const UNKNOWN_CARRIER_HEADLINE =
  "This tracking number matches your parcel, but its carrier is not on record, so the sender cannot be checked against it.";
export const FREE_MAIL_ORDER_HEADLINE =
  "This order number is in your stored orders, but it was sent from a free email address that anyone can use.";
export const PASTED_PARCEL_HEADLINE =
  "This number matches your parcel, but a pasted email can't prove who sent it. Open your parcel in the carrier's app.";
export const PASTED_ORDER_HEADLINE =
  "This number matches your order, but a pasted email can't prove who sent it. Open your order on the store's own site.";
export const PASTED_SENDER_REASON =
  "The sender in pasted text is whatever the text says, so it cannot be verified. Only a sender the app reads itself (the Chrome extension in Gmail, or a built-in sample) can give Safe.";
export const MIXED_PARCEL_HEADLINE =
  "This number matches your parcel, but this thread has messages from more than one sender, so it can't be Safe. Open the parcel in the carrier's app.";
export const MIXED_ORDER_HEADLINE =
  "This number matches your order, but this thread has messages from more than one sender, so it can't be Safe. Open the order on the store's own site.";
export const MIXED_SENDER_REASON =
  "The open Gmail thread mixes messages from different senders, so the first sender cannot vouch for the rest. Open the newest message on its own.";
export const ORDER_FROM_OTHER_SENDER_HEADLINE =
  "This order number is in your stored orders, but this email is not from that store's domain.";
export const ORDER_FROM_OTHER_SENDER_REASON =
  "It cites your real order number from a different sender, so the number has likely leaked. Use the store's own site or app instead of this email.";
export const RISKY_ORDER_REASON =
  "It asks you to pay, log in, download or confirm details. A real order number can leak, so use the store's own site or app instead of this email.";

const NO_TEXT: TextSignals = readTextSignals(undefined, { version: "", officialDomains: [], lureTemplates: [] });

/** True only when the sender domain is exactly the order's own domain. */
function exactSender(senderDomain: string | undefined, orderDomain: string): boolean {
  if (!senderDomain || !orderDomain) return false;
  return normalizeDomain(senderDomain) === normalizeDomain(orderDomain);
}

/**
 * The store domains that may give Safe on an order match: retail domains
 * whose DMARC policy is p=reject, so a forged From line on that exact domain
 * is refused by the receiving server. The list lives in the pack.
 */
export function isVettedStore(pack: OfficialPack, domain: string | undefined): boolean {
  if (!domain) return false;
  const d = normalizeDomain(domain);
  return (pack.storeDomains ?? []).some((entry) => entry.dmarc === "reject" && normalizeDomain(entry.domain) === d);
}

/** True when the sender domain is the order's own domain or a subdomain of it. */
function sameSender(senderDomain: string | undefined, orderDomain: string): boolean {
  if (!senderDomain || !orderDomain) return false;
  const sender = normalizeDomain(senderDomain);
  const order = normalizeDomain(orderDomain);
  return sender === order || sender.endsWith(`.${order}`);
}

/** An order stored for a free email domain never proves which store sent an email. */
function provesStore(orderDomain: string): boolean {
  return Boolean(orderDomain) && !isFreeMailDomain(orderDomain);
}

function isStoreClaim(claim: EmailClaim): boolean {
  return (
    claim.email_kind === "receipt" ||
    claim.email_kind === "shipment_notice" ||
    claim.claimed_party.role === "merchant"
  );
}

function isBillingClaim(claim: EmailClaim): boolean {
  return (
    (claim.email_kind === "renewal" ||
      claim.email_kind === "invoice" ||
      claim.email_kind === "refund") &&
    claim.claimed_party.role !== "carrier"
  );
}

function isInformativeShipmentNotice(claim: EmailClaim, signals: TextSignals): boolean {
  return claim.email_kind === "shipment_notice" && !storeAsksRisky(claim, signals);
}

function isOutOfScopeLogin(claim: EmailClaim): boolean {
  if (claim.asked_action !== "log_in") return false;
  const billingOrDelivery =
    claim.email_kind === "receipt" ||
    claim.email_kind === "shipment_notice" ||
    claim.email_kind === "renewal" ||
    claim.email_kind === "invoice" ||
    claim.email_kind === "refund" ||
    claim.email_kind === "delivery_problem" ||
    claim.email_kind === "carrier_update" ||
    claim.claimed_party.role === "merchant" ||
    claim.claimed_party.role === "carrier";
  return !billingOrDelivery;
}

function citedTrackingValues(claim: EmailClaim): string[] {
  const values = claim.cited_numbers
    .filter((item) => item.kind === "tracking" || looksLikeTracking(item.value))
    .map((item) => normalizeTracking(item.value))
    .filter(Boolean);
  return [...new Set(values)];
}

function citedOrderValues(claim: EmailClaim): string[] {
  const kinds: NumberKind[] = ["order", "invoice", "subscription"];
  const values = claim.cited_numbers
    .filter((item) => kinds.includes(item.kind))
    .map((item) => normalizeOrderId(item.value))
    .filter(Boolean);
  return [...new Set(values)];
}

/**
 * `match` is an expected parcel with a cited tracking number. `stored` is a
 * cited number that is on this device but not expected any more (delivered,
 * for example): an old number is the easiest kind to leak, so it never gives Safe.
 */
function findMatchingShipment(
  claim: EmailClaim,
  shipments: LedgerShipment[],
): { cited: string[]; match?: LedgerShipment; stored?: LedgerShipment } {
  const cited = citedTrackingValues(claim);
  const hits = shipments.filter((shipment) => cited.includes(normalizeTracking(shipment.trackingNumber)));
  return { cited, match: hits.find((shipment) => isExpectedShipment(shipment)), stored: hits.find((shipment) => !isExpectedShipment(shipment)) };
}

/**
 * An order number only counts when the email comes from the same sender the
 * order was stored for: a leaked Amazon order number in a "PayPal" email, or
 * from a lookalike domain, matches nothing.
 */
function findMatchingOrder(
  claim: EmailClaim,
  orders: LedgerOrder[],
): { cited: string[]; match?: LedgerOrder; relay?: LedgerOrder; elsewhere?: LedgerOrder; freeMail?: LedgerOrder } {
  const cited = citedOrderValues(claim);
  const domain = claim.claimed_party.domain;
  const hits = orders.filter((order) => cited.includes(normalizeOrderId(order.orderId)));
  // Only the store's exact domain counts as the store.
  const match = hits.find((order) => provesStore(order.senderDomain) && exactSender(domain, order.senderDomain));
  // An order kept for a free email domain (gmail.com and the like) proves nothing about the sender.
  const freeMail = match ? undefined : hits.find((order) => !provesStore(order.senderDomain) && sameSender(domain, order.senderDomain));
  // A subdomain of the store's domain (marketplace.amazon.com, members.ebay.com)
  // is often a relay that other sellers send through, so it is not the store.
  const relay = match || freeMail ? undefined : hits.find((order) => provesStore(order.senderDomain) && sameSender(domain, order.senderDomain));
  // A stored order number in an email from another domain: the number has leaked.
  const elsewhere = match || freeMail || relay ? undefined : hits[0];
  return { cited, match, relay, elsewhere, freeMail };
}

/**
 * A shipment notice may be saved as an expected parcel only when it cites an
 * order stored on this device from the same sender. An unmatched notice is not
 * proof of anything, and saving it would let its sender plant a number that a
 * later fee demand could match.
 */
export function canSaveShipmentFromClaim(
  claim: EmailClaim,
  ledger: Pick<LedgerSnapshot, "orders">,
  pack?: OfficialPack,
  options: VerdictOptions = {},
): boolean {
  if (claim.email_kind !== "shipment_notice") return false;
  // Only a sender the app reads itself can plant an expected parcel; pasted text cannot.
  if ((options.senderCheck ?? "pasted") !== "verified") return false;
  // Without the pack the store cannot be checked against the vetted list.
  if (!pack) return false;
  if (textWasCut(options) || claim.asked_action !== "none") return false;
  const signals = signalsForVerdict(options, pack);
  // A notice that asks to pay, log in, download or confirm is not saved, even from the store's domain.
  if (storeAsksRisky(claim, signals)) return false;
  // Nor one that names a way to pay or reach someone off the site, is not in English, or hides text.
  if (signals.offPlatform.length || signals.mostlyNonEnglish || options.hiddenAny) return false;
  if (!claim.cited_numbers.some((item) => item.kind === "tracking" && item.value)) return false;
  const { match } = findMatchingOrder(claim, ledger.orders);
  // Only the store's exact domain, on the vetted DMARC p=reject list, can plant a parcel.
  if (!match || !isVettedStore(pack, match.senderDomain)) return false;
  if (outsideHosts(signals, pack, match.senderDomain).length) return false;
  if (outsideImageHosts(options, pack, match.senderDomain).length) return false;
  return true;
}

export function isKnownSender(
  claim: EmailClaim,
  ledger: { orders: LedgerOrder[]; senders: LedgerSender[] },
): boolean {
  // Only the real sender domain counts. The display name is attacker-chosen
  // and the model copies it, so a forged "Northwind" name earns no history.
  const domain = claim.claimed_party.domain;
  if (!domain) return false;
  if (ledger.senders.some((sender) => sameSender(domain, sender.domain))) return true;
  return ledger.orders.some((order) => sameSender(domain, order.senderDomain));
}

/** Lure notes come first, then the domain line, so the most important reason is not the one a small screen cuts. */
function packReasons(claim: EmailClaim, pack: OfficialPack, signals: TextSignals = NO_TEXT, senderCheck: SenderCheck = "pasted"): string[] {
  const reasons: string[] = [];
  const domainReasons: string[] = [];
  const domain = claim.claimed_party.domain;
  if (domain) {
    const official = findOfficial(pack, domain);
    if (official && senderCheck !== "verified") {
      domainReasons.push(`The From line names ${domain}, which is listed as official for ${official.name}, but that line cannot be verified here.`);
    } else if (official) {
      domainReasons.push(`The claimed domain ${domain} is listed as official for ${official.name}.`);
    } else {
      domainReasons.push(`The claimed domain ${domain} is not in the official-domain pack.`);
    }
  }
  const blob = JSON.stringify(claim);
  for (const lure of pack.lureTemplates) {
    // Parcel-fee wording in the raw text counts whatever the model labelled.
    if (lure.id === "fee-to-release" && signals.parcelFeeLure) {
      reasons.push(lure.note);
      continue;
    }
    if (!lureApplies(claim, lure.appliesTo)) continue;
    let matched = false;
    try {
      matched = new RegExp(lure.pattern, "i").test(blob);
    } catch {
      matched = blob.toLowerCase().includes(lure.pattern.toLowerCase());
    }
    if (matched) reasons.push(lure.note);
  }
  return [...reasons, ...domainReasons];
}

/**
 * Where the sender domain came from. "verified": the app read it itself
 * (Gmail's sender in the Chrome extension, or a built-in sample whose sender
 * the app sets). "pasted": typed or pasted text, where the From line is
 * whatever the text says. "mixed_thread": a Gmail thread with more than one
 * sender. "flagged": Gmail itself shows the message in Spam, with a warning
 * banner, or with a "via" sender, so its From line is not trusted.
 * "fixture": the extension's own test page, not Gmail. Only "verified" can
 * give Safe; the others cap a match at Neutral.
 */
export type SenderCheck = "verified" | "pasted" | "mixed_thread" | "flagged" | "fixture";

export interface VerdictOptions {
  /**
   * The raw email text. When given, the verdict also reads fee, payment, login
   * and download wording, carrier names and tracking shapes from it in code,
   * so a mislabelled claim cannot hide them.
   */
  emailText?: string;
  /** Defaults to "pasted", so a caller that does not say gets no Safe. */
  senderCheck?: SenderCheck;
  /** Hosts of link and form targets read from the markup, redirects unwrapped. Outside hosts count like links in the text. */
  linkHosts?: string[];
  /** Hosts of images the email loads. An image from outside the sender's or official domains caps Safe at Neutral. */
  imageHosts?: string[];
  /** The caller found text hidden from view that does not match what is shown. Counts as a risky ask. */
  hiddenText?: boolean;
  /** The caller cut the email text, so the verdict did not read all of it. Never Safe. */
  truncated?: boolean;
  /** The caller found any hidden words at all in the email (a preheader too). Never Safe. */
  hiddenAny?: boolean;
}

/** The most text the model reads. The verdict reads all of it, but a longer email is never Safe. */
export const MODEL_INPUT_CHARS = 20_000;

function textWasCut(options: VerdictOptions): boolean {
  return Boolean(options.truncated) || (options.emailText?.length ?? 0) > MODEL_INPUT_CHARS;
}

/** Image hosts that are neither the sender's own domain (or its subdomains) nor official. */
function outsideImageHosts(options: VerdictOptions, pack: OfficialPack, ownDomain?: string): string[] {
  return (options.imageHosts ?? []).filter((host) => {
    if (!host) return false;
    if (ownDomain && sameSender(host, ownDomain)) return false;
    return !findOfficial(pack, host);
  });
}

export const FLAGGED_HEADLINE =
  "This number matches, but Gmail flagged this email (Spam, a warning banner or a \"via\" sender) or is shown in a language these checks can't read, so it can't be Safe. Open it in the official app or site.";
export const FLAGGED_SENDER_REASON =
  "Gmail shows this message in Spam, with a warning, or as sent \"via\" another domain, or shows its interface in a language other than English, where those flags can't be read. The sender it shows cannot vouch for it.";
export const OFF_PLATFORM_HEADLINE =
  "This number matches, but the email names a way to pay or contact someone outside the official site, so it can't be Safe. Use the official app or site only.";
export const NON_ENGLISH_HEADLINE =
  "This number matches, but this email is not in English, and these checks read English only, so it can't be Safe. Open it in the official app or site.";
export const NON_ENGLISH_REASON =
  "The code checks for payment, login and contact requests read English wording, so a request in another language could be missed.";
export const HIDDEN_ANY_HEADLINE =
  "This number matches, but part of this email is hidden from view, so it can't be Safe. Open it in the official app or site.";
export const HIDDEN_ANY_REASON =
  "Some text in this email is hidden from view. Hidden text can carry a request the checks would miss, so a Safe needs none.";
export const OTHER_SITE_HEADLINE =
  "This number matches, but the email links to a site that is not the sender's own, so it can't be Safe. Open it in the official app or site.";
export const FIXTURE_HEADLINE =
  "This number matches, but this is the extension's test page, not Gmail, so it can't be Safe.";
export const FIXTURE_SENDER_REASON =
  "The test page sets its own sender, so the extension does not treat it as a verified Gmail sender.";
export const TOO_LONG_HEADLINE =
  "This email is too long to check fully, so it can't be Safe. Open the parcel or order in the official app or site.";
export const TOO_LONG_REASON =
  "The AI read only the first 20,000 characters of this email, so a request later in it could be missed.";
export const LABEL_NOT_NONE_HEADLINE =
  "This number matches, but the AI read could not rule out a request in this email. Open it in the official app or site.";
export const LABEL_NOT_NONE_REASON =
  "Safe also needs the AI read to find no request at all in the email, and this read found one or could not name it.";
export const STORE_UNVERIFIED_HEADLINE =
  "This order number matches your order, but this store's email can't be authenticated here. Open the order on the store's own site.";
export const STORE_UNVERIFIED_REASON =
  "Only stores whose domain tells mail servers to reject forged email (DMARC p=reject) are on the vetted list that can give Safe.";
export const RELAY_ORDER_HEADLINE =
  "This order number matches your order, but this email comes from a subdomain of the store that other sellers can send through. Open the order on the store's own site.";
export const RELAY_ORDER_REASON =
  "Only the store's exact domain counts as the store. A subdomain such as a marketplace relay can carry messages from other sellers who know your order number.";
export const IMAGE_HOST_HEADLINE =
  "This number matches, but the email loads images from a site that is not on the official list, so it can't be Safe.";
export const HIDDEN_TEXT_REASON =
  "Part of this email is hidden from view and differs from what is shown, a trick used to fool checks like this one.";
export const NO_HISTORY_RISKY_HEADLINE =
  "You have no history with this sender, and it asks you to pay or call. Check on the company's own site.";

export const STORED_NOT_EXPECTED_HEADLINE =
  "This tracking number is stored on this device, but it is not a parcel you are expecting.";

type MatchKind = "parcel" | "order";
type InnerVerdict = Verdict & { matchKind?: MatchKind };

/**
 * The verdict. Safe needs a sender the app verified itself (senderCheck
 * "verified"): a pasted or mixed-thread email that would be Safe is capped at
 * Neutral and says why, so the From line in pasted text never earns Safe.
 */
export function decideVerdict(
  claim: EmailClaim,
  ledger: LedgerSnapshot,
  pack: OfficialPack,
  inferenceSource?: InferenceSourceValue,
  options: VerdictOptions = {},
): Verdict {
  const senderCheck: SenderCheck = options.senderCheck ?? "pasted";
  const { matchKind, ...inner } = decideInner(claim, ledger, pack, inferenceSource, options, senderCheck);
  const verdict = capSafe(inner, matchKind, claim, pack, options, senderCheck);
  return tidyReasons(verdict, claim, pack, options);
}

/** Every rule a Safe must also pass, applied after the main decision. The first that fails sets the Neutral headline. */
function capSafe(
  verdict: Verdict,
  matchKind: MatchKind | undefined,
  claim: EmailClaim,
  pack: OfficialPack,
  options: VerdictOptions,
  senderCheck: SenderCheck,
): Verdict {
  if (verdict.outcome !== "safe") return verdict;
  const neutral = (headline: string, why: string): Verdict => ({ ...verdict, outcome: "neutral", headline, reasons: [why, ...verdict.reasons] });
  const parcel = matchKind !== "order";
  if (senderCheck === "mixed_thread") return neutral(parcel ? MIXED_PARCEL_HEADLINE : MIXED_ORDER_HEADLINE, MIXED_SENDER_REASON);
  if (senderCheck === "flagged") return neutral(FLAGGED_HEADLINE, FLAGGED_SENDER_REASON);
  if (senderCheck === "fixture") return neutral(FIXTURE_HEADLINE, FIXTURE_SENDER_REASON);
  if (senderCheck !== "verified") return neutral(parcel ? PASTED_PARCEL_HEADLINE : PASTED_ORDER_HEADLINE, PASTED_SENDER_REASON);
  if (textWasCut(options)) return neutral(TOO_LONG_HEADLINE, TOO_LONG_REASON);
  if (claim.asked_action !== "none") return neutral(LABEL_NOT_NONE_HEADLINE, LABEL_NOT_NONE_REASON);
  const signals = signalsForVerdict(options, pack);
  if (signals.offPlatform.length) {
    return neutral(
      OFF_PLATFORM_HEADLINE,
      `It mentions ${signals.offPlatform.slice(0, 3).join(", ")}, a way to pay or reach someone outside the official site.`,
    );
  }
  if (signals.mostlyNonEnglish) return neutral(NON_ENGLISH_HEADLINE, NON_ENGLISH_REASON);
  if (options.hiddenAny) return neutral(HIDDEN_ANY_HEADLINE, HIDDEN_ANY_REASON);
  const foreign = notOwnHosts(signals, pack, claim.claimed_party.domain, parcel);
  if (foreign.length) {
    return neutral(
      OTHER_SITE_HEADLINE,
      parcel
        ? `It links to ${foreign.slice(0, 3).join(", ")}, which is not this carrier's own site.`
        : `It links to ${foreign.slice(0, 3).join(", ")}, which is not the store's own site.`,
    );
  }
  if (matchKind === "order" && !isVettedStore(pack, claim.claimed_party.domain)) {
    return neutral(STORE_UNVERIFIED_HEADLINE, STORE_UNVERIFIED_REASON);
  }
  const images = outsideImageHosts(options, pack, claim.claimed_party.domain);
  if (images.length) {
    return neutral(IMAGE_HOST_HEADLINE, `It loads images from ${images.slice(0, 3).join(", ")}, which is not on the official-domain list.`);
  }
  return verdict;
}

/**
 * Reasons that read as reassurance are dropped where they mislead: on a Safe,
 * the "not in the official-domain pack" line; on a Neutral that asks for
 * something risky, "listed as official" and "not an alarm". Hidden text gets
 * its own reason first.
 */
function tidyReasons(verdict: Verdict, claim: EmailClaim, pack: OfficialPack, options: VerdictOptions): Verdict {
  let reasons = verdict.reasons;
  if (verdict.outcome === "safe") reasons = reasons.filter((r) => !r.includes("not in the official-domain pack"));
  if (verdict.outcome === "neutral" && asksForRiskyAction(claim, signalsForVerdict(options, pack))) {
    reasons = reasons.filter((r) => !r.includes("listed as official") && !r.includes("not an alarm"));
  }
  if (options.hiddenText && !reasons.includes(HIDDEN_TEXT_REASON)) reasons = [HIDDEN_TEXT_REASON, ...reasons];
  return reasons === verdict.reasons ? verdict : { ...verdict, reasons };
}

function decideInner(
  claim: EmailClaim,
  ledger: LedgerSnapshot,
  pack: OfficialPack,
  inferenceSource: InferenceSourceValue | undefined,
  options: VerdictOptions,
  senderCheck: SenderCheck,
): InnerVerdict {
  const inferenceSourceLabel = labelForSource(inferenceSource);
  const signals = signalsForVerdict(options, pack);
  const risky = asksForRiskyAction(claim, signals);
  const reasonsFor = () => packReasons(claim, pack, signals, senderCheck);
  const carrierInText = signals.carrierNamed || signals.carrierTracking || signals.parcelFeeLure;

  /**
   * A tracking number that matches an expected parcel. Safe only when all hold:
   * the sender is the official domain of the same carrier as the parcel, the
   * email asks nothing risky (read in code, whatever the model labelled), and
   * it links to no host outside the official list.
   */
  const parcelMatch = (match: LedgerShipment, lead: string[], headline: string): InnerVerdict => {
    const sender = carrierSender(claim, pack, match);
    if (sender === "unofficial" || sender === "other_official") {
      // A tracking number is not proof of the sender: it can leak from a
      // store, a marketplace or an earlier email. A missing or unreadable
      // domain counts as unofficial.
      const leaked = [LEAKED_NUMBER_REASON, ...lead, "This tracking number matches a shipment stored on this device."];
      if (sender === "other_official") {
        const official = findOfficial(pack, claim.claimed_party.domain as string);
        leaked.push(`The sender's domain is official for ${official?.name}, but this parcel is with ${match.carrier ?? inferCarrierFromTracking(match.trackingNumber)}.`);
      }
      if (!claim.claimed_party.domain) leaked.push("The sender's domain could not be read, so it cannot be the carrier's official domain.");
      leaked.push(...reasonsFor());
      return { outcome: "warning", headline: LOOKALIKE_MATCH_HEADLINE, reasons: leaked, inferenceSourceLabel };
    }
    if (sender === "unknown_carrier") {
      return {
        outcome: "neutral",
        headline: UNKNOWN_CARRIER_HEADLINE,
        reasons: [...lead, "The stored parcel has no carrier on record and its number does not show one.", ...reasonsFor()],
        inferenceSourceLabel,
      };
    }
    if (risky) {
      return {
        outcome: "warning",
        headline: OFFICIAL_RISKY_HEADLINE,
        reasons: [OFFICIAL_RISKY_REASON, ...lead, "This tracking number matches a shipment stored on this device.", ...reasonsFor()],
        inferenceSourceLabel,
      };
    }
    const outside = outsideHosts(signals, pack);
    if (outside.length) {
      return {
        outcome: "warning",
        headline: OFFICIAL_LINK_HEADLINE,
        reasons: [
          `It links to ${outside.slice(0, 3).join(", ")}, which is not on the official-domain list.`,
          ...lead,
          "This tracking number matches a shipment stored on this device.",
          ...reasonsFor(),
        ],
        inferenceSourceLabel,
      };
    }
    return {
      outcome: "safe",
      headline,
      reasons: [...lead, "This tracking number matches a shipment stored on this device.", ...reasonsFor()],
      inferenceSourceLabel,
      matchKind: "parcel",
    };
  };

  /** Outside links for an order match: hosts that are neither the store's domain nor official. */
  const orderLinkReason = (order: LedgerOrder): string | undefined => {
    const outside = outsideHosts(signals, pack, order.senderDomain);
    return outside.length ? `It links to ${outside.slice(0, 3).join(", ")}, which is not the store's own site.` : undefined;
  };

  /** A cited order number from a subdomain of the store's domain: a relay, not the store. */
  const relayVerdict = (order: LedgerOrder, lead: string[]): InnerVerdict => {
    const link = orderLinkReason(order);
    if (storeAsksRisky(claim, signals) || link) {
      return {
        outcome: "warning",
        headline: RISKY_ORDER_MATCH_HEADLINE,
        reasons: [...(storeAsksRisky(claim, signals) ? [RISKY_ORDER_REASON] : []), ...(link ? [link] : []), RELAY_ORDER_REASON, ...lead, ...reasonsFor()],
        inferenceSourceLabel,
      };
    }
    return { outcome: "neutral", headline: RELAY_ORDER_HEADLINE, reasons: [RELAY_ORDER_REASON, ...lead, ...reasonsFor()], inferenceSourceLabel };
  };

  const freeMailVerdict = (lead: string[]): InnerVerdict => ({
    outcome: "warning",
    headline: FREE_MAIL_ORDER_HEADLINE,
    reasons: [
      "The order was stored for a free email domain, which anyone can send from, so a matching number proves nothing about the sender.",
      ...lead,
      ...reasonsFor(),
    ],
    inferenceSourceLabel,
  });

  if (isOutOfScopeLogin(claim) && !carrierInText) {
    return {
      outcome: "neutral",
      headline: "This email is not a delivery, invoice, renewal, or refund claim, so it was not checked.",
      reasons: ["Account login emails are out of scope."],
      inferenceSourceLabel,
    };
  }

  // A plain store or billing email (nothing risky asked, no parcel fee) keeps
  // its own checks even when it names a carrier. Anything else that names a
  // carrier, holds a carrier tracking number or asks for a parcel fee is
  // checked as a carrier email, whatever role and kind the model gave it.
  const plainStoreOrBilling = (isStoreClaim(claim) || isBillingClaim(claim)) && !risky && !signals.parcelFeeLure;
  if (isCarrierClaim(claim, pack) || (carrierInText && !plainStoreOrBilling)) {
    const { cited, match, stored } = findMatchingShipment(claim, ledger.shipments);
    const reasons: string[] = [];
    if (cited.length === 0) {
      reasons.push("The email claims to be from a carrier but does not cite a tracking number that can be checked.");
    } else {
      reasons.push(`Cited tracking number: ${cited.join(", ")}.`);
    }
    if (match) return parcelMatch(match, reasons, "This tracking number matches a shipment you are expecting.");
    if (stored) {
      reasons.push("This tracking number is stored on this device, but not as a parcel you are expecting (for example, it was already delivered).");
      reasons.push(...reasonsFor());
      return { outcome: "warning", headline: STORED_NOT_EXPECTED_HEADLINE, reasons, inferenceSourceLabel };
    }
    if (!hasExpectedParcel(ledger)) {
      reasons.push("There are no expected parcels stored on this device right now.");
      reasons.push(...reasonsFor());
      return { outcome: "warning", headline: NOTHING_EXPECTED_HEADLINE, reasons, inferenceSourceLabel };
    }
    reasons.push("This tracking number is not one of the shipments stored on this device.");
    reasons.push(...reasonsFor());
    return {
      outcome: "warning",
      headline: "This tracking number is not one of your shipments.",
      reasons,
      inferenceSourceLabel,
    };
  }

  // A real tracking number is checked before any store or billing branch, so a
  // model that labels it an order number cannot skip the leaked-number check.
  // Only the store's own exact domain, citing the matching order, skips it.
  if (!findMatchingOrder(claim, ledger.orders).match) {
    const early = findMatchingShipment(claim, ledger.shipments);
    const lead = [`Cited tracking number: ${early.cited.join(", ")}.`];
    if (early.match) return parcelMatch(early.match, lead, "This tracking number matches a shipment you are expecting.");
    if (early.stored) {
      return {
        outcome: "warning",
        headline: STORED_NOT_EXPECTED_HEADLINE,
        reasons: [...lead, "This tracking number is stored on this device, but not as a parcel you are expecting (for example, it was already delivered).", ...reasonsFor()],
        inferenceSourceLabel,
      };
    }
  }

  if (isInformativeShipmentNotice(claim, signals)) {
    const { match, relay, elsewhere, freeMail } = findMatchingOrder(claim, ledger.orders);
    const reasons: string[] = [];
    if (freeMail) return freeMailVerdict(reasons);
    if (relay) return relayVerdict(relay, []);
    if (match) {
      const link = orderLinkReason(match);
      if (link) {
        return {
          outcome: "warning",
          headline: RISKY_ORDER_MATCH_HEADLINE,
          reasons: [link, RISKY_ORDER_REASON, "This shipment notice cites an order stored on this device, from the same sender.", ...reasonsFor()],
          inferenceSourceLabel,
        };
      }
      reasons.push("This shipment notice cites an order stored on this device, from the same sender.");
      reasons.push("Confirm to save the tracking number on this device.");
      reasons.push(...reasonsFor());
      return {
        outcome: "safe",
        headline: "This shipment notice matches an order stored on this device.",
        reasons,
        inferenceSourceLabel,
        matchKind: "order",
      };
    }
    if (elsewhere) {
      return {
        outcome: "warning",
        headline: ORDER_FROM_OTHER_SENDER_HEADLINE,
        reasons: [ORDER_FROM_OTHER_SENDER_REASON, ...reasonsFor()],
        inferenceSourceLabel,
      };
    }
    reasons.push("It does not cite an order stored on this device from the same sender, so its tracking number is not saved.");
    reasons.push(...reasonsFor());
    return {
      outcome: "neutral",
      headline: "This looks like a shipment notice, but it does not match an order stored on this device.",
      reasons,
      inferenceSourceLabel,
    };
  }

  if (isBillingClaim(claim) || isStoreClaim(claim)) {
    const { cited, match, relay, elsewhere, freeMail } = findMatchingOrder(claim, ledger.orders);
    const known = isKnownSender(claim, ledger);
    const reasons: string[] = [];
    if (cited.length) reasons.push(`Cited number: ${cited.join(", ")}.`);
    if (freeMail) return freeMailVerdict(reasons);
    if (relay) return relayVerdict(relay, reasons);
    if (elsewhere) {
      return {
        outcome: "warning",
        headline: ORDER_FROM_OTHER_SENDER_HEADLINE,
        reasons: [ORDER_FROM_OTHER_SENDER_REASON, ...reasons, ...reasonsFor()],
        inferenceSourceLabel,
      };
    }
    const link = match ? orderLinkReason(match) : undefined;
    if (match && (storeAsksRisky(claim, signals) || link)) {
      return {
        outcome: "warning",
        headline: RISKY_ORDER_MATCH_HEADLINE,
        reasons: [
          ...(storeAsksRisky(claim, signals) ? [RISKY_ORDER_REASON] : []),
          ...(link ? [link] : []),
          ...reasons,
          "This number matches an order stored on this device, from the same sender.",
          ...reasonsFor(),
        ],
        inferenceSourceLabel,
      };
    }
    if (match) {
      reasons.push("This number matches an order stored on this device, from the same sender.");
      reasons.push(...reasonsFor());
      return {
        outcome: "safe",
        headline: "This number matches an order stored on this device.",
        reasons,
        inferenceSourceLabel,
        matchKind: "order",
      };
    }
    if (known) {
      reasons.push("You have ordered from this sender before, but this number is not in your stored orders.");
      reasons.push(...reasonsFor());
      return {
        outcome: "warning",
        headline: "You have history with this sender, but this number is not in your stored orders.",
        reasons,
        inferenceSourceLabel,
      };
    }
    if (risky) {
      reasons.push("You have no purchase history with this sender, and it asks you to pay, call, log in or download.");
      reasons.push(...reasonsFor());
      return { outcome: "neutral", headline: NO_HISTORY_RISKY_HEADLINE, reasons, inferenceSourceLabel };
    }
    reasons.push("You have no purchase history with this sender, so this is not an alarm.");
    reasons.push(...reasonsFor());
    return {
      outcome: "neutral",
      headline: "You have no history with this sender.",
      reasons,
      inferenceSourceLabel,
    };
  }

  const { match: orderMatch, relay: orderRelay, elsewhere: orderElsewhere, freeMail: orderFreeMail } = findMatchingOrder(claim, ledger.orders);
  if (orderFreeMail) return freeMailVerdict([]);
  if (orderRelay) return relayVerdict(orderRelay, []);
  if (orderElsewhere) {
    return {
      outcome: "warning",
      headline: ORDER_FROM_OTHER_SENDER_HEADLINE,
      reasons: [ORDER_FROM_OTHER_SENDER_REASON, ...reasonsFor()],
      inferenceSourceLabel,
    };
  }
  const orderLink = orderMatch ? orderLinkReason(orderMatch) : undefined;
  if (orderMatch && (storeAsksRisky(claim, signals) || orderLink)) {
    return {
      outcome: "warning",
      headline: RISKY_ORDER_MATCH_HEADLINE,
      reasons: [
        ...(storeAsksRisky(claim, signals) ? [RISKY_ORDER_REASON] : []),
        ...(orderLink ? [orderLink] : []),
        "A cited number matched an order stored on this device, from the same sender.",
        ...reasonsFor(),
      ],
      inferenceSourceLabel,
    };
  }
  if (orderMatch) {
    return {
      outcome: "safe",
      headline: "A cited number matches an item stored on this device.",
      reasons: ["A cited number matched an order stored on this device, from the same sender.", ...reasonsFor()],
      inferenceSourceLabel,
      matchKind: "order",
    };
  }
  const shipment = findMatchingShipment(claim, ledger.shipments);
  if (shipment.match) {
    return parcelMatch(shipment.match, ["A cited number matched a shipment you are expecting."], "A cited number matches an item stored on this device.");
  }
  if (shipment.stored) {
    return {
      outcome: "warning",
      headline: STORED_NOT_EXPECTED_HEADLINE,
      reasons: ["A cited number is stored on this device, but not as a parcel you are expecting.", ...reasonsFor()],
      inferenceSourceLabel,
    };
  }
  return {
    outcome: "neutral",
    headline: risky ? NO_HISTORY_RISKY_HEADLINE : "You have no history with this sender.",
    reasons: [
      "This email could not be classified as a known store, carrier, or billing claim, and no cited number matched an order or shipment stored on this device.",
      ...reasonsFor(),
    ],
    inferenceSourceLabel,
  };
}
