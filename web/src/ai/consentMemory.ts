/**
 * Remembers a "Check in the cloud" yes for the rest of this tab session, so a
 * judge walking the sample inbox is not asked on every thread. A "Do not send"
 * is never remembered, so the next check asks again. The yes lives in
 * sessionStorage: closing the tab forgets it, and forget() clears it at once.
 */
const KEY = "dio.cloudConsent.v1";

export type ConsentStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryStore(): ConsentStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function defaultStore(): ConsentStore {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    // Storage blocked: remember only for this page.
  }
  return memoryStore();
}

export class CloudConsentMemory {
  private readonly store: ConsentStore;

  constructor(store: ConsentStore = defaultStore()) {
    this.store = store;
  }

  has(): boolean {
    try {
      return this.store.getItem(KEY) === "yes";
    } catch {
      return false;
    }
  }

  remember(): void {
    try {
      this.store.setItem(KEY, "yes");
    } catch {
      // Storage full or blocked: the dialog will simply ask again.
    }
  }

  forget(): void {
    try {
      this.store.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

export const cloudConsentMemory = new CloudConsentMemory();
