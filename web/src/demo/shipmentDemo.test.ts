import { describe, expect, it } from "vitest";
import { NOTHING_EXPECTED_HEADLINE, decideVerdict, type LedgerSender, type LedgerShipment, type LedgerSnapshot } from "@did-i-order-this/core";
import { getOfficialPack } from "../packs/official.ts";
import { demoSeed, sampleThreads } from "./seed.ts";
import {
  CHIP_DEMO_NOTE,
  DEMO_SHIPMENT_ID,
  prepareTryChip,
  SHIPMENT_NEXT_THREAD_ID,
  hasMatchingShipmentDemo,
  loadMatchingShipmentDemo,
  matchingShipmentDemo,
} from "./shipmentDemo.ts";

const pack = getOfficialPack();
const claimOf = (id: string) => {
  const found = sampleThreads.find((item) => item.id === id);
  if (!found) throw new Error(id);
  return found.expectedClaim;
};

function fakeStore(seed: LedgerSnapshot) {
  const shipments = new Map<string, LedgerShipment>(seed.shipments.map((s) => [s.id, s]));
  const senders = new Map<string, LedgerSender>(seed.senders.map((s) => [s.domain, s]));
  return {
    save: {
      shipment: async (s: LedgerShipment) => void shipments.set(s.id, s),
      sender: async (s: LedgerSender) => void senders.set(s.domain, s),
    },
    snapshot: (): LedgerSnapshot => ({ orders: seed.orders, shipments: [...shipments.values()], senders: [...senders.values()] }),
  };
}

describe("Load the matching shipment demo", () => {
  it("keeps the default seed: first DHL still says nothing is expected", () => {
    const ledger = demoSeed();
    expect(ledger.orders).toHaveLength(1);
    expect(ledger.shipments).toHaveLength(0);
    expect(hasMatchingShipmentDemo(ledger)).toBe(false);
    expect(decideVerdict(claimOf("thread-1-carrier-lure"), ledger, pack, undefined, { senderCheck: "verified" }).headline).toBe(NOTHING_EXPECTED_HEADLINE);
  });

  it("builds the UPS parcel from the Northwind notice, labelled as demo data", () => {
    const { shipment, sender } = matchingShipmentDemo();
    expect(shipment).toMatchObject({
      id: DEMO_SHIPMENT_ID,
      trackingNumber: "1Z999AA10123456784",
      carrier: "UPS",
      orderId: "NW-10482",
      expected: true,
      source: "demo_seed",
      confirmedAt: "demo_seed",
    });
    expect(sender?.domain).toBe("shop.northwind-outfitters.example");
    expect(SHIPMENT_NEXT_THREAD_ID).toBe("thread-3-safe-carrier");
  });

  it("after loading: UPS matches and the second DHL is not one of your shipments", async () => {
    const store = fakeStore(demoSeed());
    await loadMatchingShipmentDemo(store.save);
    const ledger = store.snapshot();
    expect(hasMatchingShipmentDemo(ledger)).toBe(true);
    const ups = decideVerdict(claimOf("thread-3-safe-carrier"), ledger, pack, undefined, { senderCheck: "verified" });
    expect(ups.outcome).toBe("safe");
    expect(ups.headline).toBe("This tracking number matches a shipment you are expecting.");
    const wrong = decideVerdict(claimOf("thread-5-wrong-tracking"), ledger, pack, undefined, { senderCheck: "verified" });
    expect(wrong.outcome).toBe("warning");
    expect(wrong.headline).toBe("This tracking number is not one of your shipments.");
    const streamhut = decideVerdict(claimOf("thread-4-neutral-renewal"), ledger, pack, undefined, { senderCheck: "verified" });
    expect(streamhut.headline).toBe("You have no history with this sender.");
  });

  it("loading twice keeps one demo shipment", async () => {
    const store = fakeStore(demoSeed());
    await loadMatchingShipmentDemo(store.save);
    await loadMatchingShipmentDemo(store.save);
    expect(store.snapshot().shipments).toHaveLength(1);
  });

  it("a stored parcel that is not expected does not count as the demo", () => {
    const { shipment } = matchingShipmentDemo();
    expect(hasMatchingShipmentDemo({ shipments: [{ ...shipment, expected: false }] })).toBe(false);
  });
});

describe("homepage UPS chip", () => {
  it("stores the matching shipment first, so the chip comes back safe", async () => {
    const store = fakeStore(demoSeed());
    const note = await prepareTryChip("thread-3-safe-carrier", store.save);
    expect(note).toBe(CHIP_DEMO_NOTE);
    const verdict = decideVerdict(claimOf("thread-3-safe-carrier"), store.snapshot(), pack, undefined, { senderCheck: "verified" });
    expect(verdict.outcome).toBe("safe");
    expect(verdict.headline).toBe("This tracking number matches a shipment you are expecting.");
  });

  it("leaves the ledger alone for the other chips", async () => {
    const store = fakeStore(demoSeed());
    expect(await prepareTryChip("thread-1-carrier-lure", store.save)).toBe("");
    expect(await prepareTryChip("thread-4-neutral-renewal", store.save)).toBe("");
    expect(store.snapshot().shipments).toHaveLength(0);
  });
});
