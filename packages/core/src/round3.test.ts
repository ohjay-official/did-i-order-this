/**
 * Regression tests for the cold judge round 3 (F1 to F11) and the security
 * audit round 2 (H1, L1 to L4, I2), 23 Nov 2026. Each case below reproduced
 * Safe (or a wrong import) on main 4947e1e.
 */
import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import pack0 from "../../../web/src/packs/official.json" with { type: "json" };
import {
  decideVerdict,
  findOfficialDomain,
  normalizeDomain,
  parseOrderHistoryFile,
  reconcileClaim,
  runLimitedCheck,
  senderDomainFromHeader,
  type EmailClaim,
  type LedgerSnapshot,
  type OfficialPack,
} from "./index.ts";

const pack = pack0 as OfficialPack;
const now = "2026-11-20T00:00:00Z";
const T = "1Z999AA10123456784";
const D = "JD014600006281234567";
const ledger: LedgerSnapshot = {
  orders: [
    { id: "o1", merchant: "Northwind", senderDomain: "shop.northwind-outfitters.example", orderId: "NW-10001", source: "import", confirmedAt: now },
    { id: "o2", merchant: "Etsy seller", senderDomain: "gmail.com", orderId: "INV-7781", source: "import", confirmedAt: now },
  ],
  shipments: [
    { id: "s1", trackingNumber: T, carrier: "UPS", expected: true, source: "import", confirmedAt: now },
    { id: "s2", trackingNumber: D, carrier: "DPD", expected: true, source: "import", confirmedAt: now },
  ],
  senders: [],
};

function claim(p: Partial<EmailClaim> & { num?: string; kindNum?: EmailClaim["cited_numbers"][number]["kind"] } = {}): EmailClaim {
  return {
    claimed_party: p.claimed_party ?? { name: "UPS", role: "carrier" },
    asked_action: p.asked_action ?? "none",
    cited_numbers: p.cited_numbers ?? [{ kind: p.kindNum ?? "tracking", value: p.num ?? T }],
    email_kind: p.email_kind ?? "carrier_update",
  };
}
const store = (num = "NW-10001", kind: EmailClaim["email_kind"] = "receipt") =>
  claim({ claimed_party: { name: "Northwind", role: "merchant" }, email_kind: kind, kindNum: "order", num });

/** A pasted email: the sender comes from the pasted From line and is not verified. */
function pasted(text: string, c: EmailClaim = claim()) {
  return decideVerdict(reconcileClaim(c, text, senderDomainFromHeader(text)), ledger, pack, "on_device", { emailText: text });
}
/** The sender the app itself knows (Gmail's sender in the extension, or a built-in sample). */
function verified(text: string, c: EmailClaim, domain = senderDomainFromHeader(text)) {
  return decideVerdict(reconcileClaim(c, text, domain), ledger, pack, "on_device", { emailText: text, senderCheck: "verified" });
}

describe("F2 / H1: pasted text never gets Safe", () => {
  it("P1: a forged From line at the top of pasted text with a lure link is not Safe", () => {
    const v = pasted(`From: UPS <mcinfo@ups.com>\nSubject: UPS Update\n\nYour UPS package ${T} has a delivery exception. Review delivery options: http://ups-delivery-options.example/r`);
    expect(v.outcome).not.toBe("safe");
  });
  it("H1 audit: forged From plus a redelivery fee link is Warning", () => {
    const text = `From: UPS <alerts@ups.com>\nSubject: Delivery attempt\n\nWe tried to deliver ${T}. A redelivery fee of 1.99 is due. Pay at https://ups-redelivery.example/pay`;
    const v = pasted(text, claim({ asked_action: "pay", email_kind: "delivery_problem" }));
    expect(v.outcome).toBe("warning");
  });
  it("a clean pasted UPS email with a matching number caps at Neutral with the paste headline", () => {
    const v = pasted(`From: UPS <mcinfo@ups.com>\nSubject: UPS delivery update\n\nYour UPS parcel ${T} arrives tomorrow. No action is required.`);
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe("This number matches your parcel, but a pasted email can't prove who sent it. Open your parcel in the carrier's app.");
  });
  it("a clean pasted store email with a matching order caps at Neutral with the store headline", () => {
    const v = pasted(`From: Northwind <o@shop.northwind-outfitters.example>\n\nThanks for your order NW-10001. It ships soon.`, store());
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe("This number matches your order, but a pasted email can't prove who sent it. Open your order on the store's own site.");
  });
  it("the limited check does not vouch for a pasted From line", () => {
    const text = `From: UPS <alerts@ups.com>\n\nWe tried to deliver ${T}. A redelivery fee of 1.99 is due.`;
    const lim = runLimitedCheck(text, { fromDomain: senderDomainFromHeader(text) }, ledger, pack);
    expect(lim.findings.join(" ")).not.toContain("is listed as official for UPS");
  });
});

