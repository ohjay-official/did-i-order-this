/**
 * Round 6 regressions through the real Gmail extraction chain, from the strict
 * security audit of 23 Nov 2026 (docs/reviews/judges/2026-11-23-r6-2-security.md).
 */
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { decideVerdict, reconcileClaim, type EmailClaim, type LedgerSnapshot, type OfficialPack } from "@did-i-order-this/core";
import pack0 from "../../web/src/packs/official.json" with { type: "json" };
import { extractOpenGmailThread } from "./extract.ts";
import { sanitizeEmail } from "./messages.ts";
import { verdictOptionsForEmail } from "./senderCheck.ts";

const pack = pack0 as OfficialPack;
const T = "1Z999AA10123456784";
const ledger: LedgerSnapshot = {
  orders: [],
  shipments: [{ id: "s1", trackingNumber: T, carrier: "UPS", expected: true, source: "manual", confirmedAt: new Date().toISOString() }],
  senders: [],
};
const claim: EmailClaim = {
  claimed_party: { name: "UPS", role: "carrier" },
  asked_action: "none",
  cited_numbers: [{ kind: "tracking", value: T }],
  email_kind: "carrier_update",
};

function page(body: string, afterBody = ""): Document {
  const html = `<div role="main"><h2 class="hP">UPS Update: ${T}</h2>
    <table><tr><td><h3><span class="gD" email="pkginfo@ups.com">UPS</span></h3></td></tr></table>
    <span class="g3" title="Mon, Nov 23, 2026">Nov 23</span>
    <div class="a3s aiL">${body}</div>${afterBody}</div>`;
  return new JSDOM(`<!doctype html><html lang="en"><body>${html}</body></html>`, { url: "https://mail.google.com/mail/u/0/#inbox/abc" }).window.document;
}

function run(d: Document) {
  const email = sanitizeEmail(extractOpenGmailThread(d))!;
  const c = reconcileClaim(claim, email.text, email.fromDomain);
  return { email, verdict: decideVerdict(c, ledger, pack, "on_device", verdictOptionsForEmail(email)) };
}

describe("round 6 through the Gmail extractor", () => {
  it("control: the clean notice is Safe", () => {
    expect(run(page(`<p>Your parcel ${T} is on its way.</p>`)).verdict.outcome).toBe("safe");
  });
  it("F1: a plain-text site with an unlisted TLD is not Safe", () => {
    expect(run(page(`<p>Your parcel ${T} is on its way.</p><p>A customs hold applies, see ups-customs.pw before Friday.</p>`)).verdict.outcome).not.toBe("safe");
  });
  it("F4: image alt text is read, so a fee in it is not Safe", () => {
    const { email, verdict } = run(page(`<p>Your parcel ${T} is on its way.</p><img src="https://www.ups.com/missing.png" alt="Customs fee due: pay $2.99 at ups-fee.example">`));
    expect(email.text).toContain("Customs fee due");
    expect(verdict.outcome).not.toBe("safe");
  });
  it("F4: an attachment chip caps Safe at Neutral", () => {
    const { email, verdict } = run(page(`<p>Your parcel ${T} is on its way.</p>`, `<div class="aQH"><span class="aV3">UPS_Customs_Invoice.pdf</span></div>`));
    expect(email.unreadContent).toBe(true);
    expect(verdict.outcome).toBe("neutral");
  });
  it("F4: an iframe in the body caps Safe at Neutral", () => {
    expect(run(page(`<p>Your parcel ${T} is on its way.</p><iframe src="https://www.ups.com/x"></iframe>`)).verdict.outcome).toBe("neutral");
  });
});
