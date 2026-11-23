/**
 * Round 5 regressions through the real extension chain (Gmail DOM ->
 * extractOpenGmailThread -> sanitizeEmail -> decideVerdict), from the round 4
 * security audit (J2-3, J2-4, J2-6, J2-8) and the round 5 cold judge (L2).
 * Each gave Safe, or kept a stale copy, on main eedce9a.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  FLAGGED_HEADLINE,
  HIDDEN_ANY_HEADLINE,
  decideVerdict,
  reconcileClaim,
  type EmailClaim,
  type LedgerSnapshot,
  type OfficialPack,
} from "@did-i-order-this/core";
import pack0 from "../../web/src/packs/official.json" with { type: "json" };
import { domainOfAddress, extractOpenGmailThread } from "./extract.ts";
import { sanitizeEmail } from "./messages.ts";
import { senderCheckForEmail, verdictOptionsForEmail } from "./senderCheck.ts";

const pack = pack0 as OfficialPack;
const now = "2026-11-23T00:00:00Z";
const T = "1Z999AA10123456784";
const ledger: LedgerSnapshot = {
  orders: [],
  shipments: [{ id: "s1", trackingNumber: T, carrier: "UPS", expected: true, source: "import", confirmedAt: now }],
  senders: [],
};
const upsClaim: EmailClaim = {
  claimed_party: { name: "UPS", role: "carrier" },
  asked_action: "none",
  cited_numbers: [{ kind: "tracking", value: T }],
  email_kind: "carrier_update",
};
const GMAIL_URL = "https://mail.google.com/mail/u/0/#inbox/abc";

function gmail(body: string, extraHeader = "", from = "mcinfo@ups.com"): string {
  return `<div role="main"><h2 class="hP">UPS Update: ${T}</h2>${extraHeader}
    <table><tr><td><h3><span class="gD" email='${from}'>UPS</span></h3></td></tr></table>
    <span class="g3" title="Mon, Nov 23, 2026">Nov 23</span>
    <div class="a3s aiL">${body}</div></div>`;
}
function doc(html: string, lang = "en", url = GMAIL_URL): Document {
  return new JSDOM(`<!doctype html><html${lang === "" ? "" : ` lang="${lang}"`}><body>${html}</body></html>`, { url }).window.document;
}
function verdictFor(d: Document, claim: EmailClaim = upsClaim) {
  const email = sanitizeEmail(extractOpenGmailThread(d))!;
  const c = reconcileClaim(claim, email.text, email.fromDomain);
  return { email, verdict: decideVerdict(c, ledger, pack, "on_device", verdictOptionsForEmail(email)) };
}

describe("J2-3: a visible child of a hidden parent is read, and any hidden text stops Safe", () => {
  const lure = "Pay the $2.99 customs fee at https://ups-fee.example/pay or your parcel goes back.";
  const cases: [string, string][] = [
    ["visibility override", `<div style="visibility:hidden"><p style="visibility:visible">${lure}</p></div>`],
    ["font-size override", `<div style="font-size:1px"><p style="font-size:16px">${lure}</p></div>`],
    ["margin shift", `<div style="margin-left:-2000px"><p style="margin-left:2000px">${lure}</p></div>`],
    ["text-indent shift", `<div style="text-indent:-3000px"><p style="text-indent:3000px">${lure}</p></div>`],
    ["em font override", `<div style="font-size:0"><p style="font-size:16px">${lure}</p></div>`],
  ];
  for (const [name, html] of cases) {
    it(`${name}: the lure is read and the verdict is Warning`, () => {
      const { email, verdict } = verdictFor(doc(gmail(`${html}<p>Your parcel ${T} is on its way.</p>`)));
      expect(email.text).toContain("customs fee");
      expect(verdict.outcome).toBe("warning");
    });
  }
  it("hidden stays hidden where a child cannot undo it: display none, opacity 0, zero box", () => {
    for (const style of ["display:none", "opacity:0", "overflow:hidden;height:0", "visibility:hidden"]) {
      const { email } = verdictFor(doc(gmail(`<div style="${style}"><p>secret words here</p></div><p>Your parcel ${T} is on its way.</p>`)));
      expect(email.text).not.toContain("secret words");
      expect(email.hiddenAny).toBe(true);
    }
  });
  it("a child cannot undo display:none or opacity:0 of its parent", () => {
    for (const style of ["display:none", "opacity:0"]) {
      const { email } = verdictFor(doc(gmail(`<div style="${style}"><p style="display:block;opacity:1;visibility:visible">pay me now</p></div><p>Parcel ${T}.</p>`)));
      expect(email.text).not.toContain("pay me now");
    }
  });
  it("a hidden lure before any visible text is no longer missed: Safe is refused", () => {
    const { email, verdict } = verdictFor(doc(gmail(`<div style="display:none">Pay $2.99 at ups-fee.example</div><p>Your parcel ${T} is on its way.</p>`)));
    expect(email.hiddenAny).toBe(true);
    expect(verdict.outcome).toBe("neutral");
    expect(verdict.headline).toBe(HIDDEN_ANY_HEADLINE);
  });
  it("Gmail's own folded parts are not counted as hidden text", () => {
    const { email, verdict } = verdictFor(doc(gmail(`<p>Your parcel ${T} is on its way.</p><div class="adL" style="display:none">quoted older text</div>`)));
    expect(email.hiddenAny).toBeUndefined();
    expect(verdict.outcome).toBe("safe");
  });
  it("checkVisibility, where the browser has it, can hide an element the style walk sees as shown", () => {
    const d = doc(gmail(`<p class="x">hidden by a stylesheet rule</p><p>Your parcel ${T} is on its way.</p>`));
    const p = d.querySelector("p.x") as Element & { checkVisibility?: () => boolean };
    p.checkVisibility = () => false;
    const { email } = verdictFor(d);
    expect(email.text).not.toContain("stylesheet rule");
    expect(email.hiddenAny).toBe(true);
  });
});

describe("L2: a Gmail interface in another language counts as flagged", () => {
  it("lang fr: flagged, Neutral", () => {
    const { email, verdict } = verdictFor(doc(gmail(`<p>Your parcel ${T} is on its way.</p>`), "fr"));
    expect(email.gmailFlags).toContain("foreign_ui");
    expect(senderCheckForEmail(email)).toBe("flagged");
    expect(verdict.headline).toBe(FLAGGED_HEADLINE);
  });
  it("no lang on Gmail: flagged; en-GB: not flagged", () => {
    expect(verdictFor(doc(gmail(`<p>Parcel ${T}.</p>`), "")).email.gmailFlags).toContain("foreign_ui");
    expect(verdictFor(doc(gmail(`<p>Parcel ${T} is on its way.</p>`), "en-GB")).verdict.outcome).toBe("safe");
  });
  it("the flag survives the background's checks", () => {
    expect(sanitizeEmail({ text: "x", fromDomain: "ups.com", subject: "s", gmailFlags: ["foreign_ui", "bogus"] })!.gmailFlags).toEqual(["foreign_ui"]);
  });
});

describe("J2-6: the sender domain is the part after the only @", () => {
  it("multi-@ or quoted addresses give no domain", () => {
    expect(domainOfAddress("alerts@ups.com@evil.example")).toBe("");
    expect(domainOfAddress('"alerts@ups.com"@evil.example')).toBe("");
    expect(domainOfAddress("a b@ups.com")).toBe("");
    expect(domainOfAddress("mcinfo@UPS.com")).toBe("ups.com");
    expect(domainOfAddress("no-at-sign")).toBe("");
  });
  for (const addr of ["alerts@ups.com@evil.example", '"alerts@ups.com"@evil.example']) {
    it(`${addr}: not Safe and never "listed as official"`, () => {
      const { email, verdict } = verdictFor(doc(gmail(`<p>Your parcel ${T} is held. Pay the $2.99 customs fee.</p>`, "", addr)), { ...upsClaim, asked_action: "pay" });
      expect(email.fromDomain).toBe("");
      expect(verdict.outcome).toBe("warning");
      expect(verdict.reasons.join(" ")).not.toMatch(/listed as official/);
    });
  }
});

describe("J2-4: the content script sends again when only flags change", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  it("a warning banner added after the first read is sent, and a reread answers after the fresh copy is sent", async () => {
    const d = doc(gmail(`<p>Your parcel ${T} is on its way.</p>`));
    const sent: { type: string; email?: { gmailFlags?: string[] } }[] = [];
    let listener: ((m: unknown, s: { id: string }, r: (x: unknown) => void) => unknown) | undefined;
    vi.stubGlobal("window", d.defaultView);
    vi.stubGlobal("document", d);
    vi.stubGlobal("MutationObserver", d.defaultView!.MutationObserver);
    vi.stubGlobal("chrome", {
      runtime: {
        id: "ext",
        sendMessage: async (m: { type: string }) => {
          sent.push(m);
          return { open: true };
        },
        onMessage: { addListener: (f: typeof listener) => (listener = f) },
      },
    });
    await import("./content.ts");
    await new Promise((r) => setTimeout(r, 50));
    const texts = () => sent.filter((m) => m.type === "DIO_EMAIL_TEXT");
    expect(texts()).toHaveLength(1);
    const banner = d.createElement("div");
    banner.textContent = "Be careful with this message";
    d.querySelector('[role="main"]')!.prepend(banner);
    await new Promise((r) => setTimeout(r, 400));
    expect(texts()).toHaveLength(2);
    expect(texts()[1].email?.gmailFlags).toEqual(["warning"]);
    // The panel's Check asks for a reread; it is answered after a fresh send.
    const answer = await new Promise((resolve) => {
      const keepOpen = listener!({ type: "DIO_PANEL_STATE", open: true, reread: true }, { id: "ext" }, resolve);
      expect(keepOpen).toBe(true);
    });
    expect(answer).toEqual({ done: true });
    expect(texts()).toHaveLength(3);
  });
});

describe("J2-8: the extension ledger keys orders on store and number", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });
  function fakeStorage() {
    const data: Record<string, unknown> = {};
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: data[key] }),
          set: async (value: Record<string, unknown>) => Object.assign(data, value),
        },
      },
    });
  }
  it("another store's order with the same number is kept; the same store's is replaced", async () => {
    fakeStorage();
    const { saveOrder, loadLedger } = await import("./ledger.ts");
    const base = { merchant: "x", source: "import" as const, confirmedAt: now };
    await saveOrder({ ...base, id: "a", senderDomain: "target.com", orderId: "1001" });
    await saveOrder({ ...base, id: "b", senderDomain: "zara.com", orderId: "1001" });
    await saveOrder({ ...base, id: "c", senderDomain: "TARGET.com", orderId: "1001" });
    const ids = (await loadLedger()).orders.map((o) => o.id).sort();
    expect(ids).toEqual(["b", "c"]);
  });
  it("adds one tracking number by hand as an expected parcel", async () => {
    fakeStorage();
    const { addExpectedTracking, loadLedger } = await import("./ledger.ts");
    await addExpectedTracking({ trackingNumber: T });
    const [row] = (await loadLedger()).shipments;
    expect(row.trackingNumber).toBe(T);
    expect(row.expected).toBe(true);
    expect(row.expectedUntil).toBeTruthy();
    await expect(addExpectedTracking({ trackingNumber: "nope" })).rejects.toThrow(/tracking number/);
  });
  it("hiddenAny survives the background's checks only as true", () => {
    expect(sanitizeEmail({ text: "x", fromDomain: "ups.com", subject: "s", hiddenAny: true })!.hiddenAny).toBe(true);
    expect(sanitizeEmail({ text: "x", fromDomain: "ups.com", subject: "s", hiddenAny: "yes" })!.hiddenAny).toBeUndefined();
  });
});
