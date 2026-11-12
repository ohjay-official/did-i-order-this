import { describe, expect, it } from "vitest";
import { parseClaimResponse } from "./parseClaim.ts";

const valid = {
  claimed_party: { name: "DHL", role: "carrier", domain: "dhl-parcel-desk.example" },
  asked_action: "pay",
  cited_numbers: [{ kind: "tracking", value: "GM123456789012345" }],
  email_kind: "carrier_update",
};

describe("parseClaimResponse", () => {
  it("returns a valid claim", () => {
    const claim = parseClaimResponse(JSON.stringify(valid));
    expect(claim.claimed_party.role).toBe("carrier");
    expect(claim.cited_numbers[0]?.value).toBe("GM123456789012345");
  });

  it("rejects an incomplete claim", () => {
    expect(() => parseClaimResponse("{}")).toThrow(/invalid or incomplete/);
    expect(() => parseClaimResponse("not-json")).toThrow(/invalid or incomplete/);
  });
});
