/**
 * After App Check fails once in this tab, cloud checks stay off for the rest of
 * the session: retrying would only send the email text to a request that is
 * rejected (and reCAPTCHA throttles retries for a day). Kept in sessionStorage,
 * so a new tab tries again.
 */
const KEY = "dio.appCheckBlocked.v1";

export type GateStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function memoryStore(): GateStore {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

function defaultStore(): GateStore {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    // Storage blocked: remember only for this page.
  }
  return memoryStore();
}

export class AppCheckGate {
  private readonly store: GateStore;
  private memory = false;

  constructor(store: GateStore = defaultStore()) {
    this.store = store;
  }

  isBlocked(): boolean {
    if (this.memory) return true;
    try {
      return this.store.getItem(KEY) === "yes";
    } catch {
      return false;
    }
  }

  block(): void {
    this.memory = true;
    try {
      this.store.setItem(KEY, "yes");
    } catch {
      // The in-memory flag still holds for this page.
    }
  }

  clear(): void {
    this.memory = false;
    try {
      this.store.removeItem(KEY);
    } catch {
      // Nothing to clear.
    }
  }
}

export const appCheckGate = new AppCheckGate();

export class AppCheckBlockedError extends Error {
  constructor() {
    super("App Check failed earlier in this tab, so the cloud check stays off for this session.");
    this.name = "AppCheckBlockedError";
  }
}
