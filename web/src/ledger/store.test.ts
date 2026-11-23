import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { decideVerdict, NOTHING_EXPECTED_HEADLINE } from "@did-i-order-this/core";
import { getOfficialPack } from "../packs/official.ts";
import { sampleThreads } from "../demo/seed.ts";
import { CHIP_DEMO_NOTE, prepareTryChip, SHIPMENT_NEXT_THREAD_ID } from "../demo/shipmentDemo.ts";
import { ledgerForCheck, loadLedger, resetToDemoSeed, saveOrder, saveSender, saveShipment } from "./store.ts";

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase("did-i-order-this");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

describe("ledger store on a brand-new device", () => {
  beforeEach(deleteDb);

  it("first load seeds 1 order and 0 expected parcels", async () => {
    const ledger = await loadLedger();
    expect(ledger.orders).toHaveLength(1);
    expect(ledger.shipments.filter((s) => s.expected)).toHaveLength(0);
  });

  it("the Real UPS chip as the very first action keeps its demo shipment and gives the match", async () => {
    const note = await prepareTryChip(SHIPMENT_NEXT_THREAD_ID, { shipment: saveShipment, sender: saveSender });
    expect(note).toBe(CHIP_DEMO_NOTE);
    const ledger = await loadLedger();
    expect(ledger.orders).toHaveLength(1);
    expect(ledger.shipments.map((s) => s.trackingNumber)).toContain("1Z999AA10123456784");
    const ups = sampleThreads.find((t) => t.id === SHIPMENT_NEXT_THREAD_ID)!;
    const verdict = decideVerdict(ups.expectedClaim, ledger, getOfficialPack(), undefined);
    expect(verdict.outcome).toBe("safe");
    expect(verdict.headline).not.toBe(NOTHING_EXPECTED_HEADLINE);
  });

  it("reset still clears the demo shipment", async () => {
    await prepareTryChip(SHIPMENT_NEXT_THREAD_ID, { shipment: saveShipment, sender: saveSender });
    await resetToDemoSeed();
    const ledger = await loadLedger();
    expect(ledger.shipments.filter((s) => s.expected)).toHaveLength(0);
  });

  it("reset removes demo rows only and keeps imported orders and parcels (security audit L2)", async () => {
    await prepareTryChip(SHIPMENT_NEXT_THREAD_ID, { shipment: saveShipment, sender: saveSender });
    await saveOrder({ id: "real-1", merchant: "Amazon", senderDomain: "amazon.com", orderId: "112-1", source: "import", confirmedAt: "2026-11-20T00:00:00Z" });
    await saveShipment({ id: "real-s", trackingNumber: "1Z000AA10000000009", expected: true, source: "import", confirmedAt: "2026-11-20T00:00:00Z" });
    await saveSender({ domain: "amazon.com", displayName: "Amazon", role: "merchant", firstSeenAt: "x", confirmedAt: "2026-11-20T00:00:00Z" });
    const returned = await resetToDemoSeed();
    const ledger = await loadLedger();
    expect(ledger.orders.map((o) => o.orderId).sort()).toEqual(["112-1", "NW-10001"]);
    expect(ledger.shipments.map((s) => s.trackingNumber)).toEqual(["1Z000AA10000000009"]);
    expect(ledger.senders.map((s) => s.domain).sort()).toEqual(["amazon.com", "shop.northwind-outfitters.example"]);
    expect(returned.orders).toHaveLength(2);
  });

  it("demo rows are left out when someone's own email is checked (security audit L2)", async () => {
    await prepareTryChip(SHIPMENT_NEXT_THREAD_ID, { shipment: saveShipment, sender: saveSender });
    const ledger = await loadLedger();
    expect(ledgerForCheck(ledger, true)).toBe(ledger);
    const own = ledgerForCheck(ledger, false);
    expect(own.orders).toHaveLength(0);
    expect(own.shipments).toHaveLength(0);
    expect(own.senders).toHaveLength(0);
  });
});
