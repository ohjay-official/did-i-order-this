import type { EmailClaim, LedgerOrder, LedgerSender, LedgerShipment } from "@did-i-order-this/core";

export interface SampleThread {
  id: string;
  fromName: string;
  fromEmail: string;
  fromDomain: string;
  subject: string;
  date: string;
  body: string;
  expectedClaim: EmailClaim;
}

export interface DemoSeed {
  orders: LedgerOrder[];
  shipments: LedgerShipment[];
  senders: LedgerSender[];
}

export function demoSeed(): DemoSeed {
  return {
    orders: [
      {
        id: "seed-order-nw-10001",
        merchant: "Northwind Outfitters",
        senderDomain: "shop.northwind-outfitters.example",
        orderId: "NW-10001",
        amount: "84.00",
        currency: "USD",
        date: "2026-10-02",
        status: "delivered",
        source: "demo_seed",
        confirmedAt: "demo_seed",
      },
    ],
    shipments: [],
    senders: [
      {
        domain: "shop.northwind-outfitters.example",
        displayName: "Northwind Outfitters",
        role: "merchant",
        firstSeenAt: "demo_seed",
        confirmedAt: "demo_seed",
      },
    ],
  };
}

export const sampleThreads: SampleThread[] = [
  {
    id: "thread-1-carrier-lure",
    fromName: "DHL Express Desk",
    fromEmail: "alerts@dhl-parcel-desk.example",
    fromDomain: "dhl-parcel-desk.example",
    subject: "Your parcel is held. Pay the release fee.",
    date: "12 Nov 2026",
    body: [
      "Dear customer,",
      "",
      "Your parcel could not be delivered and is being held at a DHL facility.",
      "Tracking number: GM123456789012345",
      "",
      "A customs release fee of $2.99 is due. Pay the fee today or the parcel will be returned.",
      "",
      "DHL Express Desk",
    ].join("\n"),
    expectedClaim: {
      claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
      asked_action: "pay",
      cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
      email_kind: "carrier_update",
    },
  },
  {
    id: "thread-2-shipment-notice",
    fromName: "Northwind Outfitters",
    fromEmail: "orders@shop.northwind-outfitters.example",
    fromDomain: "shop.northwind-outfitters.example",
    subject: "Your order has shipped",
    date: "11 Nov 2026",
    body: [
      "Hello,",
      "",
      "Good news: your Northwind Outfitters order NW-10482 has shipped.",
      "Carrier: UPS",
      "Tracking number: 1Z999AA10123456784",
      "",
      "This is a notice only. You do not need to pay or sign in.",
      "",
      "Northwind Outfitters",
    ].join("\n"),
    expectedClaim: {
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
    },
  },
  {
    id: "thread-3-safe-carrier",
    fromName: "UPS",
    fromEmail: "mcinfo@ups.com",
    fromDomain: "ups.com",
    subject: "UPS delivery update for 1Z999AA10123456784",
    date: "12 Nov 2026",
    body: [
      "A UPS package is on the way.",
      "Tracking number: 1Z999AA10123456784",
      "Scheduled delivery is tomorrow.",
      "No action is required.",
    ].join("\n"),
    expectedClaim: {
      claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" },
      asked_action: "none",
      cited_numbers: [{ kind: "tracking", value: "1Z999AA10123456784" }],
      email_kind: "carrier_update",
    },
  },
  {
    id: "thread-4-neutral-renewal",
    fromName: "Streamhut Billing",
    fromEmail: "billing@streamhut.example",
    fromDomain: "streamhut.example",
    subject: "Your Streamhut invoice is due",
    date: "10 Nov 2026",
    body: [
      "Your Streamhut plan renews in three days.",
      "Invoice INV-88931 for $7.99 is ready.",
      "If you want to keep the plan, pay the invoice from your Streamhut account.",
    ].join("\n"),
    expectedClaim: {
      claimed_party: { name: "Streamhut", role: "subscription", domain: "streamhut.example" },
      asked_action: "pay",
      cited_numbers: [{ kind: "invoice", value: "INV-88931" }],
      email_kind: "renewal",
    },
  },
  {
    id: "thread-5-wrong-tracking",
    fromName: "DHL Express Desk",
    fromEmail: "alerts@dhl-parcel-desk.example",
    fromDomain: "dhl-parcel-desk.example",
    subject: "Duty payment required for your shipment",
    date: "12 Nov 2026",
    body: [
      "DHL is holding a parcel for you.",
      "Tracking number: GM999888777666555",
      "Pay a duty fee to release the shipment.",
    ].join("\n"),
    expectedClaim: {
      claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
      asked_action: "pay",
      cited_numbers: [{ kind: "tracking", value: "GM999888777666555" }],
      email_kind: "carrier_update",
    },
  },
];

export function formatEmailText(thread: SampleThread): string {
  return [
    `From: ${thread.fromName} <${thread.fromEmail}>`,
    `Subject: ${thread.subject}`,
    `Date: ${thread.date}`,
    "",
    thread.body,
  ].join("\n");
}
