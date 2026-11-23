/**
 * Cold judge round 3 F10 / audit L3: an expanded Gmail thread can hold
 * messages from more than one sender. The first sender must not vouch for a
 * later sender's text, so such a thread never gets Safe.
 */
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { decideVerdict, reconcileClaim, type LedgerSnapshot, type OfficialPack } from "@did-i-order-this/core";
import pack0 from "../../web/src/packs/official.json" with { type: "json" };
import { extractOpenGmailThread } from "./extract.ts";
import { sanitizeEmail } from "./messages.ts";
import { senderCheckForEmail } from "./senderCheck.ts";

const T = "1Z999AA10123456784";
const thread = new JSDOM(`<!doctype html><div role="main">
  <h2 class="hP">UPS delivery update</h2>
  <span class="gD" email="mcinfo@ups.com">UPS</span>
  <div class="a3s aiL">Your UPS parcel ${T} arrives tomorrow.</div>
  <span class="gD" email="billing@ups-release.example">UPS</span>
  <div class="a3s aiL">Re: ${T} has a hold. Reply with your card.</div>
</div>`);

describe("mixed-sender Gmail threads", () => {
  it("are marked as mixed, and the mark survives the message sanitiser", () => {
    const email = sanitizeEmail(extractOpenGmailThread(thread.window.document));
    expect(email?.mixedSenders).toBe(true);
    expect(senderCheckForEmail(email!)).toBe("mixed_thread");
  });
  it("never give Safe, and say why", () => {
    const email = sanitizeEmail(extractOpenGmailThread(thread.window.document))!;
    const ledger: LedgerSnapshot = {
      orders: [],
      senders: [],
      shipments: [{ id: "s", trackingNumber: T, carrier: "UPS", expected: true, source: "import", confirmedAt: "x" }],
    };
    const claim = reconcileClaim(
      { claimed_party: { name: "UPS", role: "carrier" }, asked_action: "none", cited_numbers: [{ kind: "tracking", value: T }], email_kind: "carrier_update" },
      email.text,
      email.fromDomain,
    );
    const v = decideVerdict(claim, ledger, pack0 as OfficialPack, "on_device", { emailText: email.text, senderCheck: senderCheckForEmail(email) });
    expect(v.outcome).not.toBe("safe");
    expect(v.headline).toMatch(/more than one sender/);
  });
  it("a one-sender thread is verified", () => {
    const one = new JSDOM(`<!doctype html><div role="main"><h2 class="hP">UPS</h2>
      <span class="gD" email="mcinfo@ups.com">UPS</span><div class="a3s aiL">Parcel ${T}.</div>
      <span class="gD" email="alerts@ups.com">UPS</span><div class="a3s aiL">Delivered.</div></div>`);
    const email = sanitizeEmail(extractOpenGmailThread(one.window.document))!;
    expect(email.mixedSenders).toBeFalsy();
    expect(senderCheckForEmail(email)).toBe("verified");
  });
});
