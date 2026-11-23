/**
 * Round 4 regressions through the real extension chain: Gmail DOM ->
 * extractOpenGmailThread -> sanitizeEmail -> reconcileClaim -> decideVerdict.
 * Cases from the round 4 cold judge PoCs (A1 to A7, B1, C1) and the round 3
 * security audit tests (A, B, D, E, F). Each gave Safe or lost a signal on main 6623594.
 */
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  FIXTURE_HEADLINE,
  FLAGGED_HEADLINE,
  HIDDEN_ANY_HEADLINE,
  IMAGE_HOST_HEADLINE,
  TOO_LONG_HEADLINE,
  decideVerdict,
  reconcileClaim,
  type EmailClaim,
  type LedgerSnapshot,
  type OfficialPack,
} from "@did-i-order-this/core";
import pack0 from "../../web/src/packs/official.json" with { type: "json" };
import { extractOpenGmailThread, isHiddenElement } from "./extract.ts";
import { MAX_EMAIL_CHARS, sanitizeEmail, type ExtractedEmail } from "./messages.ts";
import { senderCheckForEmail, verdictOptionsForEmail } from "./senderCheck.ts";

const pack = pack0 as OfficialPack;
const now = "2026-11-23T00:00:00Z";
const AMZ = "112-4455667-8899001";
const T = "1Z999AA10123456784";
const FDX = "612345678901";
const ledger: LedgerSnapshot = {
  orders: [
    { id: "o1", merchant: "Amazon", senderDomain: "amazon.com", orderId: AMZ, source: "import", confirmedAt: now },
    { id: "o2", merchant: "Northwind", senderDomain: "northwindshop.com", orderId: "NW-99812", source: "import", confirmedAt: now },
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
const ups: EmailClaim = { claimed_party: { name: "UPS", role: "carrier" }, asked_action: "none", cited_numbers: [{ kind: "tracking", value: T }], email_kind: "carrier_update" };

function gmailDoc(from: string, subject: string, bodyHtml: string, extra = "", url = "https://mail.google.com/mail/u/0/#inbox/abc") {
  return new JSDOM(
    `<!doctype html><html lang="en"><div role="main">${extra}<h2 class="hP">${subject}</h2><table><tr><td><h3 class="iw"><span class="gD" email="${from}">Sender</span></h3></td></tr></table><span class="g3" title="23 Nov">x</span><div class="a3s aiL">${bodyHtml}</div></div>`,
    { url },
  ).window.document;
}
function viaExtension(doc: Document, claim: EmailClaim, patch: Partial<ExtractedEmail> = {}) {
  const email = { ...sanitizeEmail(extractOpenGmailThread(doc))!, ...patch };
  const c = reconcileClaim(claim, email.text, email.fromDomain);
  return { email, v: decideVerdict(c, ledger, pack, "on_device", verdictOptionsForEmail(email)) };
}

describe("link, form and image targets are read (H1, A1, A7, audit D)", () => {
  it("audit D: an anchor-only outside host on a ups.com email is Warning", () => {
    const { email, v } = viaExtension(gmailDoc("mcinfo@ups.com", "UPS Update", `Your parcel ${T} arrives tomorrow. <a href="https://ups-redelivery.example/x">Manage delivery</a>`), ups);
    expect(email.linkHosts).toContain("ups-redelivery.example");
    expect(v.outcome).toBe("warning");
  });
  it("Gmail's google.com/url wrapper is unwrapped", () => {
    const href = "https://www.google.com/url?q=https://ups-redelivery.example/x&amp;source=gmail";
    const { email, v } = viaExtension(gmailDoc("mcinfo@ups.com", "UPS Update", `Your parcel ${T} arrives tomorrow. <a href="${href}">Manage</a>`), ups);
    expect(email.linkHosts).toEqual(["ups-redelivery.example"]);
    expect(v.outcome).toBe("warning");
  });
  it("a form action and a javascript: link count as outside targets", () => {
    const form = viaExtension(gmailDoc("mcinfo@ups.com", "UPS", `Parcel ${T}. <form action="https://ups-fee.example/pay"><button>Go</button></form>`), ups);
    expect(form.v.outcome).toBe("warning");
    const js = viaExtension(gmailDoc("mcinfo@ups.com", "UPS", `Parcel ${T}. <a href="javascript:void(0)">Track</a>`), ups);
    expect(js.v.outcome).toBe("warning");
  });
  it("an image from outside the official list caps at Neutral; Gmail's image proxy is unwrapped", () => {
    const src = "https://ci3.googleusercontent.com/meips/abc=s0-d-e1-ft#https://pixel.tracker.example/o.gif";
    const { email, v } = viaExtension(gmailDoc("mcinfo@ups.com", "UPS", `Your parcel ${T} arrives tomorrow.<img src="${src}">`), ups);
    expect(email.imageHosts).toEqual(["pixel.tracker.example"]);
    expect(v.headline).toBe(IMAGE_HOST_HEADLINE);
  });
  it("A1: a marketplace.amazon.com seller message with fee wording and an href-only link is not Safe", () => {
    const doc = gmailDoc("abc123xyz@marketplace.amazon.com", `Order ${AMZ}: action needed`,
      `<p>Your order ${AMZ} is held at our warehouse.</p><p>To keep your order, a small $4.99 fee applies.</p><p><a href="https://amzn-keep-order.example/p">Keep my order</a></p>`);
    expect(viaExtension(doc, store(AMZ)).v.outcome).toBe("warning");
  });
  it("A7: ups.com, 'a $3.10 fee applies' and an href-only link is Warning", () => {
    const doc = gmailDoc("mcinfo@ups.com", "UPS Update", `<p>Your parcel ${T} is ready. A $3.10 fee applies before delivery.</p><a href="https://ups-fee.example">Schedule delivery</a>`);
    expect(viaExtension(doc, ups).v.outcome).toBe("warning");
  });
});

describe("hidden text is skipped and a mismatch is risky (A4, A5, A6)", () => {
  it("A4: a display:none 'do not' before a visible 'pay' is not read, and the mismatch warns", () => {
    const doc = gmailDoc("orders@northwindshop.com", "Order NW-99812", `<p>Your order NW-99812 is on hold. Please <span style="display:none">do not</span> pay the $4.99 now to keep it.</p>`);
    const { email, v } = viaExtension(doc, store("NW-99812", "none", "receipt", "Northwind"));
    expect(email.text).not.toContain("do not");
    expect(email.hiddenText).toBe(true);
    expect(v.outcome).toBe("warning");
  });
  it("A5: 21k characters of hidden padding no longer push the demand out of reach", () => {
    const pad = `<div style="display:none">${"&#8203;x ".repeat(10500)}</div>`;
    const doc = gmailDoc("orders@northwindshop.com", "Order NW-99812 update", `${pad}<p>Your order is on hold. Pay the $4.99 release fee here: https://nw-pay.example/login and sign in.</p>`);
    const { email, v } = viaExtension(doc, store("NW-99812", "none", "receipt", "Northwind"));
    expect(email.text).toContain("Pay the $4.99");
    expect(email.hiddenText).toBe(true);
    expect(v.outcome).toBe("warning");
  });
  it("A6: ups.com with hidden padding before 'pay customs fee' is Warning", () => {
    const pad = `<div style="display:none">${"&#8203;x ".repeat(10500)}</div>`;
    const doc = gmailDoc("mcinfo@ups.com", `UPS Update: ${T}`, `${pad}<p>Pay the customs fee at https://ups-fee.example</p>`);
    expect(viaExtension(doc, ups).v.outcome).toBe("warning");
  });
  it("other hiding styles are caught: font-size 0, opacity 0, visibility hidden, hidden attribute, off-screen", () => {
    for (const style of ["font-size:0", "opacity:0", "visibility:hidden", "position:absolute;left:-9999px", "max-height:0;overflow:hidden"]) {
      const doc = new JSDOM(`<div style="${style}">x</div>`).window.document;
      expect(isHiddenElement(doc.querySelector("div")!)).toBe(true);
    }
    const doc = new JSDOM(`<div hidden>x</div><p>y</p>`).window.document;
    expect(isHiddenElement(doc.querySelector("div")!)).toBe(true);
    expect(isHiddenElement(doc.querySelector("p")!)).toBe(false);
  });
  it("a short hidden preheader before the visible text is not a trick, but since round 5 any hidden text stops Safe", () => {
    const doc = gmailDoc("mcinfo@ups.com", `UPS Update: ${T}`, `<div style="display:none">Your parcel is on its way</div><p>Your parcel ${T} arrives tomorrow. No action is required.</p>`);
    const { email, v } = viaExtension(doc, ups);
    expect(email.hiddenText).toBeUndefined();
    expect(email.hiddenAny).toBe(true);
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe(HIDDEN_ANY_HEADLINE);
  });
  it("a clean ups.com email with nothing hidden stays Safe", () => {
    const doc = gmailDoc("mcinfo@ups.com", `UPS Update: ${T}`, `<p>Your parcel ${T} arrives tomorrow. No action is required.</p>`);
    const { email, v } = viaExtension(doc, ups);
    expect(email.hiddenAny).toBeUndefined();
    expect(v.outcome).toBe("safe");
  });
});

describe("full text is read; a long email is never Safe (F4)", () => {
  it("the panel keeps far more than 20,000 characters, and marks a cut", () => {
    expect(MAX_EMAIL_CHARS).toBeGreaterThanOrEqual(200_000);
    const cut = sanitizeEmail({ text: "x".repeat(MAX_EMAIL_CHARS + 10), fromDomain: "ups.com", subject: "s" })!;
    expect(cut.truncated).toBe(true);
    expect(cut.text.length).toBe(MAX_EMAIL_CHARS);
  });
  it("a long, clean, visible ups.com email is Neutral, too long to check fully", () => {
    const doc = gmailDoc("mcinfo@ups.com", `UPS Update: ${T}`, `<p>Your parcel ${T} arrives tomorrow.</p><p>${"Lorem ipsum dolor. ".repeat(1200)}</p>`);
    expect(viaExtension(doc, ups).v.headline).toBe(TOO_LONG_HEADLINE);
  });
});

describe("Gmail's own flags and the sender element (H2, I1, audit E, audit F)", () => {
  it("audit F: a spam banner caps a matching order at Neutral", () => {
    const banner = `<div class="spam-banner">Why is this message in spam? It is similar to messages that were identified as spam in the past.</div>`;
    const doc = gmailDoc("mcinfo@ups.com", "UPS Update", `Your parcel ${T} arrives tomorrow.`, banner);
    const { email, v } = viaExtension(doc, ups);
    expect(email.gmailFlags).toContain("warning");
    expect(senderCheckForEmail(email)).toBe("flagged");
    expect(v.headline).toBe(FLAGGED_HEADLINE);
  });
  it("the Spam folder in the URL, a Spam label and a 'via' sender each flag the message", () => {
    const spamUrl = gmailDoc("mcinfo@ups.com", "UPS", `Parcel ${T} arrives tomorrow.`, "", "https://mail.google.com/mail/u/0/#spam/abc");
    expect(extractOpenGmailThread(spamUrl)!.gmailFlags).toContain("spam");
    const label = gmailDoc("mcinfo@ups.com", "UPS", `Parcel ${T} arrives tomorrow.`, `<div class="ahR"><span>Spam</span></div>`);
    expect(extractOpenGmailThread(label)!.gmailFlags).toContain("spam");
    const via = new JSDOM(`<div role="main"><h2 class="hP">UPS</h2><table><tr><td><h3 class="iw"><span class="gD" email="mcinfo@ups.com">UPS</span> <span>via sendgrid.net</span></h3></td></tr></table><div class="a3s">Parcel ${T}</div></div>`).window.document;
    expect(extractOpenGmailThread(via)!.gmailFlags).toContain("via");
  });
  it("the words of a banner inside the message body do not flag it (only Gmail's interface counts)", () => {
    const doc = gmailDoc("mcinfo@ups.com", "UPS", `<div>Be careful with this message</div> Parcel ${T}.`);
    expect(extractOpenGmailThread(doc)!.gmailFlags).toBeUndefined();
  });
  it("audit E: with no span.gD, a recipient span[email] is not taken as the sender", () => {
    const doc = new JSDOM(`<div role="main"><h2 class="hP">x</h2><span class="g2" email="me@ups.com">me</span><div class="a3s">Parcel ${T}</div></div>`).window.document;
    expect(extractOpenGmailThread(doc)!.fromDomain).toBe("");
  });
});

describe("the extension test page is a fixture, never Safe (I2)", () => {
  it("a fixture email caps at Neutral", () => {
    const doc = gmailDoc("mcinfo@ups.com", "UPS", `Your parcel ${T} arrives tomorrow. No action is required.`);
    const { v } = viaExtension(doc, ups, { fixture: true });
    expect(v.headline).toBe(FIXTURE_HEADLINE);
  });
  it("sanitizeEmail keeps a fixture mark (a downgrade) and the new fields, and drops junk", () => {
    const e = sanitizeEmail({ text: "t", fromDomain: "UPS.COM", subject: "s", fixture: true, linkHosts: ["A.example", 5, ""], gmailFlags: ["spam", "bogus"], hiddenText: "yes" })!;
    expect(e.fixture).toBe(true);
    expect(e.linkHosts).toEqual(["a.example"]);
    expect(e.gmailFlags).toEqual(["spam"]);
    expect(e.hiddenText).toBeUndefined();
  });
});

describe("decision 8 through the extension: B1 and C1", () => {
  it("B1: a lookalike sender citing a real FedEx number as an order is a leaked-number Warning", () => {
    const doc = gmailDoc("track@parcel-status.example", `Delivery ${FDX}`, `<p>Delivery ${FDX} is on hold. Pay $2.99 today to keep it: https://parcel-status.example/pay</p>`);
    const { v } = viaExtension(doc, store(FDX, "pay", "receipt", "Delivery Desk"));
    expect(v.outcome).toBe("warning");
    expect(v.reasons.join(" ")).not.toMatch(/not an alarm/);
  });
  it("C1: a paypal.com invoice with a callback number has no reassuring lines", () => {
    const doc = gmailDoc("service@paypal.com", "You've got an invoice", `<p>Norton LifeLock renewal $499.99. If you did not authorise this, call +1 888 555 0100.</p>`);
    const claim: EmailClaim = { claimed_party: { name: "PayPal", role: "bank" }, asked_action: "none", cited_numbers: [{ kind: "invoice", value: "INV-7781" }], email_kind: "invoice" };
    const { v } = viaExtension(doc, claim);
    expect(v.outcome).not.toBe("safe");
    expect(v.reasons.join(" ")).not.toMatch(/listed as official|not an alarm/);
  });
});
