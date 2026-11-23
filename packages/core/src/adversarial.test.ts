/**
 * Regression tests for the 23 Nov 2026 cold judge rerun (section 5a). A scammer
 * who knows a real tracking or order number must not get Safe, whatever the
 * model's label and however the wording is disguised. Ids match the report.
 */
import { describe, expect, it } from "vitest";
import pack0 from "../../../web/src/packs/official.json" with { type: "json" };
import {
  LEAKED_NUMBER_REASON,
  LOOKALIKE_MATCH_HEADLINE,
  ORDER_FROM_OTHER_SENDER_HEADLINE,
  RISKY_ORDER_MATCH_HEADLINE,
  decideVerdict,
  isKnownSender,
  normalizeForSignals,
  readTextSignals,
  reconcileClaim,
  runLimitedCheck,
  senderDomainFromHeader,
  type EmailClaim,
  type LedgerSnapshot,
  type OfficialPack,
} from "./index.ts";

const pack = pack0 as OfficialPack;
/** The official pack plus the fictional Northwind domain as if it were on the vetted DMARC p=reject store list. */
const vettedPack: OfficialPack = {
  ...pack,
  storeDomains: [...(pack.storeDomains ?? []), { domain: "shop.northwind-outfitters.example", name: "Northwind", dmarc: "reject", checked: "test" }],
};
const now = "2026-11-20T00:00:00Z";
const T = "1Z999AA10123456784";
const ledger: LedgerSnapshot = {
  orders: [{ id: "o1", merchant: "Northwind Outfitters", senderDomain: "shop.northwind-outfitters.example", orderId: "NW-10001", source: "import", confirmedAt: now }],
  shipments: [{ id: "s1", trackingNumber: T, carrier: "UPS", expected: true, source: "import", confirmedAt: now }],
  senders: [{ domain: "shop.northwind-outfitters.example", displayName: "Northwind Outfitters", role: "merchant", firstSeenAt: now, confirmedAt: now }],
};
const upsText = (from: string, body: string) => `From: ${from}\nSubject: UPS delivery ${T}\n\nYour UPS parcel ${T} is on hold.\n${body}`;
const carrierClaim = (asked: EmailClaim["asked_action"]): EmailClaim => ({
  claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" },
  asked_action: asked,
  cited_numbers: [{ kind: "tracking", value: T }],
  email_kind: "carrier_update",
});
const storeClaim = (asked: EmailClaim["asked_action"], kind: EmailClaim["email_kind"], order = "NW-10001"): EmailClaim => ({
  claimed_party: { name: "Northwind Outfitters", role: "merchant", domain: "shop.northwind-outfitters.example" },
  asked_action: asked,
  cited_numbers: [{ kind: "order", value: order }],
  email_kind: kind,
});
const run = (text: string, model: EmailClaim) =>
  decideVerdict(reconcileClaim(model, text, senderDomainFromHeader(text)), ledger, pack, "on_device", { emailText: text, senderCheck: "verified" });
const UNOFFICIAL = "UPS <billing@ups-release.example>";

describe("W1 to W10: a real tracking number from an unofficial sender never gives Safe", () => {
  const cases: [string, string, EmailClaim][] = [
    ["W1 fee lure, label other", "A customs clearance charge of USD 1.99 applies. Settle it at https://ups-release.example", carrierClaim("other")],
    ["W2 payment of, label confirm", "A payment of $1.99 is required to schedule delivery.", carrierClaim("confirm")],
    ["W3 settle the outstanding balance, label none", "Please settle the outstanding balance.", carrierClaim("none")],
    ["W4 Cyrillic a in pay", "P\u0430y the fee now.", carrierClaim("other")],
    ["W5 zero-width space", "Pay\u200b the fee now.", carrierClaim("other")],
    ["W6 log on", "Log on to UPS My Choice to reschedule.", carrierClaim("other")],
    ["W7 update your card details", "Update your card details to release the parcel.", carrierClaim("confirm")],
    ["W8 open attachment", "See the attached delivery form and open attachment.", carrierClaim("other")],
    ["W9 payable, paying", "A fee is payable. Complete paying online.", carrierClaim("other")],
    ["W10 the model cites no number", "Please confirm your delivery slot.", { claimed_party: { name: "Desk", role: "unknown" }, asked_action: "confirm", cited_numbers: [], email_kind: "other" }],
    ["W12 nothing risky at all", "Delivery is tomorrow.", carrierClaim("none")],
  ];
  it.each(cases)("%s", (_id, body, model) => {
    const v = run(upsText(UNOFFICIAL, body), model);
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(LOOKALIKE_MATCH_HEADLINE);
    expect(v.reasons[0]).toBe(LEAKED_NUMBER_REASON);
  });
  it("a missing sender domain counts as unofficial", () => {
    const v = run(`UPS <alerts@ups.com>\nYour UPS parcel ${T} is on hold.`, carrierClaim("none"));
    expect(v.headline).toBe(LOOKALIKE_MATCH_HEADLINE);
    expect(v.reasons).toContain("The sender's domain could not be read, so it cannot be the carrier's official domain.");
  });
  it("the same number from ups.com (or a subdomain) is Safe only when the AI read labels no request", () => {
    expect(run(upsText("UPS <mcinfo@ups.com>", "Delivery is tomorrow."), carrierClaim("none")).outcome).toBe("safe");
    expect(run(upsText("UPS <alerts@email.ups.com>", "Delivery is tomorrow."), carrierClaim("none")).outcome).toBe("safe");
    for (const asked of ["other", "confirm"] as const) {
      expect(run(upsText("UPS <mcinfo@ups.com>", "Delivery is tomorrow."), carrierClaim(asked)).outcome).toBe("neutral");
    }
  });
});

