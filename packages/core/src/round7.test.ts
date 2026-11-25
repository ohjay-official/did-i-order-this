/**
 * Round 7 regressions from the strict security audit of 23/26 Nov 2026
 * (docs/reviews/judges/2026-11-26-r7-2-security.md). Every attack email in F1
 * comes from the carrier's real domain, verified sender, citing an expected parcel.
 */
import { describe, expect, it } from "vitest";
import pack0 from "../../../web/src/packs/official.json" with { type: "json" };
import {
  decideVerdict,
  isMostlyNonEnglish,
  readLinkHosts,
  reconcileClaim,
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

describe("F1: digit or hyphen TLDs no longer slip past the link scanner", () => {
  const cases: [string, string][] = [
    ["digit-letter TLD evi1.c0m", "Message from shipper: options at evi1.c0m/pay"],
    ["hyphenated TLD evil.c-om", "Message from shipper: options at evil.c-om/pay"],
    ["mixed digits in last label", "Message from shipper: options at ups-fee.co7/pay"],
  ];
  for (const [name, line] of cases) {
    it(name, () => {
      const text = email(line);
      const hosts = readLinkHosts(text);
      expect(hosts.some((host) => !host.endsWith("ups.com"))).toBe(true);
      expect(verdict(text).outcome).not.toBe("safe");
    });
  }
  it("control: a price like 1.99 or a version like 2.0.1 is not a link", () => {
    expect(readLinkHosts("See receipt. Total 1.99, version 2.0.1.")).toEqual([]);
    expect(readLinkHosts("Your order has shipped and arrives on Nov 26, 2026. Order total $24.00.")).toEqual([]);
  });
  it("control: letters-only last label still works", () => {
    const hosts = readLinkHosts("Visit ups-customs.pw for details.");
    expect(hosts).toContain("ups-customs.pw");
  });
});

describe("F2: reconcileClaim drops numbers the model named but the email text does not mention", () => {
  it("drops a model-hallucinated tracking number that is not in the text", () => {
    const text = `From: UPS <alerts@ups.com>\nSubject: delivery update\n\nYour parcel was delivered. Thanks for shipping with UPS.`;
    const hallucinated: EmailClaim = {
      claimed_party: { name: "UPS", role: "carrier" },
      asked_action: "none",
      cited_numbers: [{ kind: "tracking", value: T }],
      email_kind: "carrier_update",
    };
    const fixed = reconcileClaim(hallucinated, text, "ups.com");
    expect(fixed.cited_numbers).toEqual([]);
  });
  it("keeps a number that does appear in the email text", () => {
    const text = `From: UPS <alerts@ups.com>\nSubject: update\n\nTracking ${T}.`;
    const fixed = reconcileClaim({ ...claim, cited_numbers: [{ kind: "tracking", value: T }] }, text, "ups.com");
    expect(fixed.cited_numbers.some((item) => item.value === T)).toBe(true);
  });
  it("matches across spaces and hyphens (number written 1Z 999 AA1 ... in the text)", () => {
    const text = `From: UPS <alerts@ups.com>\nSubject: update\n\nTracking 1Z 999 AA1 012 3456 784.`;
    const fixed = reconcileClaim({ ...claim, cited_numbers: [{ kind: "tracking", value: T }] }, text, "ups.com");
    expect(fixed.cited_numbers.some((item) => item.value === T)).toBe(true);
  });
});

describe("I2: non-English detection catches short lures too", () => {
  it("8+ letters of non-Latin script reads as non-English", () => {
    expect(isMostlyNonEnglish("Zahlen Sie")).toBe(false); // Latin letters, below 3-foreign threshold -> not flagged by sentence rule
    expect(isMostlyNonEnglish("поясните сейчас")).toBe(true); // Cyrillic, above 8 letters
  });
  it("short English text is not flagged", () => {
    expect(isMostlyNonEnglish("Pay $2 now")).toBe(false);
  });
});
