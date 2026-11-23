import { describe, expect, it } from "vitest";
import {
  NOTHING_EXPECTED_HEADLINE,
  type EmailClaim,
  type LedgerOrder,
  type LedgerSender,
  type LedgerShipment,
  type OfficialPack,
} from "./types.ts";
import { NO_HISTORY_RISKY_HEADLINE, decideVerdict, hasExpectedParcel, labelForSource } from "./verdict.ts";
import { normalizeTracking } from "./normalize.ts";

const pack: OfficialPack = {
  version: "test",
  officialDomains: [
    { domain: "ups.com", name: "UPS", role: "carrier" },
    { domain: "dhl.com", name: "DHL", role: "carrier" },
    { domain: "northwind-outfitters.example", name: "Northwind Outfitters", role: "merchant" },
  ],
  // The fictional store domains these unit tests use, as if vetted (DMARC p=reject), so the Safe paths stay covered.
  storeDomains: [
    { domain: "shop.northwind-outfitters.example", name: "Northwind Outfitters", dmarc: "reject", checked: "test" },
    { domain: "streamhut.example", name: "Streamhut", dmarc: "reject", checked: "test" },
    { domain: "billing.streamhut.example", name: "Streamhut", dmarc: "reject", checked: "test" },
  ],
  lureTemplates: [
    {
      id: "fee-to-release",
      pattern: '"asked_action":"pay"',
      note: "The wording asks for a payment, which is common in parcel-hold lures.",
    },
  ],
};

const deliveredOrder: LedgerOrder = {
  id: "ord-1",
  merchant: "Northwind Outfitters",
  senderDomain: "shop.northwind-outfitters.example",
  orderId: "NW-10001",
  status: "delivered",
  source: "demo_seed",
  confirmedAt: "demo_seed",
};

const expectedShipment: LedgerShipment = {
  id: "ship-1",
  trackingNumber: "1Z999AA10123456784",
  carrier: "UPS",
  orderId: "NW-10482",
  merchant: "Northwind Outfitters",
  expected: true,
  source: "shipment_email",
  confirmedAt: "2026-11-12T00:00:00.000Z",
};

const northwindSender: LedgerSender = {
  domain: "shop.northwind-outfitters.example",
  displayName: "Northwind Outfitters",
  role: "merchant",
  firstSeenAt: "demo_seed",
  confirmedAt: "demo_seed",
};

const emptyLedger = {
  orders: [deliveredOrder],
  shipments: [] as LedgerShipment[],
  senders: [northwindSender],
};

const expectingLedger = {
  orders: [deliveredOrder],
  shipments: [expectedShipment],
  senders: [northwindSender],
};

function carrierClaim(overrides: Partial<EmailClaim> = {}): EmailClaim {
  return {
    claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
    asked_action: "pay",
    cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
    email_kind: "carrier_update",
    ...overrides,
  };
}

describe("hasExpectedParcel", () => {
  it("is false when there are no shipments", () => {
    expect(hasExpectedParcel({ shipments: [] })).toBe(false);
  });

  it("is false when every shipment is already delivered", () => {
    expect(
      hasExpectedParcel({
        shipments: [{ ...expectedShipment, expected: false }],
      }),
    ).toBe(false);
  });

  it("is true when any shipment is expected", () => {
    expect(hasExpectedParcel({ shipments: [expectedShipment] })).toBe(true);
  });
});

describe("labelForSource", () => {
  it("maps on_device and in_cloud to the exact labels", () => {
    expect(labelForSource("on_device")).toBe("Checked on this device");
    expect(labelForSource("in_cloud")).toBe("Checked in the cloud");
    expect(labelForSource(undefined)).toBe("Check not completed");
  });
});

