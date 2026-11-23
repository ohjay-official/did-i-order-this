import { describe, expect, it } from "vitest";
import {
  inferCarrierFromTracking,
  looksLikeTracking,
  normalizeDomain,
  normalizeOrderId,
  normalizeTracking,
} from "./normalize.ts";
import { NO_HISTORY_RISKY_HEADLINE, STORED_NOT_EXPECTED_HEADLINE, decideVerdict, isCarrierClaim, isKnownSender } from "./verdict.ts";
import { ingestOrderFromClaim, ingestSenderFromClaim, ingestShipmentFromClaim } from "./ingest.ts";
import { extractCandidateNumbers, runLimitedCheck } from "./limitedCheck.ts";
import type { EmailClaim, LedgerSnapshot, OfficialPack } from "./types.ts";

const pack: OfficialPack = {
  version: "test",
  officialDomains: [
    { domain: "ups.com", name: "UPS", role: "carrier" },
    { domain: "paypal.com", name: "PayPal", role: "bank" },
  ],
  lureTemplates: [
    { id: "fee-to-release", pattern: '"asked_action":"pay"', note: "Asks for a payment." },
    { id: "broken", pattern: "[", note: "Plain-text fallback matched." },
  ],
};

const empty: LedgerSnapshot = { orders: [], shipments: [], senders: [] };

function claim(partial: Partial<EmailClaim> & Pick<EmailClaim, "email_kind">): EmailClaim {
  return {
    claimed_party: { name: "Someone", role: "unknown" },
    asked_action: "none",
    cited_numbers: [],
    ...partial,
  };
}

describe("normalize", () => {
  it("normalizes tracking, order ids and domains", () => {
    expect(normalizeTracking(" 1z 999-aa1 ")).toBe("1Z999AA1");
    expect(normalizeOrderId(" nw 10482 ")).toBe("NW10482");
    expect(normalizeDomain(" WWW.UPS.com ")).toBe("ups.com");
  });

  it("recognises common tracking shapes and rejects plain words", () => {
    expect(looksLikeTracking("1Z999AA10123456784")).toBe(true);
    expect(looksLikeTracking("123456789012")).toBe(true);
    expect(looksLikeTracking("RA123456789US")).toBe(true);
    expect(looksLikeTracking("GM123456789012345")).toBe(true);
    expect(looksLikeTracking("1234 5678 9012")).toBe(true);
    expect(looksLikeTracking("INVOICE")).toBe(false);
    expect(looksLikeTracking("NW-10482")).toBe(false);
  });

  it("only names a carrier when the pattern is unambiguous", () => {
    expect(inferCarrierFromTracking("1Z999AA10123456784")).toBe("UPS");
    expect(inferCarrierFromTracking("123456789012")).toBeUndefined();
    expect(inferCarrierFromTracking("GM123456789012345")).toBeUndefined();
  });
});

