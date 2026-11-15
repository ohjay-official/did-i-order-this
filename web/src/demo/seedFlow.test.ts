import { describe, expect, it } from "vitest";
import {
  NOTHING_EXPECTED_HEADLINE,
  decideVerdict,
  ingestSenderFromClaim,
  ingestShipmentFromClaim,
  runLimitedCheck,
  type LedgerSnapshot,
} from "@did-i-order-this/core";
import { getOfficialPack } from "../packs/official.ts";
import { demoSeed, formatEmailText, sampleThreads } from "./seed.ts";

const pack = getOfficialPack();
const thread = (id: string) => {
  const found = sampleThreads.find((item) => item.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe("sample inbox walk-through (the demo film order)", () => {
  it("ships five sample threads with unique ids and readable text", () => {
    const ids = sampleThreads.map((item) => item.id);
    expect(new Set(ids).size).toBe(5);
    for (const item of sampleThreads) {
      const text = formatEmailText(item);
      expect(text).toContain(`From: ${item.fromName} <${item.fromEmail}>`);
      expect(text).toContain(item.subject);
    }
  });

  it("thread 1: a fee lure with an empty parcel list gets the exact warning headline", () => {
    const ledger: LedgerSnapshot = demoSeed();
    expect(ledger.shipments).toHaveLength(0);
    const verdict = decideVerdict(thread("thread-1-carrier-lure").expectedClaim, ledger, pack, "on_device");
    expect(verdict.outcome).toBe("warning");
    expect(verdict.headline).toBe(NOTHING_EXPECTED_HEADLINE);
    expect(verdict.inferenceSourceLabel).toBe("Checked on this device");
  });

  it("thread 2 then 3: confirming a shipment notice makes the real carrier email safe", () => {
    const ledger: LedgerSnapshot = demoSeed();
    const notice = thread("thread-2-shipment-notice");
    const noticeVerdict = decideVerdict(notice.expectedClaim, ledger, pack, "in_cloud");
    expect(noticeVerdict.inferenceSourceLabel).toBe("Checked in the cloud");

    const shipment = ingestShipmentFromClaim(notice.expectedClaim, {
      fromDomain: notice.fromDomain,
      subject: notice.subject,
    });
    expect(shipment).not.toBeNull();
    expect(shipment?.trackingNumber).toBe("1Z999AA10123456784");
    expect(shipment?.carrier).toBe("UPS");
    expect(shipment?.orderId).toBe("NW-10482");
    expect(shipment?.expected).toBe(true);
    const sender = ingestSenderFromClaim(notice.expectedClaim, {
      fromDomain: notice.fromDomain,
      subject: notice.subject,
    });
    expect(sender?.domain).toBe("shop.northwind-outfitters.example");

    const withShipment: LedgerSnapshot = { ...ledger, shipments: [shipment!] };
    const safe = decideVerdict(thread("thread-3-safe-carrier").expectedClaim, withShipment, pack, "on_device");
    expect(safe.outcome).toBe("safe");
    expect(safe.headline).toBe("This tracking number matches a shipment you are expecting.");

    const wrong = decideVerdict(thread("thread-5-wrong-tracking").expectedClaim, withShipment, pack, "on_device");
    expect(wrong.outcome).toBe("warning");
    expect(wrong.headline).toBe("This tracking number is not one of your shipments.");

    const lureAgain = decideVerdict(thread("thread-1-carrier-lure").expectedClaim, withShipment, pack);
    expect(lureAgain.outcome).toBe("warning");
    expect(lureAgain.inferenceSourceLabel).toBe("Check not completed");
  });

  it("thread 4: a renewal invoice is not called a scam", () => {
    const verdict = decideVerdict(thread("thread-4-neutral-renewal").expectedClaim, demoSeed(), pack, "on_device");
    expect(verdict.outcome).not.toBe("warning");
  });

  it("limited check on thread 1 finds the number and never claims a full verdict", () => {
    const lure = thread("thread-1-carrier-lure");
    const result = runLimitedCheck(formatEmailText(lure), { fromDomain: lure.fromDomain }, demoSeed(), pack);
    expect(result.inferenceSourceLabel).toBe("Limited check (no AI)");
    expect(result.headline).toBe("Limited check only. This is not a full verdict.");
    expect(result.findings.join(" ")).toContain("GM123456789012345");
    expect(result.findings.join(" ")).toContain("not in the official-domain pack");
  });
});

describe("official pack", () => {
  it("lists the carriers the demo relies on and valid lure patterns", () => {
    const domains = pack.officialDomains.map((entry) => entry.domain);
    expect(domains).toContain("ups.com");
    expect(domains).not.toContain("dhl-parcel-desk.example");
    expect(pack.lureTemplates.some((lure) => lure.id === "fee-to-release")).toBe(true);
  });
});