describe("added official carrier domains (Royal Mail, Evri, DPD, DHL Germany)", () => {
  const RM = "AB123456789GB";
  const rmLedger: LedgerSnapshot = {
    ...ledger,
    shipments: [{ id: "s2", trackingNumber: RM, carrier: "Royal Mail", expected: true, source: "import", confirmedAt: now }],
  };
  const rmClaim: EmailClaim = {
    claimed_party: { name: "Royal Mail", role: "carrier", domain: "royalmail.com" },
    asked_action: "none",
    cited_numbers: [{ kind: "tracking", value: RM }],
    email_kind: "carrier_update",
  };
  const rmRun = (from: string) => {
    const text = `From: ${from}\nSubject: Your Royal Mail item ${RM}\n\nYour Royal Mail item ${RM} is on its way.`;
    return decideVerdict(reconcileClaim(rmClaim, text, senderDomainFromHeader(text)), rmLedger, pack, "on_device", { emailText: text, senderCheck: "verified" });
  };
  it("is Safe from royalmail.com and Warning from a lookalike", () => {
    expect(rmRun("Royal Mail <no-reply@royalmail.com>").outcome).toBe("safe");
    const fake = rmRun("Royal Mail <no-reply@royalmail-redelivery.example>");
    expect(fake.outcome).toBe("warning");
    expect(fake.reasons[0]).toBe(LEAKED_NUMBER_REASON);
  });
  it("lists each added domain as an official carrier", () => {
    for (const domain of ["dhl.de", "royalmail.com", "evri.com", "dpd.co.uk"]) {
      expect(pack.officialDomains.find((d) => d.domain === domain)?.role).toBe("carrier");
    }
  });
});

describe("the text floors read disguised wording", () => {
  it.each([
    ["W2", "A payment of $1.99 is required.", "asksToPay"],
    ["W3", "Please settle the outstanding balance.", "asksToPay"],
    ["W4", "P\u0430y the fee now.", "asksToPay"],
    ["W5", "Pay\u200b the fee now.", "asksToPay"],
    ["W9", "A fee is payable.", "asksToPay"],
    ["charge", "A handling charge of 2.00 applies.", "asksToPay"],
    ["W6", "Log on to UPS My Choice.", "asksToLogIn"],
    ["login", "Use the login link below.", "asksToLogIn"],
    ["sign in", "Sign in to reschedule.", "asksToLogIn"],
    ["verify", "Verify your account today.", "asksToLogIn"],
    ["W7", "Update your card details now.", "asksToLogIn"],
    ["update payment", "Update your payment information.", "asksToLogIn"],
    ["W8", "Please open attachment.", "asksToDownload"],
    ["download", "Download the delivery form.", "asksToDownload"],
    ["Greek omicron", "L\u03bfg in to your account.", "asksToLogIn"],
    ["bidi mark", "Pay\u202e the fee.", "asksToPay"],
    ["full-width letters", "\uff30\uff41\uff59 the fee.", "asksToPay"],
    ["condition", "If you do not pay the fee, the parcel is returned.", "asksToPay"],
  ] as const)("%s", (_id, text, key) => {
    expect(readTextSignals(text, pack)[key]).toBe(true);
  });
  it.each([
    "This is a notice only. You do not need to pay or sign in.",
    "No action is required.",
    "Thank you for your payment.",
    "Thanks for your order. Your payment was received.",
    "We will never ask you to log in by email.",
    "Free of charge.",
  ])("not a demand: %s", (text) => {
    const s = readTextSignals(text, pack);
    expect(s.asksToPay || s.asksToLogIn || s.asksToDownload).toBe(false);
  });
  it("normalises before matching", () => {
    expect(normalizeForSignals("P\u0430y\u200b  now")).toBe("Pay now");
  });
});