describe("decideVerdict edge cases", () => {
  it("keeps login emails that are not delivery or billing out of scope", () => {
    const verdict = decideVerdict(claim({ email_kind: "other", asked_action: "log_in" }), empty, pack, "on_device");
    expect(verdict.outcome).toBe("neutral");
    expect(verdict.reasons).toContain("Account login emails are out of scope.");
  });

  it("treats a delivery problem as a carrier claim only when the domain is an official carrier", () => {
    expect(isCarrierClaim(claim({ email_kind: "delivery_problem" }), pack)).toBe(false);
    expect(
      isCarrierClaim(claim({ email_kind: "delivery_problem", claimed_party: { name: "UPS", role: "unknown", domain: "ups.com" } }), pack),
    ).toBe(true);
    expect(
      isCarrierClaim(claim({ email_kind: "delivery_problem", claimed_party: { name: "Pay", role: "unknown", domain: "paypal.com" } }), pack),
    ).toBe(false);
  });

  it("explains when a carrier email cites no tracking number", () => {
    const verdict = decideVerdict(claim({ email_kind: "carrier_update", asked_action: "pay" }), empty, pack);
    expect(verdict.reasons[0]).toContain("does not cite a tracking number");
    expect(verdict.reasons.join(" ")).toContain("Asks for a payment.");
    expect(verdict.reasons.join(" ")).toContain("Plain-text fallback matched.");
  });

  it("an unmatched shipment notice is neutral, not a warning, and is not offered for saving", () => {
    const verdict = decideVerdict(
      claim({ email_kind: "shipment_notice", cited_numbers: [{ kind: "order", value: "X-1" }] }),
      empty,
      pack,
    );
    expect(verdict.outcome).toBe("neutral");
    expect(verdict.headline).toBe("This looks like a shipment notice, but it does not match an order stored on this device.");
  });

  it("billing from a known sender with an unknown number warns; with no history it stays neutral", () => {
    const ledger: LedgerSnapshot = {
      ...empty,
      senders: [{ domain: "streamhut.example", displayName: "Streamhut", role: "subscription", firstSeenAt: "x", confirmedAt: "x" }],
    };
    const renewal = claim({
      email_kind: "renewal",
      asked_action: "pay",
      claimed_party: { name: "Streamhut", role: "subscription", domain: "streamhut.example" },
      cited_numbers: [{ kind: "invoice", value: "INV-1" }],
    });
    expect(decideVerdict(renewal, ledger, pack).outcome).toBe("warning");
    expect(decideVerdict(renewal, empty, pack).outcome).toBe("neutral");
    expect(decideVerdict(renewal, empty, pack).headline).toBe(NO_HISTORY_RISKY_HEADLINE);
  });

  it("an unclassified email that cites an expected parcel is safe; a stored but not expected one warns; otherwise neutral", () => {
    const shipment = { id: "s", trackingNumber: "1Z999AA10123456784", expected: true, expectedUntil: "2999-01-01T00:00:00Z", source: "import" as const, confirmedAt: "x" };
    const other = claim({ email_kind: "other", cited_numbers: [{ kind: "other", value: "1Z999AA10123456784" }] });
    // Safe only from the carrier's official domain; with no readable domain it is a leaked-number warning.
    expect(decideVerdict(other, { ...empty, shipments: [shipment] }, pack).outcome).toBe("warning");
    const fromUps = claim({ email_kind: "other", claimed_party: { name: "", role: "unknown", domain: "ups.com" }, cited_numbers: [{ kind: "other", value: "1Z999AA10123456784" }] });
    expect(decideVerdict(fromUps, { ...empty, shipments: [shipment] }, pack, undefined, { senderCheck: "verified" }).outcome).toBe("safe");
    expect(decideVerdict(fromUps, { ...empty, shipments: [shipment] }, pack).outcome).toBe("neutral");
    const delivered = decideVerdict(other, { ...empty, shipments: [{ ...shipment, expected: false }] }, pack);
    expect(delivered.outcome).toBe("warning");
    expect(delivered.headline).toBe(STORED_NOT_EXPECTED_HEADLINE);
    expect(decideVerdict(other, empty, pack).outcome).toBe("neutral");
  });

  it("matches known senders by the real sender domain only, never the display name", () => {
    const ledger = {
      orders: [{ id: "o", merchant: "Northwind", senderDomain: "nw.example", orderId: "1", source: "import" as const, confirmedAt: "x" }],
      senders: [{ domain: "www.shop.example", displayName: "Shop", role: "merchant" as const, firstSeenAt: "x", confirmedAt: "x" }],
    };
    expect(isKnownSender(claim({ email_kind: "receipt", claimed_party: { name: "", role: "merchant", domain: "shop.example" } }), ledger)).toBe(true);
    expect(isKnownSender(claim({ email_kind: "receipt", claimed_party: { name: "", role: "merchant", domain: "mail.nw.example" } }), ledger)).toBe(true);
    expect(isKnownSender(claim({ email_kind: "receipt", claimed_party: { name: " northwind ", role: "merchant" } }), ledger)).toBe(false);
    expect(isKnownSender(claim({ email_kind: "receipt", claimed_party: { name: "Shop", role: "merchant", domain: "evil.example" } }), ledger)).toBe(false);
    expect(isKnownSender(claim({ email_kind: "receipt", claimed_party: { name: "  ", role: "merchant" } }), ledger)).toBe(false);
  });
});

