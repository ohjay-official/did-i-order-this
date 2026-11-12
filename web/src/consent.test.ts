import { describe, expect, it } from "vitest";
import { chooseInferenceMode } from "./consent.ts";

describe("chooseInferenceMode", () => {
  it("defaults to only_on_device when on-device AI is available", async () => {
    const mode = await chooseInferenceMode(true, async () => {
      throw new Error("consent should not be requested");
    });
    expect(mode).toBe("only_on_device");
  });

  it("requires consent before a cloud mode, and cancelled means no cloud call", async () => {
    await expect(chooseInferenceMode(false, async () => false)).resolves.toBe("cancelled");
    await expect(chooseInferenceMode(false, async () => true)).resolves.toBe("only_in_cloud");
  });
});
