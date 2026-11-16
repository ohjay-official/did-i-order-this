import { describe, expect, it } from "vitest";
import pack from "../../../web/src/packs/official.json" with { type: "json" };
import { NOTHING_EXPECTED_HEADLINE, type EmailClaim, type OfficialPack } from "./types.ts";
import { looksLikeDomain, reconcileClaim, senderDomainFromHeader } from "./reconcile.ts";
import { decideVerdict } from "./verdict.ts";

const DHL_TEXT = `From: DHL Express Desk <alerts@dhl-parcel-desk.example>
Subject: Your parcel is held. Pay the release fee.

Tracking number: GM123456789012345
A customs release fee of $2.99 is due.`;

const UPS_TEXT = `From: UPS <mcinfo@ups.com>
Subject: UPS delivery update for 1Z999AA10123456784

Tracking number: 1Z999AA10123456784`;

// What Gemini Nano actually returned for the DHL sample on nano-film run 43947306478 (16 Nov 2026).
const nanoDhl: EmailClaim = {
  claimed_party: { name: "DHL Express", role: "carrier", domain: "DHL Express Desk" },
  asked_action: "pay",
  cited_numbers: [{ kind: "invoice", value: "$2.99" }],
  email_kind: "invoice",
};

describe("senderDomainFromHeader", () => {
  it("reads the From address domain only", () => {
    expect(senderDomainFromHeader(DHL_TEXT)).toBe("dhl-parcel-desk.example");
    expect(senderDomainFromHeader("From: someone@Mail.Example.com\nbody")).toBe("mail.example.com");
    expect(senderDomainFromHeader("Subject: hi\nwrite to help@ups.com")).toBe("");
  });
});

describe("looksLikeDomain", () => {
  it("rejects display names", () => {
    expect(looksLikeDomain("DHL Express Desk")).toBe(false);
    expect(looksLikeDomain("ups.com")).toBe(true);
  });
});

describe("reconcileClaim", () => {
  it("fixes a display-name domain and adds the missed tracking number", () => {
    const fixed = reconcileClaim(nanoDhl, DHL_TEXT, senderDomainFromHeader(DHL_TEXT));
    expect(fixed.claimed_party.domain).toBe("dhl-parcel-desk.example");
    expect(fixed.cited_numbers).toContainEqual({ kind: "invoice", value: "$2.99" });
    expect(fixed.cited_numbers).toContainEqual({ kind: "tracking", value: "GM123456789012345" });
    const v = decideVerdict(fixed, { orders: [], shipments: [], senders: [] }, pack as OfficialPack);
    expect(v.headline).toBe(NOTHING_EXPECTED_HEADLINE);
    expect(v.reasons).toContain("Cited tracking number: GM123456789012345.");
  });

  it("lets the UPS match work even when the model misses the number", () => {
    const missed: EmailClaim = {
      claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" },
      asked_action: "none",
      cited_numbers: [],
      email_kind: "carrier_update",
    };
    const fixed = reconcileClaim(missed, UPS_TEXT, senderDomainFromHeader(UPS_TEXT));
    const v = decideVerdict(
      fixed,
      {
        orders: [],
        senders: [],
        shipments: [
          { id: "s", trackingNumber: "1Z999AA10123456784", expected: true, source: "demo_seed", confirmedAt: "demo_seed" },
        ],
      },
      pack as OfficialPack,
    );
    expect(v.outcome).toBe("safe");
  });

  it("uses the sender's domain over an official domain claimed in the body", () => {
    const claim: EmailClaim = { ...nanoDhl, claimed_party: { name: "UPS", role: "carrier", domain: "ups.com" } };
    const fixed = reconcileClaim(claim, DHL_TEXT, senderDomainFromHeader(DHL_TEXT));
    expect(fixed.claimed_party.domain).toBe("dhl-parcel-desk.example");
  });

  it("drops a non-domain value when there is no From line", () => {
    const fixed = reconcileClaim(nanoDhl, "Tracking GM123456789012345", "");
    expect(fixed.claimed_party.domain).toBeUndefined();
  });

  it("does not duplicate a number the model already cited", () => {
    const claim: EmailClaim = { ...nanoDhl, cited_numbers: [{ kind: "tracking", value: "GM 1234 5678 9012 345" }] };
    const fixed = reconcileClaim(claim, DHL_TEXT, "");
    expect(fixed.cited_numbers.filter((n) => n.value.replace(/\s/g, "") === "GM123456789012345")).toHaveLength(1);
  });
});