describe("ingest edge cases", () => {
  const meta = { fromDomain: "Shop.Example", subject: "s" };
  it("ignores claims of the wrong kind or without numbers", () => {
    expect(ingestShipmentFromClaim(claim({ email_kind: "receipt" }), meta)).toBeNull();
    expect(ingestShipmentFromClaim(claim({ email_kind: "shipment_notice" }), meta)).toBeNull();
    expect(ingestOrderFromClaim(claim({ email_kind: "shipment_notice" }), meta)).toBeNull();
    expect(ingestOrderFromClaim(claim({ email_kind: "receipt" }), meta)).toBeNull();
    expect(ingestSenderFromClaim(claim({ email_kind: "renewal" }), meta)).toBeNull();
    expect(ingestSenderFromClaim(claim({ email_kind: "receipt", claimed_party: { name: "UPS", role: "carrier" } }), meta)).toBeNull();
    expect(ingestSenderFromClaim(claim({ email_kind: "receipt" }), { fromDomain: "", subject: "" })).toBeNull();
  });

  it("falls back to the From domain and keeps sender roles", () => {
    const order = ingestOrderFromClaim(
      claim({ email_kind: "receipt", claimed_party: { name: "", role: "merchant" }, cited_numbers: [{ kind: "invoice", value: "a 1" }] }),
      meta,
    );
    expect(order?.senderDomain).toBe("shop.example");
    expect(order?.merchant).toBe("Unknown merchant");
    expect(order?.orderId).toBe("A1");
    for (const role of ["bank", "subscription", "merchant", "unknown"] as const) {
      const sender = ingestSenderFromClaim(claim({ email_kind: "receipt", claimed_party: { name: "N", role } }), meta);
      expect(sender?.role).toBe(role === "unknown" ? "other" : role);
    }
  });

  it("uses the carrier name when a carrier sends the shipment notice", () => {
    const shipment = ingestShipmentFromClaim(
      claim({ email_kind: "shipment_notice", claimed_party: { name: "DHL", role: "carrier" }, cited_numbers: [{ kind: "tracking", value: "gm 1234567890" }] }),
      meta,
    );
    expect(shipment?.carrier).toBe("DHL");
    expect(shipment?.merchant).toBeUndefined();
    expect(shipment?.trackingNumber).toBe("GM1234567890");
  });
});

describe("limited check edge cases", () => {
  it("dedupes numbers and reports every ledger relation", () => {
    expect(extractCandidateNumbers("1Z999AA10123456784 and 1Z999AA10123456784")).toEqual(["1Z999AA10123456784"]);
    const ledger: LedgerSnapshot = {
      ...empty,
      shipments: [
        { id: "a", trackingNumber: "1Z999AA10123456784", expected: true, expectedUntil: "2999-01-01T00:00:00Z", source: "import", confirmedAt: "x" },
        { id: "b", trackingNumber: "123456789012", expected: false, source: "import", confirmedAt: "x" },
      ],
    };
    const result = runLimitedCheck("1Z999AA10123456784 123456789012 999999999999", { fromDomain: "ups.com", senderVerified: true }, ledger, pack);
    const text = result.findings.join(" ");
    expect(text).toContain("listed as official for UPS");
    expect(text).toContain("matches a shipment you are expecting");
    expect(text).toContain("not as an expected parcel");
    expect(text).toContain("does not match a tracking number");
  });

  it("handles no domain and no numbers", () => {
    const result = runLimitedCheck("hello there", { fromDomain: "" }, empty, pack);
    expect(result.findings[0]).toContain("No sender domain");
    expect(result.findings[1]).toContain("No tracking-like numbers");
  });
});
