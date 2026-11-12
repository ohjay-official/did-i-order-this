import { describe, expect, it } from "vitest";
import { ON_DEVICE_CREATE_OPTIONS } from "./readClaim.ts";

describe("ON_DEVICE_CREATE_OPTIONS", () => {
  it("requests a text-only on-device model, not the image default", () => {
    const inputs = ON_DEVICE_CREATE_OPTIONS.expectedInputs ?? [];
    const outputs = ON_DEVICE_CREATE_OPTIONS.expectedOutputs ?? [];
    const inputTypes = inputs.map((item) => item.type as string);
    expect(inputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(outputs).toEqual([{ type: "text", languages: ["en"] }]);
    expect(inputTypes).not.toContain("image");
  });
});