describe("F2: header shapes that give no domain", () => {
  it.each([
    ["H8 two From lines", `From: UPS <alerts@ups.com>\nFrom: x@evil.example\n\nParcel ${T}`],
    ["H10 BOM and CRLF", `\uFEFFFrom: UPS <a@ups.com>\r\n\r\nParcel ${T}`],
    ["H11 lower-case from with a tab", `from:\tUPS <a@ups.com>\n\nParcel ${T}`],
    ["H12 group syntax", `From: UPS: <a@ups.com>;\n\nParcel ${T}`],
  ])("%s", (_name, text) => {
    expect(senderDomainFromHeader(text)).toBe("");
  });
});

describe("F3: lookalike characters never count as official", () => {
  it.each([
    ["full-width", "\uff55\uff50\uff53.\uff43\uff4f\uff4d"],
    ["soft hyphen", "ups\u00ad.com"],
    ["ideographic full stop", "ups\u3002com"],
    ["zero-width joiner", "up\u200ds.com"],
    ["Cyrillic u", "\u0443ps.com"],
    ["non-breaking space", "ups.com\u00a0"],
  ])("%s", (_name, domain) => {
    expect(findOfficialDomain(pack, domain)).toBeUndefined();
    expect(normalizeDomain(domain)).not.toBe("ups.com");
    const text = `From: UPS <alerts@${domain}>\n\nParcel ${T} arrives tomorrow.`;
    // H6: the extension passes Gmail's address; a full-width one must not become ups.com.
    expect(verified(text, claim(), domain).outcome).not.toBe("safe");
  });
});

describe("F1 / F8: carrier Safe needs the same carrier's official domain", () => {
  const body = (dom: string) => `From: Carrier <x@${dom}>\n\nYour UPS parcel ${T} is on its way.`;
  it.each(["dpd.com", "evri.com", "royalmail.com", "dhl.com", "paypal.com"])("an expected UPS number from %s is not Safe", (dom) => {
    const v = verified(body(dom), claim(), dom);
    expect(v.outcome).toBe("warning");
  });
  it("the same number from ups.com (and a subdomain) is still Safe when nothing risky is asked", () => {
    expect(verified(body("ups.com"), claim(), "ups.com").outcome).toBe("safe");
    expect(verified(body("notify.ups.com"), claim(), "notify.ups.com").outcome).toBe("safe");
  });
  it("D1: a spoofed dpd.com email with a leaked DPD number is not Safe (dpd.com has no DMARC)", () => {
    const text = `From: DPD <noreply@dpd.com>\n\nYour DPD parcel ${D} could not be delivered. Choose a new slot: http://dpd-slot.example`;
    expect(verified(text, claim({ claimed_party: { name: "DPD", role: "carrier" }, num: D }), "dpd.com").outcome).not.toBe("safe");
  });
  it("dpd.com is no longer in the official pack; dpd.co.uk is", () => {
    expect(findOfficialDomain(pack, "dpd.com")).toBeUndefined();
    expect(findOfficialDomain(pack, "dpd.co.uk")?.name).toBe("DPD");
  });
});

