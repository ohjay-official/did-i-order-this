/**
 * Round 5 regressions: every lure from the round 5 cold judge (H2, attack.ts)
 * and the round 4 security audit (J2-1, J2-5), run as a verified Gmail sender
 * from a vetted store (ikea.com) and from ups.com with the model labelling
 * the request "none". Each gave Safe on main eedce9a. Controls stay Safe.
 */
import { describe, expect, it } from "vitest";
import pack0 from "../../../web/src/packs/official.json" with { type: "json" };
import {
  HIDDEN_ANY_HEADLINE,
  NON_ENGLISH_HEADLINE,
  OFF_PLATFORM_HEADLINE,
  OTHER_SITE_HEADLINE,
  STORE_UNVERIFIED_HEADLINE,
  canSaveShipmentFromClaim,
  decideVerdict,
  hostOfTarget,
  isMostlyNonEnglish,
  isVettedStore,
  readTextSignals,
  reconcileClaim,
  textAsksRisky,
  type EmailClaim,
  type LedgerSnapshot,
  type OfficialPack,
  type VerdictOptions,
} from "./index.ts";

const pack = pack0 as OfficialPack;
const now = "2026-11-23T00:00:00Z";
const T = "1Z999AA10123456784";
const TGT = "TGT40021187";
const EBAY = "12-34567-89012";
const ledger: LedgerSnapshot = {
  orders: [
    { id: "o1", merchant: "IKEA", senderDomain: "ikea.com", orderId: TGT, source: "import", confirmedAt: now },
    { id: "o2", merchant: "eBay", senderDomain: "ebay.com", orderId: EBAY, source: "import", confirmedAt: now },
    { id: "o3", merchant: "Etsy", senderDomain: "etsy.com", orderId: "3141592653", source: "import", confirmedAt: now },
  ],
  shipments: [{ id: "s1", trackingNumber: T, carrier: "UPS", expected: true, source: "import", confirmedAt: now }],
  senders: [],
};
const storeClaim = (num = TGT, name = "IKEA"): EmailClaim => ({
  claimed_party: { name, role: "merchant" },
  asked_action: "none",
  cited_numbers: [{ kind: "order", value: num }],
  email_kind: "receipt",
});
const upsClaim: EmailClaim = {
  claimed_party: { name: "UPS", role: "carrier" },
  asked_action: "none",
  cited_numbers: [{ kind: "tracking", value: T }],
  email_kind: "carrier_update",
};
function verified(fromDomain: string, body: string, claim: EmailClaim, options: VerdictOptions = {}) {
  const text = `From: ${claim.claimed_party.name} <mail@${fromDomain}>\nSubject: Update\n\n${body}`;
  const c = reconcileClaim(claim, text, fromDomain);
  return decideVerdict(c, ledger, pack, "on_device", { emailText: text, senderCheck: "verified", ...options });
}
const asStore = (body: string, options?: VerdictOptions) => verified("ikea.com", `About order ${TGT}: ${body}`, storeClaim(), options);
const asUps = (body: string, options?: VerdictOptions) => verified("ups.com", `Your UPS package ${T} is on its way. ${body}`, upsClaim, options);

