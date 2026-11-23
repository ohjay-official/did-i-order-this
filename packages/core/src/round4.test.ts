/**
 * Round 4 regressions: every core-level case from the round 4 cold judge
 * (PoCs A1 to A7, B1, B2, C1, C2, E1, F1) and security audit (M1, M2, L1, L2),
 * plus the decisions taken for them. Each failed on main 6623594.
 */
import { describe, expect, it } from "vitest";
import { zipSync } from "fflate";
import pack0 from "../../../web/src/packs/official.json" with { type: "json" };
import {
  FLAGGED_HEADLINE,
  FIXTURE_HEADLINE,
  IMAGE_HOST_HEADLINE,
  LABEL_NOT_NONE_HEADLINE,
  LOOKALIKE_MATCH_HEADLINE,
  MODEL_INPUT_CHARS,
  NO_HISTORY_RISKY_HEADLINE,
  OFFICIAL_LINK_HEADLINE,
  RELAY_ORDER_HEADLINE,
  STORE_UNVERIFIED_HEADLINE,
  TOO_LONG_HEADLINE,
  canSaveShipmentFromClaim,
  decideVerdict,
  hostOfTarget,
  isVettedStore,
  parseOrderHistoryFile,
  readLinkHosts,
  readTextSignals,
  reconcileClaim,
  runLimitedCheck,
  senderDomainFromHeader,
  unwrapRedirect,
  type EmailClaim,
  type LedgerSnapshot,
  type OfficialPack,
  type VerdictOptions,
} from "./index.ts";

const pack = pack0 as OfficialPack;
const now = "2026-11-23T00:00:00Z";
const AMZ = "112-4455667-8899001";
const EBAY = "12-34567-89012";
const TGT = "TGT40021187";
const T = "1Z999AA10123456784";
const FDX = "612345678901";
const ledger: LedgerSnapshot = {
  orders: [
    { id: "o1", merchant: "Amazon", senderDomain: "amazon.com", orderId: AMZ, source: "import", confirmedAt: now },
    { id: "o2", merchant: "Northwind", senderDomain: "northwindshop.com", orderId: "NW-99812", source: "import", confirmedAt: now },
    { id: "o3", merchant: "eBay", senderDomain: "ebay.com", orderId: EBAY, source: "import", confirmedAt: now },
    { id: "o4", merchant: "Target", senderDomain: "target.com", orderId: TGT, source: "import", confirmedAt: now },
  ],
  shipments: [
    { id: "s1", trackingNumber: T, carrier: "UPS", expected: true, source: "import", confirmedAt: now },
    { id: "s2", trackingNumber: FDX, carrier: "FedEx", expected: true, source: "import", confirmedAt: now },
  ],
  senders: [{ domain: "amazon.com", displayName: "Amazon", role: "merchant", firstSeenAt: now, confirmedAt: now }],
};
const store = (num: string, action: EmailClaim["asked_action"] = "none", kind: EmailClaim["email_kind"] = "receipt", name = "Amazon"): EmailClaim => ({
  claimed_party: { name, role: "merchant" },
  asked_action: action,
  cited_numbers: [{ kind: "order", value: num }],
  email_kind: kind,
});
const ups = (action: EmailClaim["asked_action"] = "none"): EmailClaim => ({
  claimed_party: { name: "UPS", role: "carrier" },
  asked_action: action,
  cited_numbers: [{ kind: "tracking", value: T }],
  email_kind: "carrier_update",
});
/** As the extension calls it: Gmail's sender, verified unless an option says otherwise. */
function gmail(fromDomain: string, text: string, claim: EmailClaim, options: VerdictOptions = {}) {
  const c = reconcileClaim(claim, text, fromDomain);
  return decideVerdict(c, ledger, pack, "on_device", { emailText: text, senderCheck: "verified", ...options });
}

