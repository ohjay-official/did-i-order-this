import { describe, expect, it } from "vitest";
import { runLimitedCheck } from "./limitedCheck.ts";
import type { OfficialPack } from "./types.ts";

const pack: OfficialPack = {
  version: "test",
  officialDomains: [{ domain: "ups.com", name: "UPS", role: "carrier" }],
  lureTemplates: [
    {
      id: "fee-to-release",
      pattern: "pay",
      note: "The wording asks for a payment, which is common in parcel-hold lures.",
    },
  ],
};

describe("runLimitedCheck", () => {
  it("labels the result as a limited check and does not issue a verdict outcome", () => {
    const result = runLimitedCheck(
      "From: alerts@dhl-parcel-desk.example\nPay a release fee. Tracking GM123456789012345",
      { fromDomain: "dhl-parcel-desk.example" },
      { orders: [], shipments: [], senders: [] },
      pack,
    );
    expect(result.inferenceSourceLabel).toBe("Limited check (no AI)");
    expect(result.headline).toBe("Limited check only. This is not a full verdict.");
    expect(result.findings.some((item) => item.includes("not in the official-domain pack"))).toBe(true);
    expect(result.findings.some((item) => item.includes("GM123456789012345"))).toBe(true);
  });

  it("notes when a found number matches an expected shipment", () => {
    const result = runLimitedCheck(
      "UPS update for 1Z999AA10123456784",
      { fromDomain: "ups.com" },
      {
        orders: [],
        shipments: [
          {
            id: "s1",
            trackingNumber: "1Z999AA10123456784",
            expected: true,
            source: "import",
            confirmedAt: "demo",
          },
        ],
        senders: [],
      },
      pack,
    );
    expect(result.findings.some((item) => item.includes("matches a shipment you are expecting"))).toBe(true);
    expect(result.findings.some((item) => item.includes("listed as official for UPS"))).toBe(true);
  });
});