/** Cold judge round 5, H2 (attack.ts): 16 of 17 were Safe with a "none" label. */
const JUDGE_LURES: [string, string][] = [
  ["whatsapp no digits", "Hi, the item was damaged by the courier. Message me on WhatsApp so I can send your refund, my name there is Fast Refunds."],
  ["telegram handle", "please contact me on Telegram @refunddesk_official for your compensation."],
  ["spelled phone", "please ring me on four four seven seven zero zero nine zero zero one two three to sort your refund."],
  ["phone split", "my mobile is 07700 900 123, give me a buzz about the refund."],
  ["obfuscated url", "refund form at ebay-refunds dot net slash claim. Fill it in today."],
  ["bracket url", "claim your refund at refund-desk[.]com/claim"],
  ["zelle", "I can refund you faster if you Zelle me the 1 dollar verification first."],
  ["remit cash app cashtag", "kindly remit the shipping difference of 5 dollars via Cash App to $fastrefund."],
  ["qr scan", "scan the QR code in the photo I sent to get your refund instantly."],
  ["card digits soft", "To process your refund I just need the long number on the front of your card and the 3 numbers on the back."],
  ["banking info reply", "Please confirm your shipping address and banking info by replying here so I can refund you."],
  ["cash app venmo username", "Send the reshipping cost via Cash App or Venmo to my username refundguy."],
  ["shipper note telegram", "Message from shipper: there is an issue with customs, contact our agent on Telegram @ups_customs_desk."],
  ["apple gift card", "before delivery you will need to clear a small duty amount, our courier will collect five dollars in Apple gift card form."],
];
/** Security audit round 4, J2-1: six lures with no code signal. */
const AUDIT_LURES: [string, string][] = [
  ["zelle to number", "Please send $49.99 by Zelle to 555 201 3344 so the courier can hand it over today."],
  ["cash app cashtag", "Send 49.99 USD through Cash App to $parceldesk before 6pm."],
  ["venmo handle", "Venmo @parcel-desk the $3 courier tip and we will deliver tomorrow."],
  ["telegram agent", "Message our agent on Telegram @ebay_refund_desk to arrange your refund."],
  ["voucher numbers", "Buy a $100 Apple voucher and send us the numbers on the back."],
  ["remit charge", "Remit the 2.99 GBP charge to complete delivery."],
];
/** More variants from the decision list: other messaging apps and rails, spaced numbers, wording without a verb. */
const MORE_LURES: [string, string][] = [
  ["signal app", "Our claims team is on the Signal app, search for Parcel Help."],
  ["wechat", "Add our courier on WeChat to rebook."],
  ["viber", "The driver is reachable on Viber."],
  ["line id", "Our Line ID is parcelhelp."],
  ["bizum english", "Pay the difference by Bizum to finish."],
  ["revolut", "Use Revolut to send the delivery top up."],
  ["wise", "Send it via Wise to our agent."],
  ["western union", "The customs office takes Western Union only."],
  ["moneygram", "Collect your refund with MoneyGram."],
  ["paypal.me text", "Settle up at paypal.me/parceldesk please."],
  ["paypal.com/paypalme text", "Details: https://www.paypal.com/paypalme/parceldesk"],
  ["wire word", "We accept a wire for the duty."],
  ["voucher only", "A Steam voucher covers it."],
  ["gift card only", "We take gift cards at the depot."],
  ["intl phone no verb", "Hotline +44 20 7946 0958."],
  ["us phone parens", "Support: (555) 201-3344."],
  ["spaced digits", "Number: 0 7 7 0 0 9 0 0 1 2 3."],
  ["iban", "Our IBAN is GB29 NWBK 6016 1331 9268 19."],
  ["expiry date", "We need the expiry date to refund you."],
  ["reply with name", "Reply to this email with your full name and address."],
  ["hxxp", "Go to hxxps://ups-help.example/claim"],
  ["dot com spoken", "visit parcel-help dot com today"],
  ["amount send verb", "Send 20 euros to release it."],
  ["qr only", "Delivery QR attached."],
];
const NON_ENGLISH: [string, string][] = [
  ["french pay", "Message du vendeur : veuillez régler 4,99 EUR par virement pour débloquer votre colis."],
  ["spanish bizum", "Mensaje del vendedor: debe abonar 4,99 EUR mediante Bizum para liberar su paquete."],
  ["french customs", "Votre colis est retenu. Veuillez régler les frais de douane de 2,99 EUR."],
  ["german", "Ihr Paket ist im Zollamt. Bitte zahlen Sie die Gebühr mit Ihrer Karte, sonst wird die Sendung nicht zugestellt."],
  ["russian", "Ваша посылка задержана на таможне. Оплатите сбор, чтобы получить посылку сегодня."],
  ["chinese", "您的包裹在海关被扣留，请支付关税以便今天送达。请立即处理。"],
];

describe("H2 and J2-1: every lure stops Safe on the vetted store and the carrier paths", () => {
  for (const [name, body] of [...JUDGE_LURES, ...AUDIT_LURES, ...MORE_LURES, ...NON_ENGLISH]) {
    it(`store: ${name}`, () => {
      const v = asStore(body);
      expect(v.outcome).not.toBe("safe");
    });
    it(`ups.com: ${name}`, () => {
      const v = asUps(body);
      expect(v.outcome).not.toBe("safe");
    });
  }
});

describe("controls stay Safe", () => {
  const clean = [
    "Your order has shipped and arrives on Nov 26, 2026. Order total $24.00. Thanks for shopping with us.",
    "We packed your items. Track them on ikea.com. Order date 2026-11-20.",
  ];
  for (const body of clean) {
    it(`store: ${body.slice(0, 40)}`, () => expect(asStore(body).outcome).toBe("safe"));
  }
  it("ups.com: out for delivery", () => expect(asUps("It is out for delivery today and should arrive by 8pm.").outcome).toBe("safe"));
  it("ups.com: a spaced tracking number is not a phone number", () => {
    expect(asUps("Tracking 1Z 999 AA1 012 3456 784. Delivery by end of day.").outcome).toBe("safe");
  });
  it("store: a USPS number in groups of four is not a phone number", () => {
    expect(readTextSignals("Tracking 9400 1000 0000 0000 0000 00 via USPS.", pack).offPlatform).not.toContain("a phone number");
  });
  it("an eBay-style order number and a date are not phone numbers", () => {
    expect(readTextSignals(`Order ${EBAY} placed 2026-11-20 at 10:45.`, pack).offPlatform).toEqual([]);
  });
});

describe("strong asks become Warning on the carrier path, not only Neutral", () => {
  for (const [name, body] of [...AUDIT_LURES.slice(0, 3), ["remit", "Remit the 2.99 GBP charge to complete delivery."]] as [string, string][]) {
    it(`ups.com: ${name} is a pay ask`, () => {
      expect(textAsksRisky(readTextSignals(body, pack))).toBe(true);
      expect(asUps(body).outcome).toBe("warning");
    });
  }
  it("a contact ask on a messaging app is a call ask", () => {
    expect(readTextSignals("Message our agent on Telegram @desk now.", pack).asksToCall).toBe(true);
    expect(readTextSignals("ring me on four four seven seven zero zero nine zero zero one two", pack).asksToCall).toBe(true);
  });
  it("card details asked the long way round are a login ask", () => {
    expect(readTextSignals("I need the long number on the front of your card.", pack).asksToLogIn).toBe(true);
  });
  it("scanning a QR code is a download ask", () => {
    expect(readTextSignals("Scan the QR code to pay.", pack).asksToDownload).toBe(true);
  });
});