describe("decision 1: store Safe needs the exact domain and a vetted DMARC p=reject store", () => {
  it("A1: a marketplace.amazon.com relay citing the real order, fee wording and an href-only link, is not Safe", () => {
    const text = `Your order ${AMZ} is held at our warehouse. To keep your order, a small $4.99 fee applies. Keep my order`;
    const v = gmail("marketplace.amazon.com", text, store(AMZ), { linkHosts: ["amzn-keep-order.example"] });
    expect(v.outcome).toBe("warning");
  });
  it("a plain relay message with nothing risky is Neutral with the relay headline", () => {
    const v = gmail("marketplace.amazon.com", `About your order ${AMZ}: thanks for buying from us.`, store(AMZ));
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe(RELAY_ORDER_HEADLINE);
  });
  it("amazon.com (DMARC p=quarantine) on an exact match is Neutral, store can't be authenticated", () => {
    const v = gmail("amazon.com", `Thanks for your order ${AMZ}.`, store(AMZ));
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe(STORE_UNVERIFIED_HEADLINE);
    expect(isVettedStore(pack, "amazon.com")).toBe(false);
  });
  it("target.com (DMARC p=reject) on an exact match is Safe; since round 5 ebay.com is off the list (a marketplace); members.ebay.com is a relay", () => {
    expect(isVettedStore(pack, "target.com")).toBe(true);
    expect(gmail("target.com", `Thanks for your order ${TGT}.`, store(TGT, "none", "receipt", "Target")).outcome).toBe("safe");
    expect(isVettedStore(pack, "ebay.com")).toBe(false);
    expect(gmail("ebay.com", `Thanks for your order ${EBAY}.`, store(EBAY, "none", "receipt", "eBay")).headline).toBe(STORE_UNVERIFIED_HEADLINE);
    expect(gmail("members.ebay.com", `About order ${EBAY}.`, store(EBAY, "none", "receipt", "eBay")).headline).toBe(RELAY_ORDER_HEADLINE);
  });
  it("every vetted store entry is marked reject, and no p=quarantine domain is on the list", () => {
    for (const entry of pack.storeDomains ?? []) expect(entry.dmarc).toBe("reject");
    for (const d of ["amazon.com", "amazon.co.uk", "apple.com", "shein.com", "wayfair.com", "johnlewis.com"]) expect(isVettedStore(pack, d)).toBe(false);
  });
  it("F1: a seller relay cannot plant an expected parcel; an unvetted exact store cannot either", () => {
    const claim: EmailClaim = { ...store(AMZ, "none", "shipment_notice"), cited_numbers: [{ kind: "order", value: AMZ }, { kind: "tracking", value: "1Z999AA10199999999" }] };
    const text = `Your order ${AMZ} shipped, tracking 1Z999AA10199999999`;
    expect(canSaveShipmentFromClaim(reconcileClaim(claim, text, "marketplace.amazon.com"), ledger, pack, { emailText: text, senderCheck: "verified" })).toBe(false);
    expect(canSaveShipmentFromClaim(reconcileClaim(claim, text, "amazon.com"), ledger, pack, { emailText: text, senderCheck: "verified" })).toBe(false);
  });
});

describe("decision 6: demand patterns and negation (M2 evasions, A2, A3, A7)", () => {
  const asks = (text: string) => {
    const s = readTextSignals(text, pack);
    return s.asksToPay || s.asksToLogIn || s.asksToCall || s.parcelFeeLure || s.amountDue;
  };
  it.each([
    ["fee applies", "Your parcel is ready. A $3.10 fee applies before delivery."],
    ["charged then call", "We charged you $499.99 twice. To get your refund, call our refund desk today."],
    ["phone callback", "Call +1 888 555 0100 within 24 hours or it will be cancelled."],
    ["call our desk", "Please call our support desk on the number below."],
    ["call this number", "Call this number now to stop the charge."],
    ["bank transfer", "To release it, transfer £1.45 by bank transfer today."],
    ["wire", "Wire the amount to our agent."],
    ["gift card", "Buy a gift card and send us the code."],
    ["reply with digits", "Reply with the 16 digits on the front of your bank card."],
    ["reply with PIN", "Reply with your PIN to confirm."],
    ["reply with code", "Send us the verification code we texted you."],
    ["date of birth", "Reply with your date of birth."],
    ["text YES", "Text YES to 80080 to confirm delivery."],
    ["to keep your order", "To keep your order, confirm below."],
    ["No worries, simply pay", "Your order is on hold. No worries – simply pay $4.99 today to release it."],
    ["WhatsApp", "WhatsApp our agent on +44 7700 900123."],
  ])("%s is read as a demand", (_name, text) => {
    expect(asks(text)).toBe(true);
  });
  it.each([
    ["do not need to pay or sign in", "This is a notice only. You do not need to pay or sign in."],
    ["never ask you to log in", "We will never ask you to log in by email."],
    ["no need to pay", "There is no need to pay anything."],
    ["thanks for your payment", "Thanks for your PayPal payment."],
    ["plain update", "Your parcel arrives tomorrow. No action is required."],
  ])("%s is not a demand", (_name, text) => {
    expect(asks(text)).toBe(false);
  });
  it("a condition is still a demand: if you do not pay", () => {
    expect(readTextSignals("If you do not pay the fee today, it will be returned.", pack).asksToPay).toBe(true);
  });
  it("A2: a callback refund scam from the store's exact domain is not Safe", () => {
    const text = `We charged you $499.99 twice for order ${EBAY}. To get your refund, call our refund desk on +1 888 555 0100 today.`;
    expect(gmail("ebay.com", text, store(EBAY, "none", "refund", "eBay")).outcome).toBe("warning");
  });
  it("A3: 'No worries – simply pay' from a store is not Safe", () => {
    const text = "Your order NW-99812 is on hold. No worries – simply pay $4.99 today to release it to the courier.";
    expect(gmail("northwindshop.com", text, store("NW-99812", "none", "receipt", "Northwind")).outcome).toBe("warning");
  });
  it("A7: ups.com, 'a $3.10 fee applies' and an href-only outside link is Warning", () => {
    const text = `Your parcel ${T} is ready. A $3.10 fee applies before delivery. Schedule delivery`;
    expect(gmail("ups.com", text, ups(), { linkHosts: ["ups-fee.example"] }).outcome).toBe("warning");
  });
  it("audit B: ups.com, transfer and card digits with label other is Warning", () => {
    const text = `Your parcel ${T} is waiting. To release it, transfer £1.45 by bank transfer today and reply with the 16 digits on the front of your bank card.`;
    expect(gmail("ups.com", text, ups("other")).outcome).toBe("warning");
  });
});

