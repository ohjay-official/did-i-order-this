/**
 * Round 6 regressions, from the strict security audit of 23 Nov 2026
 * (docs/reviews/judges/2026-11-23-r6-2-security.md). Every attack email comes
 * from the carrier's real domain, through a verified sender, citing an
 * expected parcel, so only these checks stand between it and Safe.
 */
import { describe, expect, it } from "vitest";
import pack0 from "../../../web/src/packs/official.json" with { type: "json" };
import {
  decideVerdict,
  ingestShipmentFromClaim,
  isExpectedShipment,
  makeExpectedShipment,
  readLinkHosts,
  readTextSignals,
  runLimitedCheck,
  type EmailClaim,
  type LedgerSnapshot,
  type OfficialPack,
} from "./index.ts";

const pack = pack0 as OfficialPack;
const T = "1Z999AA10123456784";
const now = new Date().toISOString();
const ledger: LedgerSnapshot = {
  orders: [],
  shipments: [{ id: "s1", trackingNumber: T, carrier: "UPS", expected: true, source: "manual", confirmedAt: now }],
  senders: [],
};
const claim: EmailClaim = {
  claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" },
  asked_action: "none",
  cited_numbers: [{ kind: "tracking", value: T }],
  email_kind: "carrier_update",
};
const email = (line: string) =>
  `From: UPS <pkginfo@ups.com>\nSubject: UPS Update: Package Scheduled for Delivery\n\nYour package ${T} is scheduled for delivery.\n${line}\nThank you for shipping with UPS.`;
const verdict = (text: string, extra = {}) =>
  decideVerdict(claim, ledger, pack, "on_device", { emailText: text, senderCheck: "verified", linkHosts: [], imageHosts: [], ...extra });

describe("F1: a site named in plain text in any form stops Safe", () => {
  const cases: [string, string][] = [
    ["unlisted TLD .pw", "Message from shipper: a customs hold applies, see ups-customs.pw before Friday."],
    ["unlisted TLD .cc", "Message from shipper: to choose a new day go to ups-redelivery.cc today."],
    ["shortener on .gd", "Message from shipper: delivery options at is.gd/Ups4k2"],
    ["ideographic full stop", "Message from shipper: delivery options at ups-redelivery。com"],
    ["full-width stop", "Message from shipper: delivery options at ups-redelivery．com"],
    ["spaced dots", "Message from shipper: delivery options at ups-redelivery . com"],
    ["bare IPv4 with a path", "Message from shipper: delivery options at 203.0.113.7/redeliver"],
    ["percent-encoded dot", "Message from shipper: delivery options at https://ups-fee%2Ecom/pay"],
    ["dotless URL host", "Message from shipper: delivery options at https://upsfee/pay"],
  ];
  for (const [name, line] of cases) {
    it(name, () => {
      const text = email(line);
      expect(readTextSignals(text, pack).linkHosts.some((host) => !host.endsWith("ups.com"))).toBe(true);
      expect(verdict(text).outcome).not.toBe("safe");
    });
  }
  it("control: the genuine notice with no outside site is still Safe", () => {
    expect(verdict(email("Track it on ups.com or in the UPS app.")).outcome).toBe("safe");
  });
  it("control: a file name or a price is not taken for a site", () => {
    expect(readLinkHosts("See label.pdf and receipt.PNG, total 1.99, version 2.0.1, e.g. today.")).toEqual([]);
    expect(verdict(email("Your label is attached as label.pdf. Total 1.99.")).outcome).toBe("safe");
  });
});

describe("F2: a parcel saved from a notice stops being expected after 30 days", () => {
  it("ingestShipmentFromClaim sets expectedUntil", () => {
    const s = ingestShipmentFromClaim(
      {
        claimed_party: { name: "Target", role: "merchant", domain: "target.com" },
        asked_action: "none",
        cited_numbers: [{ kind: "tracking", value: T }, { kind: "order", value: "102000111" }],
        email_kind: "shipment_notice",
      },
      { fromDomain: "target.com", subject: "Shipped" },
    )!;
    expect(s.expectedUntil).toBeDefined();
    expect(isExpectedShipment(s, new Date(Date.now() + 29 * 864e5))).toBe(true);
    expect(isExpectedShipment(s, new Date(Date.now() + 31 * 864e5))).toBe(false);
  });
  it("a row with no or an unreadable end date counts 30 days from confirmedAt, never forever", () => {
    const row = { ...ledger.shipments[0] };
    expect(isExpectedShipment(row, new Date(Date.now() + 31 * 864e5))).toBe(false);
    expect(isExpectedShipment({ ...row, expectedUntil: "not a date" }, new Date(Date.now() + 9e12))).toBe(false);
    expect(isExpectedShipment({ ...row, confirmedAt: "demo_seed" })).toBe(false);
  });
  it("control: a manual entry still counts today and expires at day 31", () => {
    const m = makeExpectedShipment({ trackingNumber: T });
    expect(isExpectedShipment(m)).toBe(true);
    expect(isExpectedShipment(m, new Date(Date.now() + 31 * 864e5))).toBe(false);
  });
});

describe("F3: the limited check flags off-site lures", () => {
  it("a call-back lure from an official sender gets a lure line first", () => {
    const text = email("Message from shipper: please call our desk on +44 20 7946 0958 to confirm your slot.");
    const r = runLimitedCheck(text, { fromDomain: "ups.com", senderVerified: true }, ledger, pack);
    expect(r.findings[0]).toMatch(/phone number, app, handle or payment method/);
  });
  it("an outside site is named", () => {
    const r = runLimitedCheck(email("Options at ups-customs.pw"), { fromDomain: "ups.com", senderVerified: true }, ledger, pack);
    expect(r.findings.some((f) => f.includes("ups-customs.pw"))).toBe(true);
  });
  it("control: the clean notice gets no lure line", () => {
    const r = runLimitedCheck(email("Track it in the UPS app."), { fromDomain: "ups.com", senderVerified: true }, ledger, pack);
    expect(r.findings.some((f) => /official list|phone number|amount to pay/.test(f))).toBe(false);
  });
});

describe("F4: unread attachments or frames cap Safe", () => {
  it("unreadContent gives Neutral", () => {
    expect(verdict(email("Track it in the UPS app."), { unreadContent: true }).outcome).toBe("neutral");
  });
});

describe("F5: the demand scan is not quadratic", () => {
  it("200,000 characters of negated demands read in under 3 seconds", () => {
    const text = "From: Shop <news@shop.example>\nSubject: hi\n\n" + "never pay the fee ".repeat(11_000);
    const t = performance.now();
    readTextSignals(text, pack);
    expect(performance.now() - t).toBeLessThan(3000);
  });
});

describe("I3: stores that run third-party marketplaces are off the vetted list", () => {
  it("target.com and bestbuy.com are not vetted, so an exact-domain order match stops at Neutral", async () => {
    const { isVettedStore } = await import("./index.ts");
    expect(isVettedStore(pack, "target.com")).toBe(false);
    expect(isVettedStore(pack, "bestbuy.com")).toBe(false);
    expect(isVettedStore(pack, "ikea.com")).toBe(true);
  });
});
