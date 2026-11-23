import { describe, expect, it, vi } from "vitest";
import { checkOnDeviceReady } from "./onDeviceCheck.ts";

describe("checkOnDeviceReady (side panel fail-fast)", () => {
  it("fails at once when the browser has no on-device API, without building a model", async () => {
    const makeModel = vi.fn();
    await expect(checkOnDeviceReady({ hasApi: () => false, makeModel })).rejects.toThrow(/No on-device model/);
    expect(makeModel).not.toHaveBeenCalled();
  });
  it("asks once and does not retry a 'not available' answer", async () => {
    const initializeDeviceModel = vi.fn().mockRejectedValue(new Error("On-device model is not available in this environment."));
    await expect(checkOnDeviceReady({ hasApi: () => true, makeModel: () => ({ initializeDeviceModel }) })).rejects.toThrow(/not available/);
    expect(initializeDeviceModel).toHaveBeenCalledTimes(1);
  });
  it("resolves when the model starts", async () => {
    const initializeDeviceModel = vi.fn().mockResolvedValue(undefined);
    await expect(checkOnDeviceReady({ hasApi: () => true, makeModel: () => ({ initializeDeviceModel }) })).resolves.toBeUndefined();
  });
});
