import {
  ingestSenderFromClaim,
  ingestShipmentFromClaim,
  type LedgerSender,
  type LedgerShipment,
  type LedgerSnapshot,
} from "@did-i-order-this/core";
import { sampleThreads, type SampleThread } from "./seed.ts";

/**
 * "Load the matching shipment demo": stores the UPS parcel from the Northwind
 * shipment notice as an expected parcel, labelled as demo data, so the UPS
 * thread can match and the second DHL thread can show a tracking mismatch
 * without any AI call. Reset demo data removes it again.
 */

export const SHIPMENT_SOURCE_THREAD_ID = "thread-2-shipment-notice";
export const SHIPMENT_NEXT_THREAD_ID = "thread-3-safe-carrier";
export const DEMO_SHIPMENT_ID = "demo-shipment-1Z999AA10123456784";

function thread(id: string): SampleThread {
  const found = sampleThreads.find((item) => item.id === id);
  if (!found) throw new Error(`Sample thread ${id} is missing.`);
  return found;
}

export function matchingShipmentDemo(): { shipment: LedgerShipment; sender: LedgerSender | null } {
  const notice = thread(SHIPMENT_SOURCE_THREAD_ID);
  const meta = { fromDomain: notice.fromDomain, subject: notice.subject };
  const parsed = ingestShipmentFromClaim(notice.expectedClaim, meta);
  if (!parsed) throw new Error("The sample shipment notice has no tracking number.");
  const shipment: LedgerShipment = { ...parsed, id: DEMO_SHIPMENT_ID, source: "demo_seed", confirmedAt: "demo_seed" };
  const parsedSender = ingestSenderFromClaim(notice.expectedClaim, meta);
  const sender = parsedSender ? { ...parsedSender, firstSeenAt: "demo_seed", confirmedAt: "demo_seed" } : null;
  return { shipment, sender };
}

export function hasMatchingShipmentDemo(ledger: Pick<LedgerSnapshot, "shipments">): boolean {
  const { shipment } = matchingShipmentDemo();
  return ledger.shipments.some((item) => item.expected && item.trackingNumber === shipment.trackingNumber);
}

/** Stores the demo shipment (and its sender) through the given savers. Saving twice keeps one copy. */
export async function loadMatchingShipmentDemo(save: {
  shipment: (shipment: LedgerShipment) => Promise<void>;
  sender: (sender: LedgerSender) => Promise<void>;
}): Promise<LedgerShipment> {
  const { shipment, sender } = matchingShipmentDemo();
  await save.shipment(shipment);
  if (sender) await save.sender(sender);
  return shipment;
}