describe("F3, F6: From-line comments and second addresses are not the sender", () => {
  it.each([
    ["F3", "billing@ups-release.example (UPS <alerts@ups.com>)", "ups-release.example"],
    ["F6", "UPS <billing@ups-release.example> (via <alerts@ups.com>)", "ups-release.example"],
    ["nested comments", "x@evil.example (a (b <orders@ups.com>) c) (d)", "evil.example"],
    ["unbalanced comment", "x@evil.example (UPS <alerts@ups.com>", ""],
    ["stray closing paren", "x@evil.example ) <alerts@ups.com>", ""],
    ["stray angle bracket", "x@evil.example > alerts", ""],
    ["two addresses", "UPS <alerts@ups.com> <billing@ups-release.example>", ""],
    ["a list", "a@x.example, b@ups.com", ""],
    ["single quotes are not quoting", "'UPS <alerts@ups.com>' <billing@ups-release.example>", ""],
    ["an unclosed quote", '"UPS <alerts@ups.com>', ""],
    ["escaped paren in a comment", "x@evil.example (UPS \\) <alerts@ups.com>)", "evil.example"],
    ["plain", "UPS <mcinfo@ups.com>", "ups.com"],
    ["apostrophe in a name", "O'Brien Store <shop@obrien.example>", "obrien.example"],
    ["quoted name with a comma", '"Name, Inc." <n@name.example>', "name.example"],
  ])("%s", (_id, from, expected) => {
    expect(senderDomainFromHeader(`From: ${from}\nSubject: x\n\nbody`)).toBe(expected);
  });
  it("F3 and F6 with an honest pay label give the leaked-number warning, not Safe", () => {
    expect(run(upsText("billing@ups-release.example (UPS <alerts@ups.com>)", "Pay the fee."), carrierClaim("pay")).headline).toBe(LOOKALIKE_MATCH_HEADLINE);
    expect(run(upsText("UPS <billing@ups-release.example> (via <alerts@ups.com>)", "Pay the fee."), carrierClaim("pay")).headline).toBe(LOOKALIKE_MATCH_HEADLINE);
  });
  it("the limited check reads the same sender and puts the lure and the leak first", () => {
    const text = upsText("billing@ups-release.example (UPS <alerts@ups.com>)", "Pay the fee. Log in to confirm.");
    const r = runLimitedCheck(text, { fromDomain: senderDomainFromHeader(text) }, ledger, pack);
    expect(r.findings[0]).toBe("The wording asks for a payment, which is common in parcel-hold lures.");
    expect(r.findings[1]).toMatch(/log in, sign in or download/);
    expect(r.findings[2]).toMatch(/real tracking number .* likely leaked/);
    expect(r.findings).toContain("The From domain ups-release.example is not in the official-domain pack.");
  });
});