describe("decideVerdict: carrier emails", () => {
  it("warns with the exact headline when nothing is expected", () => {
    const verdict = decideVerdict(carrierClaim(), emptyLedger, pack, "on_device");
    expect(verdict.outcome).toBe("warning");
    expect(verdict.headline).toBe(NOTHING_EXPECTED_HEADLINE);
    expect(verdict.headline).toBe("You're not expecting any parcel right now.");
    expect(verdict.inferenceSourceLabel).toBe("Checked on this device");
    expect(verdict.reasons.some((reason) => reason.includes("GM123456789012345"))).toBe(true);
  });

  it("never returns Neutral for a carrier lure just because the user has not bought from the carrier", () => {
    const verdict = decideVerdict(carrierClaim(), { orders: [], shipments: [], senders: [] }, pack);
    expect(verdict.outcome).toBe("warning");
    expect(verdict.outcome).not.toBe("neutral");
  });

  it("is Safe when the cited tracking number matches a saved shipment", () => {
    const claim = carrierClaim({
      claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" },
      asked_action: "none",
      cited_numbers: [{ kind: "tracking", value: "1Z 999 AA1 0123456784" }],
      email_kind: "carrier_update",
    });
    const verdict = decideVerdict(claim, expectingLedger, pack, "in_cloud", { senderCheck: "verified" });
    expect(verdict.outcome).toBe("safe");
    expect(verdict.inferenceSourceLabel).toBe("Checked in the cloud");
    expect(verdict.headline.toLowerCase()).toContain("matches");
    expect(normalizeTracking("1Z 999 AA1 0123456784")).toBe("1Z999AA10123456784");
  });

  it("warns that the number is not one of the user's shipments when something is expected", () => {
    const verdict = decideVerdict(
      carrierClaim({ cited_numbers: [{ kind: "tracking", value: "1Z999AA19999999999" }] }),
      expectingLedger,
      pack,
      "on_device",
    );
    expect(verdict.outcome).toBe("warning");
    expect(verdict.headline).toBe("This tracking number is not one of your shipments.");
    expect(verdict.headline).not.toBe(NOTHING_EXPECTED_HEADLINE);
  });

  it("treats delivery_problem from an official carrier domain as a carrier claim", () => {
    const claim: EmailClaim = {
      claimed_party: { name: "UPS", role: "unknown", domain: "ups.com" },
      asked_action: "pay",
      cited_numbers: [{ kind: "tracking", value: "1Z999AA19999999999" }],
      email_kind: "delivery_problem",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack);
    expect(verdict.outcome).toBe("warning");
    expect(verdict.headline).toBe(NOTHING_EXPECTED_HEADLINE);
  });

  it("treats claimed_party.role carrier as a carrier claim even when email_kind is other", () => {
    const verdict = decideVerdict(
      carrierClaim({ email_kind: "other" }),
      emptyLedger,
      pack,
    );
    expect(verdict.outcome).toBe("warning");
    expect(verdict.headline).toBe(NOTHING_EXPECTED_HEADLINE);
  });
});

describe("decideVerdict: store order / receipt / shipment notice", () => {
  it("is Safe when a receipt cites a matching order number", () => {
    const claim: EmailClaim = {
      claimed_party: {
        name: "Northwind Outfitters",
        role: "merchant",
        domain: "shop.northwind-outfitters.example",
      },
      asked_action: "none",
      cited_numbers: [{ kind: "order", value: "nw-10001" }],
      email_kind: "receipt",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack, "on_device", { senderCheck: "verified" });
    expect(verdict.outcome).toBe("safe");
    expect(verdict.headline).toBe("This number matches an order stored on this device.");
  });

  it("is Warning when the merchant is known but the order number is not in the ledger", () => {
    const claim: EmailClaim = {
      claimed_party: {
        name: "Northwind Outfitters",
        role: "merchant",
        domain: "shop.northwind-outfitters.example",
      },
      asked_action: "pay",
      cited_numbers: [{ kind: "order", value: "NW-99999" }],
      email_kind: "receipt",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack);
    expect(verdict.outcome).toBe("warning");
    expect(verdict.headline).toBe("You have history with this sender, but this number is not in your stored orders.");
  });

  it("is Neutral when there is no history with the merchant", () => {
    const claim: EmailClaim = {
      claimed_party: { name: "Streamhut", role: "merchant", domain: "billing.streamhut.example" },
      asked_action: "pay",
      cited_numbers: [{ kind: "order", value: "SH-100" }],
      email_kind: "receipt",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack);
    expect(verdict.outcome).toBe("neutral");
    expect(verdict.headline).toBe(NO_HISTORY_RISKY_HEADLINE);
  });

  it("does not warn on an informative shipment notice, even if the order number is new", () => {
    const claim: EmailClaim = {
      claimed_party: {
        name: "Northwind Outfitters",
        role: "merchant",
        domain: "shop.northwind-outfitters.example",
      },
      asked_action: "none",
      cited_numbers: [
        { kind: "order", value: "NW-10482" },
        { kind: "tracking", value: "1Z999AA10123456784" },
      ],
      email_kind: "shipment_notice",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack, "on_device");
    expect(verdict.outcome).not.toBe("warning");
    expect(verdict.headline.toLowerCase()).toContain("shipment notice");
  });
});