describe("the neutral reasons say why", () => {
  it("names what was found", () => {
    // A contact verb makes it a call ask (Warning); a bare mention caps at Neutral and says what it found.
    expect(asStore("contact me on Telegram @refunddesk_official.").outcome).toBe("warning");
    const v = asStore("Our desk is @refunddesk_official on Telegram.");
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe(OFF_PLATFORM_HEADLINE);
    expect(v.reasons[0]).toMatch(/an @handle, a messaging app/);
  });
  it("non-English text gets its own headline", () => {
    const v = asStore("Votre commande est prête. Merci pour votre achat, vous pouvez la suivre sur le site.");
    expect(v.headline).toBe(NON_ENGLISH_HEADLINE);
    expect(isMostlyNonEnglish("Your order is ready. Thanks for shopping with us.")).toBe(false);
    expect(isMostlyNonEnglish("Your order is ready. Merci et à bientôt.")).toBe(false);
  });
  it("hidden text anywhere stops Safe", () => {
    const v = asUps("Arrives tomorrow.", { hiddenAny: true });
    expect(v.headline).toBe(HIDDEN_ANY_HEADLINE);
  });
});

describe("J2-5: only the sender's own site may be linked from a Safe", () => {
  it("ups.com linking to paypal.com is not Safe", () => {
    const v = asUps("Arrives tomorrow.", { linkHosts: ["paypal.com"] });
    expect(v.outcome).not.toBe("safe");
  });
  it("ups.com linking to dhl.com is not Safe", () => {
    const v = asUps("Arrives tomorrow.", { linkHosts: ["dhl.com"] });
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe(OTHER_SITE_HEADLINE);
  });
  it("ups.com linking to its own subdomain stays Safe", () => {
    expect(asUps("Arrives tomorrow.", { linkHosts: ["wwwapps.ups.com", "ups.com"] }).outcome).toBe("safe");
  });
  it("ikea.com linking to ups.com tracking is not Safe (only the store's own site)", () => {
    const v = asStore("Your order has shipped.", { linkHosts: ["ups.com"] });
    expect(v.outcome).toBe("neutral");
    expect(v.headline).toBe(OTHER_SITE_HEADLINE);
  });
  it("a paypal.com/paypalme target reads as paypal.me, a payment page on no list", () => {
    expect(hostOfTarget("https://www.paypal.com/paypalme/parceldesk")).toBe("paypal.me");
    expect(hostOfTarget("https://www.paypal.com/signin")).toBe("paypal.com");
    expect(asStore("Your order has shipped.", { linkHosts: [hostOfTarget("https://paypal.com/paypalme/x")] }).outcome).toBe("warning");
  });
});

describe("decision 3: marketplaces that relay member text are off the vetted list", () => {
  for (const domain of ["ebay.com", "ebay.co.uk", "etsy.com", "aliexpress.com", "temu.com", "jumia.com.ng", "walmart.com", "newegg.com"]) {
    it(`${domain} is not vetted`, () => expect(isVettedStore(pack, domain)).toBe(false));
  }
  it("an exact ebay.com order match is Neutral, store can't be authenticated", () => {
    const v = verified("ebay.com", `Your order ${EBAY} has shipped.`, storeClaim(EBAY, "eBay"));
    expect(v.headline).toBe(STORE_UNVERIFIED_HEADLINE);
  });
  it("14 stores remain (round 6 removed target.com and bestbuy.com), all p=reject", () => {
    expect(pack.storeDomains).toHaveLength(14);
    for (const entry of pack.storeDomains ?? []) expect(entry.dmarc).toBe("reject");
  });
});

describe("saving a shipment from a store email needs the same clean text", () => {
  const notice = (body: string): [EmailClaim, VerdictOptions] => [
    { claimed_party: { name: "IKEA", role: "merchant", domain: "ikea.com" }, asked_action: "none", cited_numbers: [{ kind: "order", value: TGT }, { kind: "tracking", value: "1Z999AA10123456785" }], email_kind: "shipment_notice" },
    { emailText: `Order ${TGT} shipped with tracking 1Z999AA10123456785. ${body}`, senderCheck: "verified" },
  ];
  it("is refused with a handle, foreign text or hidden text", () => {
    const [c, o] = notice("Questions? Telegram @desk.");
    expect(canSaveShipmentFromClaim(c, ledger, pack, o)).toBe(false);
    const [c2, o2] = notice("Arrives Friday.");
    expect(canSaveShipmentFromClaim(c2, ledger, pack, o2)).toBe(true);
    expect(canSaveShipmentFromClaim(c2, ledger, pack, { ...o2, hiddenAny: true })).toBe(false);
  });
});
