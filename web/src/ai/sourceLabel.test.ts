import { describe, expect, it } from "vitest";
import { sourceLabel } from "./sourceLabel.ts";

describe("sourceLabel", () => {
  it("maps both official inferenceSource values", () => {
    expect(sourceLabel("on_device")).toBe("Checked on this device");
    expect(sourceLabel("in_cloud")).toBe("Checked in the cloud");
  });
});