describe("S1 to S4: store and billing matches", () => {
  it("S1: a comment-forged From is not the store, so the order does not match", () => {
    const text = "From: x@evil.example (Northwind <orders@shop.northwind-outfitters.example>)\nSubject: Payment failed\n\nOrder NW-10001: payment failed. Pay $84 now at https://evil.example";
    const v = run(text, storeClaim("pay", "invoice"));
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(ORDER_FROM_OTHER_SENDER_HEADLINE);
  });
  it("S2: a forged display name earns no sender history", () => {
    const text = 'From: "Northwind Outfitters" <x@evil.example>\nSubject: Receipt\n\nYour order NW-55555 is confirmed.';
    const v = run(text, storeClaim("none", "receipt", "NW-55555"));
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe("You have no history with this sender.");
    expect(isKnownSender({ ...storeClaim("none", "receipt"), claimed_party: { name: "Northwind Outfitters", role: "merchant", domain: "evil.example" } }, ledger)).toBe(false);
  });
  it("S3: the real store domain with a risky ask warns", () => {
    const text = "From: Northwind Outfitters <orders@shop.northwind-outfitters.example>\nSubject: Action needed\n\nOrder NW-10001. Log in to your account and pay $84 now.";
    const v = run(text, storeClaim("pay", "invoice"));
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(RISKY_ORDER_MATCH_HEADLINE);
  });
  it.each([
    ["model label confirm", "Order NW-10001 has shipped.", "confirm"],
    ["update card wording, label none", "Order NW-10001. Update your card details.", "none"],
  ] as const)("S4-style risky ask from the real store domain warns: %s", (_id, body, asked) => {
    const text = `From: Northwind Outfitters <orders@shop.northwind-outfitters.example>\nSubject: Order\n\n${body}`;
    expect(run(text, storeClaim(asked, "receipt")).headline).toBe(RISKY_ORDER_MATCH_HEADLINE);
  });
  it("parcel-fee wording from the real store domain is checked as a carrier email and warns", () => {
    const text = "From: Northwind Outfitters <orders@shop.northwind-outfitters.example>\nSubject: Order\n\nOrder NW-10001 has a customs fee outstanding.";
    expect(run(text, storeClaim("none", "receipt")).outcome).toBe("warning");
  });
  it("S4: comment-forged From plus update card is not Safe", () => {
    const text = "From: x@evil.example (Northwind <orders@shop.northwind-outfitters.example>)\nSubject: Card\n\nOrder NW-10001. Update your card details at https://evil.example";
    expect(run(text, storeClaim("confirm", "receipt")).headline).toBe(ORDER_FROM_OTHER_SENDER_HEADLINE);
  });
  it("a genuine receipt from the store's own domain is Safe only when the store is on the vetted list", () => {
    const text = "From: Northwind Outfitters <orders@shop.northwind-outfitters.example>\nSubject: Receipt\n\nThanks for your order NW-10001. Your payment was received.";
    expect(run(text, storeClaim("none", "receipt")).outcome).toBe("neutral");
    const claim = reconcileClaim(storeClaim("none", "receipt"), text, senderDomainFromHeader(text));
    expect(decideVerdict(claim, ledger, vettedPack, "on_device", { emailText: text, senderCheck: "verified" }).outcome).toBe("safe");
  });
  it("the unclassified fallback warns on an order number from another sender", () => {
    const text = "From: Desk <a@evil.example>\nSubject: x\n\nAbout NW-10001.";
    const claim: EmailClaim = { claimed_party: { name: "x", role: "unknown" }, asked_action: "none", cited_numbers: [{ kind: "order", value: "NW-10001" }], email_kind: "other" };
    expect(run(text, claim).headline).toBe(ORDER_FROM_OTHER_SENDER_HEADLINE);
  });
  it("the unclassified fallback also warns on a risky order match", () => {
    const text = "From: Northwind <orders@shop.northwind-outfitters.example>\nSubject: x\n\nOrder NW-10001. Pay $84 now.";
    const claim: EmailClaim = { claimed_party: { name: "x", role: "unknown" }, asked_action: "pay", cited_numbers: [{ kind: "order", value: "NW-10001" }], email_kind: "other" };
    expect(run(text, claim).headline).toBe(RISKY_ORDER_MATCH_HEADLINE);
  });
  it("a shipment notice that asks for anything risky cannot be saved, even from the store", async () => {
    const { canSaveShipmentFromClaim } = await import("./index.ts");
    const notice: EmailClaim = { ...storeClaim("none", "shipment_notice"), cited_numbers: [{ kind: "order", value: "NW-10001" }, { kind: "tracking", value: "1Z000AA10000000001" }] };
    expect(canSaveShipmentFromClaim(notice, ledger, vettedPack, { emailText: "Order NW-10001 shipped.", senderCheck: "verified" })).toBe(true);
    expect(canSaveShipmentFromClaim(notice, ledger, pack, { emailText: "Order NW-10001 shipped.", senderCheck: "verified" })).toBe(false);
    expect(canSaveShipmentFromClaim(notice, ledger, vettedPack, { emailText: "Order NW-10001 shipped." })).toBe(false);
    expect(canSaveShipmentFromClaim(notice, ledger, vettedPack, { emailText: "Order NW-10001 shipped. Pay the customs fee.", senderCheck: "verified" })).toBe(false);
    expect(canSaveShipmentFromClaim({ ...notice, asked_action: "confirm" }, ledger)).toBe(false);
  });
});
