import { findOfficialDomain, looksLikeTracking, normalizeDomain, normalizeOrderId, normalizeTracking } from "./normalize.ts";
import { carrierNames, readTextSignals, type TextSignals } from "./signals.ts";
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
  return ledger.shipments.some((shipment) => shipment.expected === true);
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
 * from the model's label and, in code, from the email text, so a model that
 * labels a fee demand "none" does not hide it.
 */
function asksForRiskyAction(claim: EmailClaim, signals: TextSignals = NO_TEXT): boolean {
  return (
    claim.asked_action === "pay" ||
    claim.asked_action === "log_in" ||
    claim.asked_action === "download" ||
    signals.asksToPay ||
    signals.asksToLogIn ||
    signals.asksToDownload
  );
}

const NO_TEXT: TextSignals = readTextSignals(undefined, { version: "", officialDomains: [], lureTemplates: [] });

/** True when the sender domain is the order's own domain or a subdomain of it. */
function sameSender(senderDomain: string | undefined, orderDomain: string): boolean {
  if (!senderDomain || !orderDomain) return false;
  const sender = normalizeDomain(senderDomain);
  const order = normalizeDomain(orderDomain);
  return sender === order || sender.endsWith(`.${order}`);
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
  return claim.email_kind === "shipment_notice" && !asksForRiskyAction(claim, signals) && !signals.parcelFeeLure;
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
  return { cited, match: hits.find((shipment) => shipment.expected === true), stored: hits.find((shipment) => !shipment.expected) };
}

/**
 * An order number only counts when the email comes from the same sender the
 * order was stored for: a leaked Amazon order number in a "PayPal" email, or
 * from a lookalike domain, matches nothing.
 */
function findMatchingOrder(
  claim: EmailClaim,
  orders: LedgerOrder[],
): { cited: string[]; match?: LedgerOrder } {
  const cited = citedOrderValues(claim);
  const domain = claim.claimed_party.domain;
  const match = orders.find(
    (order) => cited.includes(normalizeOrderId(order.orderId)) && sameSender(domain, order.senderDomain),
  );
  return { cited, match };
}

/**
 * A shipment notice may be saved as an expected parcel only when it cites an
 * order stored on this device from the same sender. An unmatched notice is not
 * proof of anything, and saving it would let its sender plant a number that a
 * later fee demand could match.
 */
export function canSaveShipmentFromClaim(claim: EmailClaim, ledger: Pick<LedgerSnapshot, "orders">): boolean {
  if (claim.email_kind !== "shipment_notice") return false;
  if (!claim.cited_numbers.some((item) => item.kind === "tracking" && item.value)) return false;
  return Boolean(findMatchingOrder(claim, ledger.orders).match);
}

export function isKnownSender(
  claim: EmailClaim,
  ledger: { orders: LedgerOrder[]; senders: LedgerSender[] },
): boolean {
  const domain = claim.claimed_party.domain;
  if (domain && ledger.senders.some((sender) => normalizeDomain(sender.domain) === normalizeDomain(domain))) {
    return true;
  }
  const name = claim.claimed_party.name.trim().toLowerCase();
  if (!name) return false;
  if (ledger.orders.some((order) => order.merchant.trim().toLowerCase() === name)) return true;
  if (ledger.senders.some((sender) => sender.displayName.trim().toLowerCase() === name)) return true;
  return false;
}

