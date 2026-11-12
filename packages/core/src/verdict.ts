import { looksLikeTracking, normalizeDomain, normalizeOrderId, normalizeTracking } from "./normalize.ts";
import {
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
  if (claim.email_kind === "carrier_update") return true;
  if (claim.email_kind === "delivery_problem") {
    const domain = claim.claimed_party.domain;
    if (!domain) return false;
    const official = findOfficial(pack, domain);
    return official?.role === "carrier";
  }
  return false;
}

function findOfficial(pack: OfficialPack, domain: string) {
  const normalized = normalizeDomain(domain);
  return pack.officialDomains.find((entry) => normalizeDomain(entry.domain) === normalized);
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

function isInformativeShipmentNotice(claim: EmailClaim): boolean {
  return (
    claim.email_kind === "shipment_notice" &&
    claim.asked_action !== "pay" &&
    claim.asked_action !== "log_in"
  );
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

function findMatchingShipment(
  claim: EmailClaim,
  shipments: LedgerShipment[],
): { cited: string[]; match?: LedgerShipment } {
  const cited = citedTrackingValues(claim);
  const match = shipments.find((shipment) =>
    cited.includes(normalizeTracking(shipment.trackingNumber)),
  );
  return { cited, match };
}

function findMatchingOrder(
  claim: EmailClaim,
  orders: LedgerOrder[],
): { cited: string[]; match?: LedgerOrder } {
  const cited = citedOrderValues(claim);
  const match = orders.find((order) => cited.includes(normalizeOrderId(order.orderId)));
  return { cited, match };
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

function packReasons(claim: EmailClaim, pack: OfficialPack): string[] {
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

export function decideVerdict(
  claim: EmailClaim,
  ledger: LedgerSnapshot,
  pack: OfficialPack,
  inferenceSource?: InferenceSourceValue,
): Verdict {
  const inferenceSourceLabel = labelForSource(inferenceSource);

  if (isOutOfScopeLogin(claim)) {
    return {
      outcome: "neutral",
      headline: "This email is not a delivery, invoice, renewal, or refund claim, so it was not checked.",
      reasons: ["Account login emails are out of scope."],
      inferenceSourceLabel,
    };
  }

  if (isCarrierClaim(claim, pack)) {
    const { cited, match } = findMatchingShipment(claim, ledger.shipments);
    const reasons: string[] = [];
    if (cited.length === 0) {
      reasons.push("The email claims to be from a carrier but does not cite a tracking number that can be checked.");
    } else {
      reasons.push(`Cited tracking number: ${cited.join(", ")}.`);
    }
    if (match) {
      reasons.push("This tracking number matches a shipment in your ledger.");
      reasons.push(...packReasons(claim, pack));
      return {
        outcome: "safe",
        headline: "This tracking number matches a shipment you are expecting.",
        reasons,
        inferenceSourceLabel,
      };
    }
    if (!hasExpectedParcel(ledger)) {
      reasons.push("Your ledger has no expected parcels right now.");
      reasons.push(...packReasons(claim, pack));
      return {
        outcome: "warning",
        headline: NOTHING_EXPECTED_HEADLINE,
        reasons,
        inferenceSourceLabel,
      };
    }
    reasons.push("This tracking number is not one of the shipments in your ledger.");
    reasons.push(...packReasons(claim, pack));
    return {
      outcome: "warning",
      headline: "This tracking number is not one of your shipments.",
      reasons,
      inferenceSourceLabel,
    };
  }

  if (isInformativeShipmentNotice(claim)) {
    const { match } = findMatchingOrder(claim, ledger.orders);
    const reasons: string[] = [];
    if (match) {
      reasons.push("This shipment notice cites an order in your ledger.");
      reasons.push("Confirm to save the tracking number to your ledger.");
      reasons.push(...packReasons(claim, pack));
      return {
        outcome: "safe",
        headline: "This shipment notice matches an order in your ledger.",
        reasons,
        inferenceSourceLabel,
      };
    }
    reasons.push("Confirm to save this shipment to your ledger.");
    reasons.push(...packReasons(claim, pack));
    return {
      outcome: "neutral",
      headline: "This looks like a shipment notice. Confirm to save it to your ledger.",
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
      reasons.push("This number matches an order in your ledger.");
      reasons.push(...packReasons(claim, pack));
      return {
        outcome: "safe",
        headline: "This number matches an order in your ledger.",
        reasons,
        inferenceSourceLabel,
      };
    }
    if (known) {
      reasons.push("You have ordered from this sender before, but this number is not in your ledger.");
      reasons.push(...packReasons(claim, pack));
      return {
        outcome: "warning",
        headline: "You have history with this sender, but this number is not in your ledger.",
        reasons,
        inferenceSourceLabel,
      };
    }
    reasons.push("You have no purchase history with this sender, so this is not an alarm.");
    reasons.push(...packReasons(claim, pack));
    return {
      outcome: "neutral",
      headline: "You have no history with this sender.",
      reasons,
      inferenceSourceLabel,
    };
  }

  const orderMatch = findMatchingOrder(claim, ledger.orders).match;
  const shipmentMatch = findMatchingShipment(claim, ledger.shipments).match;
  if (orderMatch || shipmentMatch) {
    return {
      outcome: "safe",
      headline: "A cited number matches an item in your ledger.",
      reasons: ["A cited number matched a ledger entry.", ...packReasons(claim, pack)],
      inferenceSourceLabel,
    };
  }
  return {
    outcome: "neutral",
    headline: "You have no history with this sender.",
    reasons: [
      "This email could not be classified as a known store, carrier, or billing claim, and no cited number matched your ledger.",
      ...packReasons(claim, pack),
    ],
    inferenceSourceLabel,
  };
}
