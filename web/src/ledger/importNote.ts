/**
 * A CSV says which store each order is from, so a file someone else made can
 * make their own emails look like a store's (security audit round 4, J2-8).
 */
export const IMPORT_TRUST_NOTE = "Import only files you exported yourself: a CSV decides which store each order belongs to.";

/** The note shown after an order-history import. `seen` is how many orders plus shipments the file held. */
export function importNoteText(newOrders: number, newShipments: number, seen: number): string {
  const orders = newOrders === 1 ? "1 order" : `${newOrders} orders`;
  const shipments = newShipments === 1 ? "1 shipment" : `${newShipments} shipments`;
  const already = seen - newOrders - newShipments;
  if (newOrders === 0 && newShipments === 0) {
    return "Everything in this file was already stored on this device. Nothing was added. The file was not uploaded.";
  }
  const tail = already > 0 ? ` ${already} already stored ${already === 1 ? "item was" : "items were"} updated, not added twice.` : "";
  return `Imported ${orders} and ${shipments} on this device.${tail} The file was not uploaded. ${IMPORT_TRUST_NOTE}`;
}