describe("F4: the carrier path does not give Safe to a risky ask or an outside link", () => {
  it("W1: official ups.com asking for a $2.99 release fee at another host is Warning", () => {
    const text = `From: UPS <a@ups.com>\n\nPay the release fee of $2.99 for ${T} at http://ups-fee.example`;
    expect(verified(text, claim({ asked_action: "pay" }), "ups.com").outcome).toBe("warning");
  });
  it("official ups.com asking to pay, even with the model label none, is Warning", () => {
    const text = `From: UPS <a@ups.com>\n\nYour parcel ${T} is held. A customs fee of 2.99 is due.`;
    expect(verified(text, claim({ asked_action: "none" }), "ups.com").outcome).toBe("warning");
  });
  it("official ups.com linking to a non-official host is Warning", () => {
    const text = `From: UPS <a@ups.com>\n\nTrack ${T} here: https://ups-tracking-help.example/t`;
    expect(verified(text, claim(), "ups.com").outcome).toBe("warning");
  });
  it("H9: a Reply-To on another domain is not Safe", () => {
    const text = `From: UPS <alerts@ups.com>\nReply-To: pay@evil.example\n\nParcel ${T} arrives tomorrow.`;
    expect(verified(text, claim(), "ups.com").outcome).not.toBe("safe");
  });
  it("a link to the carrier's own site keeps Safe", () => {
    const text = `From: UPS <a@ups.com>\n\nParcel ${T} arrives tomorrow. Track it at https://www.ups.com/track`;
    expect(verified(text, claim(), "ups.com").outcome).toBe("safe");
  });
});

describe("F5: free-mail and self domains are not store domains", () => {
  it("F1 judge: a stored order with a gmail.com domain never gives Safe to a gmail.com sender", () => {
    const text = `From: Seller <scammer123@gmail.com>\n\nAbout your order INV-7781, thanks.`;
    const c = claim({ claimed_party: { name: "Seller", role: "merchant" }, email_kind: "receipt", kindNum: "order", num: "INV-7781" });
    expect(verified(text, c, "gmail.com").outcome).not.toBe("safe");
  });
  it("PayPal import keeps no free-mail store domain and skips Payment Received rows", () => {
    const csv =
      "Date,Time,TimeZone,Name,Type,Status,Currency,Gross,Fee,Net,From Email Address,To Email Address,Transaction ID,Item Title,Invoice Number\n" +
      "09/20/2026,12:00:00,PST,Jane Small Shop,Express Checkout Payment,Completed,USD,-42.00,0,-42.00,me@gmail.com,janesmallshop@gmail.com,9AB12345678901234,Socks,\n" +
      "09/21/2026,12:00:00,PST,Big Store,Express Checkout Payment,Completed,USD,-10.00,0,-10.00,me@gmail.com,payments@bigstore.example,5CD12345678901234,Hat,\n" +
      "09/22/2026,12:00:00,PST,Bob,Payment Received,Completed,USD,10.00,0,10.00,bob@outlook.com,me@gmail.com,7XY12345678901234,,\n";
    const parsed = parseOrderHistoryFile({ name: "Download.CSV", bytes: new TextEncoder().encode(csv) });
    expect(parsed.orders.map((o) => o.orderId)).toEqual(["9AB12345678901234", "5CD12345678901234"]);
    expect(parsed.orders.map((o) => o.senderDomain)).not.toContain("gmail.com");
    expect(parsed.orders.find((o) => o.orderId === "5CD12345678901234")?.senderDomain).toBe("bigstore.example");
  });
  it("PayPal import does not use the user's own address domain as a store domain", () => {
    const csv =
      "Date,Name,Type,Status,Currency,Gross,From Email Address,To Email Address,Transaction ID\n" +
      "09/20/2026,Corner Shop,Express Checkout Payment,Completed,USD,-5.00,me@mycompany.example,shop@mycompany.example,1AA12345678901234\n";
    const parsed = parseOrderHistoryFile({ name: "Download.CSV", bytes: new TextEncoder().encode(csv) });
    expect(parsed.orders[0]?.senderDomain).not.toBe("mycompany.example");
  });
  it("generic import keeps no free-mail store domain, even written as an address", () => {
    const csv = "order_id,merchant,domain\nG-1,Jane Small Shop,janesmallshop@gmail.com\nG-2,Harbor,outlook.com\nG-3,Harbor Goods,harbor-goods.example\n";
    const parsed = parseOrderHistoryFile({ name: "orders.csv", bytes: new TextEncoder().encode(csv) });
    const domains = parsed.orders.map((o) => o.senderDomain);
    expect(domains).not.toContain("gmail.com");
    expect(domains).not.toContain("outlook.com");
    expect(domains.some((d) => d.includes("@"))).toBe(false);
    expect(domains).toContain("harbor-goods.example");
  });
});

