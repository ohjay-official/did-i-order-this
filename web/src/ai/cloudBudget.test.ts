import { describe, expect, it } from "vitest";
import { CLOUD_PER_MINUTE, CLOUD_PER_SESSION, CloudBudget, CloudBudgetError } from "./cloudBudget.ts";

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("CloudBudget", () => {
  it("allows the per-minute limit, then blocks until a minute passes", () => {
    let t = 1_000_000;
    const b = new CloudBudget(store(), () => t);
    for (let i = 0; i < CLOUD_PER_MINUTE; i += 1) b.take();
    expect(() => b.take()).toThrow(CloudBudgetError);
    t += 60_001;
    expect(() => b.take()).not.toThrow();
  });

  it("stops at the per-session cap", () => {
    let t = 0;
    const b = new CloudBudget(store(), () => t);
    for (let i = 0; i < CLOUD_PER_SESSION; i += 1) {
      b.take();
      t += 61_000;
    }
    expect(b.remaining()).toBe(0);
    expect(() => b.take()).toThrow(/session/);
  });
});
