import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { decideVerdict, NOTHING_EXPECTED_HEADLINE } from "@did-i-order-this/core";
import { getOfficialPack } from "../packs/official.ts";
import { sampleThreads } from "../demo/seed.ts";
import { CHIP_DEMO_NOTE, prepareTryChip, SHIPMENT_NEXT_THREAD_ID } from "../demo/shipmentDemo.ts";
import { loadLedger, resetToDemoSeed, saveSender, saveShipment } from "./store.ts";

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
});
