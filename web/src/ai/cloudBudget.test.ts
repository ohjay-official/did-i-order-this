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

describe("CloudBudget limits for a full sample walk", () => {
  it("allows 10 cloud reads a minute to match the server quota, and refuses the 11th", () => {
    expect(CLOUD_PER_MINUTE).toBe(10);
    const t = 5_000_000;
    const b = new CloudBudget(store(), () => t);
    for (let i = 0; i < 10; i += 1) b.take();
    expect(() => b.take()).toThrow("Cloud reads are limited to 10 a minute. Try again in 60 seconds.");
  });

  it("keeps a session cap of 30 even when calls are spread out", () => {
    expect(CLOUD_PER_SESSION).toBe(30);
    let t = 0;
    const b = new CloudBudget(store(), () => t);
    for (let i = 0; i < 30; i += 1) {
      b.take();
      t += 10_000;
    }
    expect(() => b.take()).toThrow("This session has used its 30 cloud reads. Open a new tab later, or use on-device checks.");
  });

  it("has no bypass: a fresh instance on the same storage sees the same count", () => {
    const shared = store();
    const t = 9_000_000;
    const first = new CloudBudget(shared, () => t);
    for (let i = 0; i < 10; i += 1) first.take();
    const second = new CloudBudget(shared, () => t);
    expect(() => second.take()).toThrow(CloudBudgetError);
  });
});
