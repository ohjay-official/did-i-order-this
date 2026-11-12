import { describe, expect, it } from "vitest";
import { ingestOrderFromClaim, ingestSenderFromClaim, ingestShipmentFromClaim } from "./ingest.ts";
import type { EmailClaim } from "./types.ts";

const meta = { fromDomain: "shop.northwind-outfitters.example", subject: "Your order has shipped" };

describe("ingestShipmentFromClaim", () => {
  it("saves tracking number and carrier with expected true for a shipment notice", () => {
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
    const shipment = ingestShipmentFromClaim(claim, meta);
    expect(shipment).not.toBeNull();
    expect(shipment?.trackingNumber).toBe("1Z999AA10123456784");
    expect(shipment?.carrier).toBe("UPS");
    expect(shipment?.expected).toBe(true);
    expect(shipment?.orderId).toBe("NW-10482");
    expect(shipment?.merchant).toBe("Northwind Outfitters");
    expect(shipment?.source).toBe("shipment_email");
  });

  it("returns null for marketing mail", () => {
    const claim: EmailClaim = {
      claimed_party: { name: "Sales", role: "unknown", domain: "promo.example" },
      asked_action: "other",
      cited_numbers: [],
      email_kind: "other",
    };
    expect(ingestShipmentFromClaim(claim, meta)).toBeNull();
    expect(ingestOrderFromClaim(claim, meta)).toBeNull();
    expect(ingestSenderFromClaim(claim, meta)).toBeNull();
  });
});

describe("ingestOrderFromClaim", () => {
  it("saves an order and a sender from a receipt", () => {
    const claim: EmailClaim = {
      claimed_party: {
        name: "Northwind Outfitters",
        role: "merchant",
        domain: "shop.northwind-outfitters.example",
      },
      asked_action: "none",
      cited_numbers: [{ kind: "order", value: "NW-10001" }],
      email_kind: "receipt",
    };
    const order = ingestOrderFromClaim(claim, meta);
    const sender = ingestSenderFromClaim(claim, meta);
    expect(order?.orderId).toBe("NW-10001");
    expect(order?.merchant).toBe("Northwind Outfitters");
    expect(order?.source).toBe("receipt_email");
    expect(sender?.domain).toBe("shop.northwind-outfitters.example");
    expect(sender?.displayName).toBe("Northwind Outfitters");
    expect(sender?.role).toBe("merchant");
  });
});