describe("decision 3: link, form and image targets", () => {
  it("unwraps google.com/url redirects in text and targets", () => {
    expect(unwrapRedirect("https://www.google.com/url?q=https://ups-fee.example/x&sa=D")).toBe("https://ups-fee.example/x");
    expect(hostOfTarget("https://www.google.com/url?q=https%3A%2F%2Fups-fee.example%2Fx")).toBe("ups-fee.example");
    expect(hostOfTarget("https://ci3.googleusercontent.com/meips/abc=s0-d-e1-ft#https://img.ups-fee.example/a.png")).toBe("img.ups-fee.example");
    expect(hostOfTarget("javascript:alert(1)")).toBe("unreadable-target.invalid");
    expect(hostOfTarget("mailto:a@b.com")).toBe("");
    expect(readLinkHosts("See https://www.google.com/url?q=https://ups-fee.example/x")).toEqual(["ups-fee.example"]);
  });
  it("audit D: ups.com with an anchor-only outside link is Warning, not Safe", () => {
    const v = gmail("ups.com", `Your parcel ${T} arrives tomorrow. Manage delivery`, ups(), { linkHosts: ["ups-redelivery.example"] });
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(OFFICIAL_LINK_HEADLINE);
  });
  it("an image from outside the official list caps Safe at Neutral; one from ups.com does not", () => {
    expect(gmail("ups.com", `Your parcel ${T} arrives tomorrow.`, ups(), { imageHosts: ["tracker.example"] }).headline).toBe(IMAGE_HOST_HEADLINE);
    expect(gmail("ups.com", `Your parcel ${T} arrives tomorrow.`, ups(), { imageHosts: ["www.ups.com"] }).outcome).toBe("safe");
  });
});

describe("decision 4 and 5: full text and hidden text", () => {
  it("A5 and A6: a demand after 20,000 characters of padding is still read, and a long email is never Safe", () => {
    const pad = "\u200bx ".repeat(10_500);
    const text = `${pad}Pay the customs fee at https://ups-fee.example`;
    expect(text.length).toBeGreaterThan(MODEL_INPUT_CHARS);
    expect(gmail("ups.com", text, ups()).outcome).toBe("warning");
    const plain = `${"x ".repeat(10_500)}Your parcel ${T} arrives tomorrow.`;
    expect(gmail("ups.com", plain, ups()).headline).toBe(TOO_LONG_HEADLINE);
    expect(gmail("ups.com", `Your parcel ${T} arrives tomorrow.`, ups(), { truncated: true }).headline).toBe(TOO_LONG_HEADLINE);
  });
  it("hidden text that differs from what is shown is a risky ask", () => {
    const v = gmail("ups.com", `Your parcel ${T} arrives tomorrow.`, ups(), { hiddenText: true });
    expect(v.outcome).toBe("warning");
    expect(v.reasons[0]).toMatch(/hidden from view/);
  });
});

describe("decision 7: Safe needs the model label none", () => {
  it("label other or confirm on a clean ups.com email is Neutral", () => {
    expect(gmail("ups.com", `Your parcel ${T} arrives tomorrow.`, ups("other")).headline).toBe(LABEL_NOT_NONE_HEADLINE);
    expect(gmail("ups.com", `Your parcel ${T} arrives tomorrow.`, ups("confirm")).outcome).toBe("neutral");
    expect(gmail("ups.com", `Your parcel ${T} arrives tomorrow.`, ups("none")).outcome).toBe("safe");
  });
});

