import { describe, expect, it } from "vitest";
import { CloudConsentMemory, type ConsentStore } from "./consentMemory.ts";

function store(): ConsentStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

const broken: ConsentStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("CloudConsentMemory", () => {
  it("starts with no remembered yes", () => {
    expect(new CloudConsentMemory(store()).has()).toBe(false);
  });

  it("remembers a yes for the tab session and shares it across instances on the same storage", () => {
    const shared = store();
    new CloudConsentMemory(shared).remember();
    expect(new CloudConsentMemory(shared).has()).toBe(true);
  });

  it("forget() clears the yes so the next check asks again", () => {
    const memory = new CloudConsentMemory(store());
    memory.remember();
    memory.forget();
    expect(memory.has()).toBe(false);
  });

  it("treats blocked storage as no remembered yes and never throws", () => {
    const memory = new CloudConsentMemory(broken);
    expect(() => memory.remember()).not.toThrow();
    expect(() => memory.forget()).not.toThrow();
    expect(memory.has()).toBe(false);
  });

  it("falls back to page memory when sessionStorage is missing", () => {
    const memory = new CloudConsentMemory();
    memory.remember();
    expect(memory.has()).toBe(true);
    memory.forget();
    expect(memory.has()).toBe(false);
  });
});
