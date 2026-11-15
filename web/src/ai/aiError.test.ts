import { describe, expect, it } from "vitest";
import { describeAiError } from "./aiError.ts";
import { CloudBudgetError } from "./cloudBudget.ts";

describe("describeAiError", () => {
  it("explains quota and rate limits", () => {
    expect(describeAiError(new Error("[429 ] RESOURCE_EXHAUSTED: Quota exceeded"))).toMatch(/limit/);
  });
  it("explains App Check failures", () => {
    expect(describeAiError(new Error("Firebase App Check token is invalid."))).toMatch(/App Check/);
  });
  it("explains network failures", () => {
    expect(describeAiError(new TypeError("Failed to fetch"))).toMatch(/could not be reached/);
  });
  it("explains a missing on-device model", () => {
    expect(describeAiError(new Error("The on-device model is not available in this environment."))).toMatch(/On-device AI/);
  });
  it("explains an unusable structured reply", () => {
    expect(describeAiError(new Error("The structured claim is invalid or incomplete."))).toMatch(/usable claim/);
  });
  it("passes the session budget message through", () => {
    expect(describeAiError(new CloudBudgetError("Cloud reads are limited to 4 a minute.", 1000))).toBe(
      "Cloud reads are limited to 4 a minute.",
    );
  });
  it("never echoes unknown raw text", () => {
    expect(describeAiError(new Error("secret-ish internal detail"))).toBe("The AI read failed for an unknown reason.");
  });
});