describe("F9: store wording floors", () => {
  const from = "From: Northwind <o@shop.northwind-outfitters.example>\n\n";
  it.each([
    ["S1 a small $1.99 adjustment is needed", `${from}Order NW-10001: a small $1.99 adjustment is needed to dispatch. Tap here.`, store()],
    ["S2 cover the remaining shipping cost", `${from}Order NW-10001 is waiting. Cover the remaining shipping cost of 1.99 USD here.`, store("NW-10001", "shipment_notice")],
    ["S3 letter-spaced p a y", `${from}Order NW-10001: p a y the 1.99 fee now.`, store()],
    ["S4 dot-spaced p\u00b7ay", `${from}Order NW-10001: p\u00b7ay the fee n\u00b7ow.`, store()],
    ["a balance of \u00a312.40 remaining", `${from}Order NW-10001 has a balance of \u00a312.40 remaining before dispatch.`, store()],
    ["a link to another host", `${from}Order NW-10001 has shipped. Details: https://northwind-orders.example/o/1`, store()],
  ])("%s is not Safe from the store's own domain", (_name, text, c) => {
    expect(verified(text, c, "shop.northwind-outfitters.example").outcome).toBe("warning");
  });
  it("a plain receipt from the store's own domain, linking only to the store, is Safe only for a vetted store", () => {
    const text = `${from}Thanks for your order NW-10001. Total $42.00. View it at https://shop.northwind-outfitters.example/orders`;
    expect(verified(text, store(), "shop.northwind-outfitters.example").outcome).toBe("neutral");
    const vetted: OfficialPack = { ...pack, storeDomains: [{ domain: "shop.northwind-outfitters.example", name: "Northwind", dmarc: "reject", checked: "test" }] };
    const c = reconcileClaim(store(), text, "shop.northwind-outfitters.example");
    expect(decideVerdict(c, ledger, vetted, "on_device", { emailText: text, senderCheck: "verified" }).outcome).toBe("safe");
  });
});

describe("I2: the ZIP import checks the real inflated size", () => {
  it("rejects an entry whose declared size understates what it inflates to", () => {
    const big = "order_id,merchant\n" + "X-1,Shop\n".repeat(6_000_000); // about 54 MB
    const zip = zipSync({ "orders.csv": strToU8(big) }, { level: 1 });
    // Understate the uncompressed size in the local header and the central directory.
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    view.setUint32(22, 1000, true);
    const central = zip.findIndex((_b, i) => view.getUint32(i, true) === 0x02014b50);
    view.setUint32(central + 24, 1000, true);
    expect(() => parseOrderHistoryFile({ name: "orders.zip", bytes: zip })).toThrow(/too big|larger|could not be read/i);
    // It builds and inflates about 54 MB, which can pass 5 seconds on a CI runner under coverage.
  }, 60_000);
});
