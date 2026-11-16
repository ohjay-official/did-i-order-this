/** The note shown after an order-history import. `seen` is how many orders plus shipments the file held. */
export function importNoteText(newOrders: number, newShipments: number, seen: number): string {
  const orders = newOrders === 1 ? "1 order" : `${newOrders} orders`;
  const shipments = newShipments === 1 ? "1 shipment" : `${newShipments} shipments`;
  const already = seen - newOrders - newShipments;
  if (newOrders === 0 && newShipments === 0) {
    return "Everything in this file was already stored on this device. Nothing was added. The file was not uploaded.";
  }
  const tail = already > 0 ? ` ${already} already stored ${already === 1 ? "item was" : "items were"} updated, not added twice.` : "";
  return `Imported ${orders} and ${shipments} on this device.${tail} The file was not uploaded.`;
}
