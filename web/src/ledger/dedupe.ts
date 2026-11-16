import type { LedgerOrder, LedgerShipment } from "@did-i-order-this/core";
import { normalizeDomain, normalizeOrderId, normalizeTracking } from "@did-i-order-this/core";

/** The stored order that is the same order as `order` (same order id from the same sender), if any. */
export function findSameOrder(stored: LedgerOrder[], order: LedgerOrder): LedgerOrder | undefined {
  const id = normalizeOrderId(order.orderId);
  const domain = normalizeDomain(order.senderDomain);
  if (!id) return undefined;
  return stored.find((o) => normalizeOrderId(o.orderId) === id && normalizeDomain(o.senderDomain) === domain);
}

/** The stored shipment with the same tracking number as `shipment`, if any. */
export function findSameShipment(stored: LedgerShipment[], shipment: LedgerShipment): LedgerShipment | undefined {
  const tracking = normalizeTracking(shipment.trackingNumber);
  if (!tracking) return undefined;
  return stored.find((s) => normalizeTracking(s.trackingNumber) === tracking);
}