describe("decision 8: the leaked-tracking check runs first", () => {
  it("B1: a real FedEx number labelled as an order by a lookalike sender is a leaked-number Warning", () => {
    const text = `Delivery ${FDX} is on hold. Pay $2.99 today to keep it: https://parcel-status.example/pay`;
    const v = gmail("parcel-status.example", text, store(FDX, "pay", "receipt", "Delivery Desk"));
    expect(v.outcome).toBe("warning");
    expect(v.headline).toBe(LOOKALIKE_MATCH_HEADLINE);
    expect(v.reasons.join(" ")).not.toMatch(/not an alarm/);
  });
  it("B2: the same with kind other and role unknown", () => {
    const text = `Delivery ${FDX} is on hold. Pay $2.99 today to keep it: https://parcel-status.example/pay`;
    const claim: EmailClaim = { claimed_party: { name: "Delivery Desk", role: "unknown" }, asked_action: "pay", cited_numbers: [{ kind: "order", value: FDX }], email_kind: "other" };
    expect(gmail("parcel-status.example", text, claim).headline).toBe(LOOKALIKE_MATCH_HEADLINE);
  });
  it("C2: the limited check keeps the leaked line for a forged pasted ups.com From", () => {
    const r = runLimitedCheck(`From: UPS <a@ups.com>\n\nParcel ${T} is held.`, { fromDomain: "ups.com", senderVerified: false }, ledger, pack);
    expect(r.findings.some((f) => f.includes("likely leaked"))).toBe(true);
    const ok = runLimitedCheck(`Parcel ${T} is on the way.`, { fromDomain: "ups.com", senderVerified: true }, ledger, pack);
    expect(ok.findings.some((f) => f.includes("likely leaked"))).toBe(false);
  });
  it("E1: a USPS parcel cited by ups.com is not the same carrier in the limited check", () => {
    const usps = "9400111899223397623910";
    const l2: LedgerSnapshot = { ...ledger, shipments: [{ id: "s3", trackingNumber: usps, carrier: "USPS", expected: true, source: "import", confirmedAt: now }] };
    const r = runLimitedCheck(`Your USPS parcel ${usps} ...`, { fromDomain: "ups.com", senderVerified: true }, l2, pack);
    expect(r.findings.some((f) => f.includes("likely leaked"))).toBe(true);
  });
});

describe("decision 9: copy on risky results", () => {
  it("C1: a paypal.com invoice with a callback number gets no reassuring lines", () => {
    const text = "Norton LifeLock renewal $499.99. If you did not authorise this, call +1 888 555 0100.";
    const claim: EmailClaim = { claimed_party: { name: "PayPal", role: "bank" }, asked_action: "none", cited_numbers: [{ kind: "invoice", value: "INV-7781" }], email_kind: "invoice" };
    const v = gmail("paypal.com", text, claim);
    expect(v.outcome).not.toBe("safe");
    expect(v.headline).toBe(NO_HISTORY_RISKY_HEADLINE);
    expect(v.reasons.join(" ")).not.toMatch(/listed as official|not an alarm/);
  });
  it("a Safe result never says the domain is not in the pack", () => {
    const v = gmail("target.com", `Thanks for your order ${TGT}.`, store(TGT, "none", "receipt", "Target"));
    expect(v.outcome).toBe("safe");
    expect(v.reasons.join(" ")).not.toMatch(/not in the official-domain pack/);
  });
});

describe("decision 2 and 10: flagged and fixture senders cap at Neutral", () => {
  it("audit F: Gmail-flagged mail never gets Safe", () => {
    const c = reconcileClaim(ups(), `Your parcel ${T} arrives tomorrow.`, "ups.com");
    expect(decideVerdict(c, ledger, pack, "on_device", { emailText: `Your parcel ${T} arrives tomorrow.`, senderCheck: "flagged" }).headline).toBe(FLAGGED_HEADLINE);
    expect(decideVerdict(c, ledger, pack, "on_device", { emailText: `Your parcel ${T} arrives tomorrow.`, senderCheck: "fixture" }).headline).toBe(FIXTURE_HEADLINE);
  });
  it("pasted text still stops at Neutral", () => {
    const text = `From: UPS <mcinfo@ups.com>\nSubject: Update\n\nYour parcel ${T} arrives today.`;
    const c = reconcileClaim(ups(), text, senderDomainFromHeader(text));
    expect(decideVerdict(c, ledger, pack, "on_device", { emailText: text, senderCheck: "pasted" }).outcome).toBe("neutral");
  });
});

describe("L1: the ZIP import caps the total inflated size", () => {
  it("many entries each under the per-entry cap are stopped by the total cap", () => {
    const part = new Uint8Array(20 * 1024 * 1024).fill(0x41);
    const zip = zipSync({ "a.csv": [part, { level: 1 }], "b.csv": [part, { level: 1 }], "c.csv": [part, { level: 1 }] });
    expect(() => parseOrderHistoryFile({ name: "x.zip", bytes: zip })).toThrow(/all of them together/);
  }, 60_000);
});
