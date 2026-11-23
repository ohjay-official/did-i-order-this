import { describe, expect, it } from "vitest";
import {
  NoOnDeviceModelError,
  WARMUP_RETRY_MS,
  WARMUP_WINDOW_MS,
  hasOnDeviceApi,
  isNotReadyYet,
  warmUpOnDevice,
} from "./onDevice.ts";

const notReady = () => new Error("Local Prompt API not available in this environment.");

function fakeClock(start: number) {
  let t = start;
  const sleeps: number[] = [];
  return {
    pageAgeMs: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

function model(errors: Error[]) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    initializeDeviceModel: async () => {
      calls += 1;
      const next = errors.shift();
      if (next) throw next;
    },
  };
}

describe("on-device fail fast", () => {
  it("sees whether the browser exposes the on-device API", () => {
    // Node has no on-device API, and neither does an empty scope. The positive
    // case runs only in Chrome; the source guard keeps the API name out of tests.
    expect(hasOnDeviceApi({})).toBe(false);
    expect(hasOnDeviceApi()).toBe(false);
  });

  it("names the error so callers can skip straight to consent", () => {
    const error = new NoOnDeviceModelError();
    expect(error.name).toBe("NoOnDeviceModelError");
    expect(error.message).toMatch(/on-device model/);
    expect(isNotReadyYet(notReady())).toBe(true);
    expect(isNotReadyYet(new Error("download failed"))).toBe(false);
    expect(isNotReadyYet("not available in this environment")).toBe(true);
  });

  it("fails at once when the page has been open past the warm-up window", async () => {
    const clock = fakeClock(WARMUP_WINDOW_MS + 5_000);
    const m = model([notReady()]);
    await expect(warmUpOnDevice(m, clock)).rejects.toThrow("not available");
    expect(m.calls).toBe(1);
    expect(clock.sleeps).toEqual([]);
  });

  it("keeps a short retry while Chrome has just started", async () => {
    const clock = fakeClock(500);
    const m = model([notReady(), notReady()]);
    await warmUpOnDevice(m, clock);
    expect(m.calls).toBe(3);
    expect(clock.sleeps).toEqual([WARMUP_RETRY_MS, WARMUP_RETRY_MS]);
  });

  it("F13: after one page waited out the window with no model, later pages in the tab do not wait again", async () => {
    let missing = false;
    const memory = { isMissing: () => missing, setMissing: (value: boolean) => void (missing = value) };
    const first = fakeClock(0);
    await expect(warmUpOnDevice(model(Array.from({ length: 50 }, notReady)), { ...first, memory })).rejects.toThrow("not available");
    expect(missing).toBe(true);
    const second = fakeClock(0);
    const m = model([notReady()]);
    await expect(warmUpOnDevice(m, { ...second, memory })).rejects.toThrow("not available");
    expect(m.calls).toBe(1);
    expect(second.sleeps).toEqual([]);
    // A model that turns up later clears the memory.
    await warmUpOnDevice(model([]), { ...fakeClock(0), memory });
    expect(missing).toBe(false);
  });

  it("stops retrying when the warm-up window runs out", async () => {
    const clock = fakeClock(0);
    const m = model(Array.from({ length: 50 }, notReady));
    await expect(warmUpOnDevice(m, clock)).rejects.toThrow("not available");
    expect(clock.pageAgeMs()).toBeLessThanOrEqual(WARMUP_WINDOW_MS);
    expect(m.calls).toBeLessThanOrEqual(WARMUP_WINDOW_MS / WARMUP_RETRY_MS + 1);
  });

  it("does not retry other failures", async () => {
    const clock = fakeClock(0);
    const m = model([new Error("download failed")]);
    await expect(warmUpOnDevice(m, clock)).rejects.toThrow("download failed");
    expect(m.calls).toBe(1);
  });

  it("works with the default clock", async () => {
    const m = model([]);
    await warmUpOnDevice(m);
    expect(m.calls).toBe(1);
  });
});
