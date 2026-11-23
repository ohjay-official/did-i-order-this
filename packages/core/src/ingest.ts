import { expectedUntilFrom } from "./expected.ts";
import { inferCarrierFromTracking, normalizeDomain, normalizeOrderId, normalizeTracking } from "./normalize.ts";
import type { EmailClaim, LedgerOrder, LedgerSender, LedgerShipment } from "./types.ts";

export type EmailMeta = { fromDomain: string; subject: string };

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export function ingestShipmentFromClaim(
  claim: EmailClaim,
  emailMeta: EmailMeta,
): LedgerShipment | null {
  void emailMeta;
  if (claim.email_kind !== "shipment_notice") return null;
  const tracking = claim.cited_numbers.find((item) => item.kind === "tracking");
  if (!tracking?.value) return null;
  const order = claim.cited_numbers.find((item) => item.kind === "order");
  const carrier =
    claim.claimed_party.role === "carrier"
      ? claim.claimed_party.name
      : inferCarrierFromTracking(tracking.value);
  return {
    id: newId(),
    trackingNumber: normalizeTracking(tracking.value),
    carrier,
    orderId: order ? normalizeOrderId(order.value) : undefined,
    merchant: claim.claimed_party.role === "merchant" ? claim.claimed_party.name : undefined,
    expected: true,
    // Round 6: a saved notice stops counting after the same window as an import or a typed-in number.
    expectedUntil: expectedUntilFrom(new Date()),
    source: "shipment_email",
    confirmedAt: nowIso(),
  };
}

export function ingestOrderFromClaim(
  claim: EmailClaim,
  emailMeta: EmailMeta,
): LedgerOrder | null {
  if (claim.email_kind !== "receipt") return null;
  const order = claim.cited_numbers.find((item) => item.kind === "order" || item.kind === "invoice");
  if (!order?.value) return null;
  const domain = claim.claimed_party.domain || emailMeta.fromDomain;
  return {
    id: newId(),
    merchant: claim.claimed_party.name || "Unknown merchant",
    senderDomain: normalizeDomain(domain),
    orderId: normalizeOrderId(order.value),
    status: "placed",
    source: "receipt_email",
    confirmedAt: nowIso(),
  };
}

export function ingestSenderFromClaim(
  claim: EmailClaim,
  emailMeta: EmailMeta,
): LedgerSender | null {
  if (claim.email_kind !== "receipt" && claim.email_kind !== "shipment_notice") return null;
  if (claim.claimed_party.role === "carrier") return null;
  const domain = claim.claimed_party.domain || emailMeta.fromDomain;
  if (!domain) return null;
  const timestamp = nowIso();
  const role =
    claim.claimed_party.role === "merchant" ||
    claim.claimed_party.role === "bank" ||
    claim.claimed_party.role === "subscription"
      ? claim.claimed_party.role === "subscription"
        ? "subscription"
        : claim.claimed_party.role
      : "other";
  return {
    domain: normalizeDomain(domain),
    displayName: claim.claimed_party.name || domain,
    role: role === "bank" ? "bank" : role === "subscription" ? "subscription" : role === "merchant" ? "merchant" : "other",
    firstSeenAt: timestamp,
    confirmedAt: timestamp,
  };
}
