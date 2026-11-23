/**
 * Regression tests for the 23 Nov 2026 security audit (three-judges review 2).
 * Each case was a working exploit before the fix; ids match the audit report.
 */
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import pack0 from "../../../web/src/packs/official.json" with { type: "json" };
import {
  findOfficialDomain,
  LOOKALIKE_MATCH_HEADLINE,
  RELAY_ORDER_HEADLINE,
  STORE_UNVERIFIED_HEADLINE,
  MAX_IMPORT_BYTES,
  NOTHING_EXPECTED_HEADLINE,
  STORED_NOT_EXPECTED_HEADLINE,
  canSaveShipmentFromClaim,
  decideVerdict,
  ingestSenderFromClaim,
  ingestShipmentFromClaim,
  looksLikeCarrierTracking,
  normalizeDomain,
  parseOrderHistoryFile,
  readTextSignals,
  runLimitedCheck,
  reconcileClaim,
  senderDomainFromHeader,
  type EmailClaim,
  type LedgerSnapshot,
  type OfficialPack,
} from "./index.ts";

const pack = pack0 as OfficialPack;
/** The official pack with amazon.com added to the vetted store list, to exercise the Safe path. */
const vettedPack: OfficialPack = { ...pack, storeDomains: [{ domain: "amazon.com", name: "Amazon", dmarc: "reject", checked: "test" }] };
const now = "2026-11-20T00:00:00Z";
const ledger: LedgerSnapshot = {
  orders: [{ id: "o1", merchant: "Amazon", senderDomain: "amazon.com", orderId: "112-1234567-7654321", source: "import", confirmedAt: now }],
  shipments: [{ id: "s1", trackingNumber: "1Z999AA10123456784", carrier: "UPS", expected: true, source: "import", confirmedAt: now }],
  senders: [{ domain: "amazon.com", displayName: "Amazon", role: "merchant", firstSeenAt: now, confirmedAt: now }],
};
const empty: LedgerSnapshot = { orders: [], shipments: [], senders: [] };
const c = (p: Partial<EmailClaim> & { claimed_party: EmailClaim["claimed_party"] }): EmailClaim => ({
  asked_action: "none",
  cited_numbers: [],
  email_kind: "other",
  ...p,
});

describe("H1: a leaked order number from another domain never gives Safe", () => {
  it("lookalike billing domain + pay + leaked order id is not safe", () => {
    const claim = c({ claimed_party: { name: "Amazon Billing", role: "merchant", domain: "amaz0n-billing.example" }, asked_action: "pay", email_kind: "invoice", cited_numbers: [{ kind: "order", value: "112-1234567-7654321" }] });
    expect(decideVerdict(claim, ledger, pack, "on_device").outcome).not.toBe("safe");
  });
  it("an Amazon order number in a PayPal refund + log in is not safe", () => {
    const claim = c({ claimed_party: { name: "PayPal", role: "bank", domain: "paypa1-secure.example" }, asked_action: "log_in", email_kind: "refund", cited_numbers: [{ kind: "invoice", value: "112-1234567-7654321" }] });
    expect(decideVerdict(claim, ledger, pack, "on_device").outcome).not.toBe("safe");
  });
  it("fallback branch: pay + matching tracking from a non-carrier domain warns", () => {
    const claim = c({ claimed_party: { name: "Customs Office", role: "bank", domain: "customs-pay.example" }, asked_action: "pay", email_kind: "other", cited_numbers: [{ kind: "tracking", value: "1Z999AA10123456784" }] });
    const v = decideVerdict(claim, ledger, pack, "on_device");
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(LOOKALIKE_MATCH_HEADLINE);
  });
  it("shipment notice + download + order from a lookalike domain is not safe", () => {
    const claim = c({ claimed_party: { name: "Amazon", role: "merchant", domain: "amazon-label.example" }, asked_action: "download", email_kind: "shipment_notice", cited_numbers: [{ kind: "order", value: "112-1234567-7654321" }] });
    expect(decideVerdict(claim, ledger, pack, "on_device").outcome).not.toBe("safe");
  });
  it("the same order number from a subdomain is a relay (Neutral), and from the exact domain needs a vetted store for Safe", () => {
    const claim = c({ claimed_party: { name: "Amazon", role: "merchant", domain: "orders.amazon.com" }, email_kind: "receipt", cited_numbers: [{ kind: "order", value: "112-1234567-7654321" }] });
    const relay = decideVerdict(claim, ledger, pack, "on_device", { senderCheck: "verified" });
    expect(relay.outcome).toBe("neutral");
    expect(relay.headline).toBe(RELAY_ORDER_HEADLINE);
    const exact = { ...claim, claimed_party: { ...claim.claimed_party, domain: "amazon.com" } };
    // amazon.com publishes DMARC p=quarantine, so it is not on the vetted list.
    expect(decideVerdict(exact, ledger, pack, "on_device", { senderCheck: "verified" }).headline).toBe(STORE_UNVERIFIED_HEADLINE);
    expect(decideVerdict(exact, ledger, vettedPack, "on_device", { senderCheck: "verified" }).outcome).toBe("safe");
  });
  it("a download demand with a matching tracking number from a non-carrier domain warns", () => {
    const claim = c({ claimed_party: { name: "UPS", role: "carrier", domain: "ups-label.example" }, asked_action: "download", email_kind: "carrier_update", cited_numbers: [{ kind: "tracking", value: "1Z999AA10123456784" }] });
    expect(decideVerdict(claim, ledger, pack, "on_device").headline).toBe(LOOKALIKE_MATCH_HEADLINE);
  });
});