function packReasons(claim: EmailClaim, pack: OfficialPack, signals: TextSignals = NO_TEXT): string[] {
  const reasons: string[] = [];
  const domain = claim.claimed_party.domain;
  if (domain) {
    const official = findOfficial(pack, domain);
    if (official) {
      reasons.push(`The claimed domain ${domain} is listed as official for ${official.name}.`);
    } else {
      reasons.push(`The claimed domain ${domain} is not in the official-domain pack.`);
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
  return reasons;
}

export interface VerdictOptions {
  /**
   * The raw email text. When given, the verdict also reads fee, payment, login
   * and download wording, carrier names and tracking shapes from it in code,
   * so a mislabelled claim cannot hide them.
   */
  emailText?: string;
}

export const STORED_NOT_EXPECTED_HEADLINE =
  "This tracking number is stored on this device, but it is not a parcel you are expecting.";

export function decideVerdict(
  claim: EmailClaim,
  ledger: LedgerSnapshot,
  pack: OfficialPack,
  inferenceSource?: InferenceSourceValue,
  options: VerdictOptions = {},
): Verdict {
  const inferenceSourceLabel = labelForSource(inferenceSource);
  const signals = readTextSignals(options.emailText, pack);
  const risky = asksForRiskyAction(claim, signals);
  const reasonsFor = () => packReasons(claim, pack, signals);
  const carrierInText = signals.carrierNamed || signals.carrierTracking || signals.parcelFeeLure;

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
    if (match) {
      reasons.push("This tracking number matches a shipment stored on this device.");
      reasons.push(...reasonsFor());
      const domain = claim.claimed_party.domain;
      const official = domain ? findOfficial(pack, domain) : undefined;
      if (official?.role !== "carrier" && risky) {
        // A leaked tracking number is not proof of the sender. Do not stamp a
        // fee, login or download demand as safe unless it comes from the
        // carrier's official domain. A missing domain counts as unofficial.
        if (!domain) reasons.push("The sender's domain could not be read, so it cannot be the carrier's official domain.");
        reasons.push("A matching tracking number can leak. Use the carrier's own app or site instead of this email.");
        return { outcome: "warning", headline: LOOKALIKE_MATCH_HEADLINE, reasons, inferenceSourceLabel };
      }
      return {
        outcome: "safe",
        headline: "This tracking number matches a shipment you are expecting.",
        reasons,
        inferenceSourceLabel,
      };
    }
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

  if (isInformativeShipmentNotice(claim, signals)) {
    const { match } = findMatchingOrder(claim, ledger.orders);
    const reasons: string[] = [];
    if (match) {
      reasons.push("This shipment notice cites an order stored on this device, from the same sender.");
      reasons.push("Confirm to save the tracking number on this device.");
      reasons.push(...reasonsFor());
      return {
        outcome: "safe",
        headline: "This shipment notice matches an order stored on this device.",
        reasons,
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
    const { cited, match } = findMatchingOrder(claim, ledger.orders);
    const known = isKnownSender(claim, ledger);
    const reasons: string[] = [];
    if (cited.length) reasons.push(`Cited number: ${cited.join(", ")}.`);
    if (match) {
      reasons.push("This number matches an order stored on this device, from the same sender.");
      reasons.push(...reasonsFor());
      return {
        outcome: "safe",
        headline: "This number matches an order stored on this device.",
        reasons,
        inferenceSourceLabel,
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
    reasons.push("You have no purchase history with this sender, so this is not an alarm.");
    reasons.push(...reasonsFor());
    return {
      outcome: "neutral",
      headline: "You have no history with this sender.",
      reasons,
      inferenceSourceLabel,
    };
  }

  const orderMatch = findMatchingOrder(claim, ledger.orders).match;
  if (orderMatch) {
    return {
      outcome: "safe",
      headline: "A cited number matches an item stored on this device.",
      reasons: ["A cited number matched an order stored on this device, from the same sender.", ...reasonsFor()],
      inferenceSourceLabel,
    };
  }
  const shipment = findMatchingShipment(claim, ledger.shipments);
  if (shipment.match) {
    const domain = claim.claimed_party.domain;
    if (risky && findOfficial(pack, domain ?? "")?.role !== "carrier") {
      return {
        outcome: "warning",
        headline: LOOKALIKE_MATCH_HEADLINE,
        reasons: [
          "A cited number matched a shipment stored on this device, but the email asks you to pay, log in or download, and it is not from the carrier's official domain.",
          "A matching tracking number can leak. Use the carrier's own app or site instead of this email.",
          ...reasonsFor(),
        ],
        inferenceSourceLabel,
      };
    }
    return {
      outcome: "safe",
      headline: "A cited number matches an item stored on this device.",
      reasons: ["A cited number matched a shipment you are expecting.", ...reasonsFor()],
      inferenceSourceLabel,
    };
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
    headline: "You have no history with this sender.",
    reasons: [
      "This email could not be classified as a known store, carrier, or billing claim, and no cited number matched an order or shipment stored on this device.",
      ...reasonsFor(),
    ],
    inferenceSourceLabel,
  };
}
