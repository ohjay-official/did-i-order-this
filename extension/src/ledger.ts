import type { LedgerOrder, LedgerSender, LedgerShipment, LedgerSnapshot } from "@did-i-order-this/core";

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
  const remaining = ledger.orders.filter((item) => item.id !== order.id && item.orderId !== order.orderId);
  await saveLedger({ ...ledger, orders: [...remaining, order] });
}

export async function saveShipment(shipment: LedgerShipment): Promise<void> {
  const ledger = await loadLedger();
  const remaining = ledger.shipments.filter(
    (item) => item.id !== shipment.id && item.trackingNumber !== shipment.trackingNumber,
  );
  await saveLedger({ ...ledger, shipments: [...remaining, shipment] });
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