describe("decideVerdict: renewal, invoice, refund", () => {
  it("is Safe when a cited invoice number matches a ledger order", () => {
    const claim: EmailClaim = {
      claimed_party: {
        name: "Northwind Outfitters",
        role: "merchant",
        domain: "shop.northwind-outfitters.example",
      },
      asked_action: "none",
      cited_numbers: [{ kind: "invoice", value: "NW-10001" }],
      email_kind: "invoice",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack, undefined, { senderCheck: "verified" });
    expect(verdict.outcome).toBe("safe");
  });

  it("is Warning when the sender is known but the invoice number is not", () => {
    const claim: EmailClaim = {
      claimed_party: {
        name: "Northwind Outfitters",
        role: "merchant",
        domain: "shop.northwind-outfitters.example",
      },
      asked_action: "pay",
      cited_numbers: [{ kind: "invoice", value: "INV-404" }],
      email_kind: "invoice",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack);
    expect(verdict.outcome).toBe("warning");
  });

  it("is Neutral for a renewal from a sender with no history, and does not alarm", () => {
    const claim: EmailClaim = {
      claimed_party: { name: "Streamhut", role: "subscription", domain: "billing.streamhut.example" },
      asked_action: "pay",
      cited_numbers: [{ kind: "subscription", value: "INV-88931" }],
      email_kind: "renewal",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack, "on_device");
    expect(verdict.outcome).toBe("neutral");
    expect(verdict.headline).toBe(NO_HISTORY_RISKY_HEADLINE);
  });

  it("is Safe for a refund whose order number is in the ledger", () => {
    const claim: EmailClaim = {
      claimed_party: {
        name: "Northwind Outfitters",
        role: "merchant",
        domain: "shop.northwind-outfitters.example",
      },
      asked_action: "none",
      cited_numbers: [{ kind: "order", value: "NW-10001" }],
      email_kind: "refund",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack, undefined, { senderCheck: "verified" });
    expect(verdict.outcome).toBe("safe");
  });
});

describe("decideVerdict: unknown sender / unclassifiable", () => {
  it("is Neutral by default and does not warn just because the sender is new", () => {
    const claim: EmailClaim = {
      claimed_party: { name: "Someone", role: "unknown", domain: "random.example" },
      asked_action: "other",
      cited_numbers: [],
      email_kind: "other",
    };
    const verdict = decideVerdict(claim, emptyLedger, pack);
    expect(verdict.outcome).toBe("neutral");
  });

  it("is Safe if a cited order number matches an order from the same sender, and a warning otherwise", () => {
    const claim: EmailClaim = {
      claimed_party: { name: "Unknown desk", role: "unknown", domain: deliveredOrder.senderDomain },
      asked_action: "none",
      cited_numbers: [{ kind: "order", value: "NW-10001" }],
      email_kind: "other",
    };
    expect(decideVerdict(claim, emptyLedger, pack, undefined, { senderCheck: "verified" }).outcome).toBe("safe");
    const noDomain: EmailClaim = { ...claim, claimed_party: { name: "Unknown desk", role: "unknown" } };
    // A stored order number with no readable sender domain is a leaked-number warning (23 Nov rerun).
    expect(decideVerdict(noDomain, emptyLedger, pack).outcome).toBe("warning");
  });
});
