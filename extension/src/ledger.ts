import { makeExpectedShipment, normalizeDomain, normalizeOrderId, type ManualTrackingInput, type LedgerOrder, type LedgerSender, type LedgerShipment, type LedgerSnapshot } from "@did-i-order-this/core";

/** The same order is the same number from the same store; another store's order with that number is kept. */
function sameOrder(a: LedgerOrder, b: LedgerOrder): boolean {
  return normalizeOrderId(a.orderId) === normalizeOrderId(b.orderId) && normalizeDomain(a.senderDomain) === normalizeDomain(b.senderDomain);
}

const KEY = "did-i-order-this-ledger";

export async function loadLedger(): Promise<LedgerSnapshot> {
  const stored = await chrome.storage.local.get(KEY);
  const value = stored[KEY] as LedgerSnapshot | undefined;
  return value ?? { orders: [], shipments: [], senders: [] };
}

export async function saveLedger(snapshot: LedgerSnapshot): Promise<void> {
  await chrome.storage.local.set({ [KEY]: snapshot });
}

export async function saveOrder(order: LedgerOrder): Promise<void> {
  const ledger = await loadLedger();
  const remaining = ledger.orders.filter((item) => item.id !== order.id && !sameOrder(item, order));
  await saveLedger({ ...ledger, orders: [...remaining, order] });
}

export async function saveShipment(shipment: LedgerShipment): Promise<void> {
  const ledger = await loadLedger();
  const remaining = ledger.shipments.filter(
    (item) => item.id !== shipment.id && item.trackingNumber !== shipment.trackingNumber,
  );
  await saveLedger({ ...ledger, shipments: [...remaining, shipment] });
}

/**
 * Adds one tracking number the person typed in because they are waiting for
 * it, as an expected parcel for the next 30 days. Throws ManualTrackingError
 * with a message to show when the text is not a tracking number. The side
 * panel field for it is listed in docs/UI-NEXT.md.
 */
export async function addExpectedTracking(input: ManualTrackingInput): Promise<LedgerShipment> {
  const shipment = makeExpectedShipment(input);
  await saveShipment(shipment);
  return shipment;
}

export async function saveSender(sender: LedgerSender): Promise<void> {
  const ledger = await loadLedger();
  const remaining = ledger.senders.filter((item) => item.domain !== sender.domain);
  await saveLedger({ ...ledger, senders: [...remaining, sender] });
}

export async function clearLedger(): Promise<LedgerSnapshot> {
  const empty = { orders: [], shipments: [], senders: [] };
  await saveLedger(empty);
  return empty;
}
