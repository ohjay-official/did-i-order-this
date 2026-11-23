/**
 * The documented sample results (README Try It, docs/TESTING.md) must not move
 * when the code floors change. Each sample's prepared claim, and a deliberately
 * mislabelled claim, is checked against the demo ledger before and after
 * "Load the matching shipment demo".
 */
import { describe, expect, it } from "vitest";
import { decideVerdict, reconcileClaim, senderDomainFromHeader, type EmailClaim, type LedgerSnapshot } from "@did-i-order-this/core";
import { getOfficialPack } from "../packs/official.ts";
import { demoSeed, formatEmailText, sampleThreads } from "./seed.ts";
import { matchingShipmentDemo } from "./shipmentDemo.ts";

const pack = getOfficialPack();
const start: LedgerSnapshot = demoSeed();
const loaded: LedgerSnapshot = { ...start, shipments: [matchingShipmentDemo().shipment] };
const thread = (id: string) => sampleThreads.find((t) => t.id === id)!;
const check = (id: string, ledger: LedgerSnapshot, claim?: EmailClaim) => {
  const t = thread(id);
  const text = formatEmailText(t);
  const c = claim ? reconcileClaim(claim, text, senderDomainFromHeader(text)) : t.expectedClaim;
  return decideVerdict(c, ledger, pack, "on_device", { emailText: text });
};

describe("documented sample results", () => {
  it("fake DHL: Warning, nothing expected; after the demo shipment, not one of your shipments", () => {
    expect(check("thread-1-carrier-lure", start).headline).toBe("You're not expecting any parcel right now.");
    expect(check("thread-1-carrier-lure", loaded).headline).toBe("This tracking number is not one of your shipments.");
  });
  it("UPS from ups.com: Warning before the demo shipment, Safe after", () => {
    expect(check("thread-3-safe-carrier", start).outcome).toBe("warning");
    const v = check("thread-3-safe-carrier", loaded);
    expect(v.outcome).toBe("safe");
    expect(v.headline).toBe("This tracking number matches a shipment you are expecting.");
  });
  it("Duty payment: not one of your shipments once a parcel is expected", () => {
    expect(check("thread-5-wrong-tracking", loaded).headline).toBe("This tracking number is not one of your shipments.");
  });
  it("Streamhut renewal stays Neutral", () => {
    expect(check("thread-4-neutral-renewal", start).outcome).toBe("neutral");
  });
  it("Northwind shipment notice stays Neutral (NW-10482 is not a stored order); its 'do not need to pay or sign in' is not a demand", () => {
    const v = check("thread-2-shipment-notice", start);
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe("This looks like a shipment notice, but it does not match an order stored on this device.");
  });
  it("the genuine UPS email stays Safe however the model labels it", () => {
    for (const asked of ["none", "other", "confirm"] as const) {
      const claim: EmailClaim = { claimed_party: { name: "UPS", role: "unknown" }, asked_action: asked, cited_numbers: [], email_kind: "other" };
      expect(check("thread-3-safe-carrier", loaded, claim).outcome).toBe("safe");
    }
  });
});
