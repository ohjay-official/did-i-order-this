import { describe, expect, it } from "vitest";
import type { LedgerOrder, LedgerShipment } from "@did-i-order-this/core";
import { findSameOrder, findSameShipment } from "./dedupe.ts";
import { importNoteText } from "./importNote.ts";

const order = (over: Partial<LedgerOrder> = {}): LedgerOrder => ({
  id: "a",
  merchant: "Harbor Goods",
  senderDomain: "harborgoods.example",
  orderId: "HG-1001",
  source: "import",
  confirmedAt: "2026-11-16T00:00:00.000Z",
  ...over,
} as LedgerOrder);

const ship = (over: Partial<LedgerShipment> = {}): LedgerShipment => ({
  id: "s1",
  trackingNumber: "9400111899562537874999",
  expected: true,
  source: "import",
  confirmedAt: "2026-11-16T00:00:00.000Z",
  ...over,
} as LedgerShipment);

describe("ledger dedupe", () => {
  it("finds the same order on re-import even with new ids, case and spacing", () => {
    const stored = [order()];
    expect(findSameOrder(stored, order({ id: "b", orderId: " hg-1001 ", senderDomain: "HarborGoods.example" }))?.id).toBe("a");
  });
  it("keeps orders with the same id from different senders apart", () => {
    expect(findSameOrder([order()], order({ id: "b", senderDomain: "other.example" }))).toBeUndefined();
  });
  it("keeps different order ids apart", () => {
    expect(findSameOrder([order()], order({ id: "b", orderId: "HG-1002" }))).toBeUndefined();
  });
  it("finds the same shipment by tracking number, ignoring spaces and case", () => {
    expect(findSameShipment([ship()], ship({ id: "s2", trackingNumber: "9400 1118 9956 2537 8749 99" }))?.id).toBe("s1");
    expect(findSameShipment([ship({ trackingNumber: "1Z999AA10123456784" })], ship({ id: "s2", trackingNumber: "1z999aa10123456784" }))?.id).toBe("s1");
  });
  it("keeps different tracking numbers apart", () => {
    expect(findSameShipment([ship()], ship({ id: "s2", trackingNumber: "1Z999AA10123456784" }))).toBeUndefined();
  });
});

describe("import note", () => {
  it("keeps the first-import wording", () => {
    expect(importNoteText(2, 1, 3)).toBe("Imported 2 orders and 1 shipment on this device. The file was not uploaded. Import only files you exported yourself: a CSV decides which store each order belongs to.");
  });
  it("says nothing was added when the same file is imported again", () => {
    expect(importNoteText(0, 0, 3)).toBe("Everything in this file was already stored on this device. Nothing was added. The file was not uploaded.");
  });
  it("counts the already stored items on a partial overlap", () => {
    expect(importNoteText(1, 0, 3)).toBe("Imported 1 order and 0 shipments on this device. 2 already stored items were updated, not added twice. The file was not uploaded. Import only files you exported yourself: a CSV decides which store each order belongs to.");
  });
});