describe("H2: the sender domain comes from the real address, not the display name", () => {
  it("two addresses on the From line give no sender domain (treated as unofficial)", () => {
    expect(senderDomainFromHeader("From: UPS <alerts@ups.com> <billing@ups-release.example>\nSubject: x\n\nbody")).toBe("");
  });
  it("a quoted display name holding an address is ignored", () => {
    expect(senderDomainFromHeader('From: "UPS <alerts@ups.com>" <billing@ups-release.example>\nSubject: held\n\nPay 2.99')).toBe("ups-release.example");
  });
  it("a spoofed display name plus a leaked tracking number gives the lookalike warning, not Safe", () => {
    const text = "From: UPS <alerts@ups.com> <billing@ups-release.example>\nSubject: Fee due\n\nParcel 1Z999AA10123456784 held, pay now.";
    const model = c({ claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" }, asked_action: "pay", email_kind: "carrier_update", cited_numbers: [{ kind: "tracking", value: "1Z999AA10123456784" }] });
    const claim = reconcileClaim(model, text, senderDomainFromHeader(text));
    // Two addresses: no sender domain at all, never the model's ups.com.
    expect(claim.claimed_party.domain).toBeUndefined();
    expect(decideVerdict(claim, ledger, pack, "on_device", { emailText: text }).headline).toBe(LOOKALIKE_MATCH_HEADLINE);
  });
  it("a plain address and a bare address still parse", () => {
    expect(senderDomainFromHeader("From: someone@Mail.Example.com\n\nbody")).toBe("mail.example.com");
    expect(senderDomainFromHeader("From: UPS <mcinfo@ups.com>\nSubject: x")).toBe("ups.com");
  });
});

describe("M1: a missing domain is unofficial, and From is read from the header block only", () => {
  it("carrier match + pay with no From line warns", () => {
    const text = "Your UPS parcel 1Z999AA10123456784 is held. Pay 2.99 EUR at http://ups-release.example";
    const model = c({ claimed_party: { name: "UPS", role: "carrier" }, asked_action: "pay", email_kind: "carrier_update" });
    const claim = reconcileClaim(model, text, senderDomainFromHeader(text));
    expect(claim.claimed_party.domain).toBeUndefined();
    const v = decideVerdict(claim, ledger, pack, "on_device", { emailText: text });
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(LOOKALIKE_MATCH_HEADLINE);
  });
  it("a From line inside the body is not the sender", () => {
    expect(senderDomainFromHeader("Dear customer,\nFrom: UPS <alerts@ups.com>\nParcel 1Z999AA10123456784 held, pay now.")).toBe("");
    expect(senderDomainFromHeader("From: Shop <a@shop.example>\nSubject: x\n\nFrom: UPS <alerts@ups.com>")).toBe("shop.example");
  });
});

describe("M2: the model's domain is never used for the official-domain check", () => {
  it("a trailing dot is stripped, so the real domain is still used", () => {
    const text = "From: UPS <alerts@ups-release.example.>\nParcel 1Z999AA10123456784 held, pay now.";
    const model = c({ claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" }, asked_action: "pay", email_kind: "carrier_update", cited_numbers: [{ kind: "tracking", value: "1Z999AA10123456784" }] });
    const claim = reconcileClaim(model, text, senderDomainFromHeader(text));
    expect(claim.claimed_party.domain).toBe("ups-release.example");
    expect(decideVerdict(claim, ledger, pack, "on_device", { emailText: text }).outcome).toBe("warning");
  });
  it("an invalid sender domain drops the model's domain instead of keeping it", () => {
    const model = c({ claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" }, asked_action: "pay", email_kind: "carrier_update", cited_numbers: [{ kind: "tracking", value: "1Z999AA10123456784" }] });
    const claim = reconcileClaim(model, "From: UPS <x@not_a_domain>\n\npay now", "not_a_domain");
    expect(claim.claimed_party.domain).toBeUndefined();
    expect(decideVerdict(claim, ledger, pack, "on_device").outcome).toBe("warning");
  });
  it("Unicode domains are never turned into an official domain (round 3: no punycode)", () => {
    expect(normalizeDomain("ups.cοm")).not.toBe("ups.com");
    expect(findOfficialDomain(pack, "ups.cοm")).toBeUndefined();
  });
});

describe("M3: code-side floors that model labels cannot remove", () => {
  const DHL_TEXT = "From: DHL Express Desk <alerts@dhl-parcel-desk.example>\nSubject: Your parcel is held. Pay the release fee.\n\nYour parcel is being held at a DHL facility.\nTracking number: GM123456789012345\nA customs release fee of $2.99 is due. Pay the fee today.";
  const reconcile = (claim: EmailClaim) => reconcileClaim(claim, DHL_TEXT, senderDomainFromHeader(DHL_TEXT));
  it("the honest DHL claim warns", () => {
    const honest = c({ claimed_party: { name: "DHL", role: "carrier" }, asked_action: "pay", email_kind: "carrier_update" });
    expect(decideVerdict(reconcile(honest), empty, pack, "on_device", { emailText: DHL_TEXT }).headline).toBe(NOTHING_EXPECTED_HEADLINE);
  });
  it.each([
    ["role unknown, kind other, action none", c({ claimed_party: { name: "Desk", role: "unknown" } })],
    ["role merchant, kind other", c({ claimed_party: { name: "Desk", role: "merchant" } })],
    ["log_in, kind other", c({ claimed_party: { name: "Desk", role: "unknown" }, asked_action: "log_in" })],
    ["receipt from a merchant, action none", c({ claimed_party: { name: "Desk", role: "merchant" }, email_kind: "receipt" })],
    ["shipment notice, action none", c({ claimed_party: { name: "Desk", role: "merchant" }, email_kind: "shipment_notice" })],
    ["renewal, subscription", c({ claimed_party: { name: "Desk", role: "subscription" }, email_kind: "renewal" })],
  ])("a mislabelled DHL fee lure (%s) still warns", (_label, claim) => {
    const v = decideVerdict(reconcile(claim), empty, pack, "on_device", { emailText: DHL_TEXT });
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(NOTHING_EXPECTED_HEADLINE);
  });
  it("asked_action none on a lookalike fee email with a leaked tracking number is not safe", () => {
    const text = "From: UPS <alerts@ups-desk.example>\nSubject: held\n\nParcel 1Z999AA10123456784 is held. Pay the customs fee today.";
    const claim = reconcileClaim(c({ claimed_party: { name: "UPS", role: "carrier" }, email_kind: "carrier_update" }), text, senderDomainFromHeader(text));
    expect(decideVerdict(claim, ledger, pack, "on_device", { emailText: text }).headline).toBe(LOOKALIKE_MATCH_HEADLINE);
  });
  it("an unmatched parcel-fee email with no carrier and no number is checked as a carrier email and warns, never neutral", () => {
    const text = "From: Desk <a@desk.example>\nSubject: fee\n\nA redelivery fee is outstanding for your item. Settle it to continue.";
    const claim = reconcileClaim(c({ claimed_party: { name: "Desk", role: "unknown" } }), text, senderDomainFromHeader(text));
    const v = decideVerdict(claim, empty, pack, "on_device", { emailText: text });
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(NOTHING_EXPECTED_HEADLINE);
    expect(v.reasons).toContain("The wording asks for a payment, which is common in parcel-hold lures.");
  });
  it("a plain merchant shipment notice that names UPS keeps its store check", () => {
    const text = "From: Northwind <orders@shop.northwind-outfitters.example>\nSubject: shipped\n\nYour order NW-10482 has shipped.\nCarrier: UPS\nTracking number: 1Z999AA10123456784\nThis is a notice only. You do not need to pay or sign in.";
    const claim = c({ claimed_party: { name: "Northwind Outfitters", role: "merchant", domain: "shop.northwind-outfitters.example" }, email_kind: "shipment_notice", cited_numbers: [{ kind: "order", value: "NW-10482" }, { kind: "tracking", value: "1Z999AA10123456784" }] });
    const v = decideVerdict(claim, empty, pack, "on_device", { emailText: text });
    expect(v.outcome).toBe("neutral");
    expect(readTextSignals(text, pack).asksToPay).toBe(false);
    expect(readTextSignals(text, pack).asksToLogIn).toBe(false);
  });
  it("reads pay, log-in and download demands but not negated mentions", () => {
    expect(readTextSignals("Please pay $3 now", pack).asksToPay).toBe(true);
    expect(readTextSignals("Sign in to your account here", pack).asksToLogIn).toBe(true);
    expect(readTextSignals("Download the attached label", pack).asksToDownload).toBe(true);
    expect(readTextSignals("Thanks for your PayPal payment", pack).asksToPay).toBe(false);
    expect(readTextSignals(undefined, pack).asksToPay).toBe(false);
  });
  it("knows carrier tracking shapes but not plain digit runs", () => {
    expect(looksLikeCarrierTracking("1Z999AA10123456784")).toBe(true);
    expect(looksLikeCarrierTracking("GM123456789012345")).toBe(true);
    expect(looksLikeCarrierTracking("123456789012")).toBe(false);
  });
});

describe("M6: only an expected parcel gives Safe", () => {
  it("a delivered (not expected) shipment warns", () => {
    const l2: LedgerSnapshot = { ...ledger, shipments: [{ ...ledger.shipments[0], expected: false }] };
    const claim = c({ claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" }, asked_action: "pay", email_kind: "carrier_update", cited_numbers: [{ kind: "tracking", value: "1Z999AA10123456784" }] });
    const v = decideVerdict(claim, l2, pack, "on_device");
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(STORED_NOT_EXPECTED_HEADLINE);
  });
});

describe("L1: only a notice that matches a stored order from the same domain can be saved", () => {
  it("an unmatched notice from a stranger cannot be saved", () => {
    const claim = c({ claimed_party: { name: "Northwind", role: "merchant", domain: "nw-shop.example" }, asked_action: "confirm", email_kind: "shipment_notice", cited_numbers: [{ kind: "tracking", value: "1Z000AA10000000001" }] });
    expect(canSaveShipmentFromClaim(claim, empty)).toBe(false);
    // Even if it were stored, a later fee demand with no domain does not become Safe.
    const s = ingestShipmentFromClaim(claim, { fromDomain: "nw-shop.example", subject: "x" });
    const snd = ingestSenderFromClaim(claim, { fromDomain: "nw-shop.example", subject: "x" });
    const later = c({ claimed_party: { name: "UPS", role: "carrier" }, asked_action: "pay", email_kind: "carrier_update", cited_numbers: [{ kind: "tracking", value: "1Z000AA10000000001" }] });
    expect(decideVerdict(later, { orders: [], shipments: [s!], senders: [snd!] }, pack, "on_device").outcome).toBe("warning");
  });
  it("a notice that cites a stored order from the same sender can be saved", () => {
    const claim = c({ claimed_party: { name: "Amazon", role: "merchant", domain: "amazon.com" }, email_kind: "shipment_notice", cited_numbers: [{ kind: "order", value: "112-1234567-7654321" }, { kind: "tracking", value: "1Z000AA10000000001" }] });
    expect(canSaveShipmentFromClaim(claim, ledger, vettedPack, { senderCheck: "verified" })).toBe(true);
    // Not on the vetted list, or no pack to check it against: not saved.
    expect(canSaveShipmentFromClaim(claim, ledger, pack, { senderCheck: "verified" })).toBe(false);
    expect(canSaveShipmentFromClaim(claim, ledger, undefined, { senderCheck: "verified" })).toBe(false);
    expect(canSaveShipmentFromClaim(claim, ledger)).toBe(false);
    expect(canSaveShipmentFromClaim({ ...claim, claimed_party: { ...claim.claimed_party, domain: "amazon-ship.example" } }, ledger)).toBe(false);
    expect(canSaveShipmentFromClaim({ ...claim, cited_numbers: claim.cited_numbers.slice(0, 1) }, ledger)).toBe(false);
    expect(canSaveShipmentFromClaim({ ...claim, email_kind: "receipt" }, ledger)).toBe(false);
  });
});

/** A small zip whose headers claim the entry inflates to `size` bytes, like a crafted zip bomb. */
function zipClaimingSize(name: string, body: string, size: number): Uint8Array {
  const zip = zipSync({ [name]: new TextEncoder().encode(body) });
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = 0; i + 4 <= zip.length; i += 1) {
    const sig = view.getUint32(i, true);
    if (sig === 0x04034b50) view.setUint32(i + 22, size, true);
    if (sig === 0x02014b50) view.setUint32(i + 24, size, true);
  }
  return zip;
}

describe("L3: zip import has size caps", () => {
  it("inflates only CSV entries: other entries are skipped unread", () => {
    const zip = zipSync({ "junk.bin": new Uint8Array(1024 * 1024), "orders.csv": new TextEncoder().encode("order id,merchant\n1,A\n") });
    expect(parseOrderHistoryFile({ name: "x.zip", bytes: zip }).orders).toHaveLength(1);
  });
  it("refuses a CSV entry that claims to inflate past the cap, and an oversized file", () => {
    const bomb = zipClaimingSize("orders.csv", "order id,merchant\n1,A\n", 60 * 1024 * 1024);
    expect(() => parseOrderHistoryFile({ name: "x.zip", bytes: bomb })).toThrow(/inflates to more than 50 MB/);
    expect(() => parseOrderHistoryFile({ name: "x.csv", bytes: new Uint8Array(MAX_IMPORT_BYTES + 1) })).toThrow(/larger than 25 MB/);
  });
});

describe("I2: the limited check agrees with the verdict on subdomains and does not over-match pay", () => {
  it("alerts.ups.com is official in the limited check too", () => {
    expect(runLimitedCheck("x", { fromDomain: "alerts.ups.com", senderVerified: true }, empty, pack).findings[0]).toBe("The From domain alerts.ups.com is listed as official for UPS.");
  });
  it("PayPal or payment alone is not a fee lure", () => {
    const note = "The wording asks for a payment, which is common in parcel-hold lures.";
    expect(runLimitedCheck("Your PayPal payment was received.", { fromDomain: "" }, empty, pack).findings).not.toContain(note);
    expect(runLimitedCheck("Pay the customs fee.", { fromDomain: "" }, empty, pack).findings).toContain(note);
  });
});
