/**
 * Client-side throttle for cloud reads (Firebase AI Logic). This is a courtesy
 * limit per browser session on top of the server-side protections (App Check
 * enforcement and the project's Gemini free-tier quota). It cannot stop a
 * determined caller, but it stops loops, double clicks and runaway retries.
 */
export const CLOUD_PER_MINUTE = 4;
export const CLOUD_PER_SESSION = 30;
const KEY = "dio.cloudCalls.v1";

export type BudgetStore = Pick<Storage, "getItem" | "setItem">;

export class CloudBudgetError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = "CloudBudgetError";
    this.retryAfterMs = retryAfterMs;
  }
}

function memoryStore(): BudgetStore {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

function defaultStore(): BudgetStore {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    // Storage blocked: fall back to memory for this page.
  }
  return memoryStore();
}

export class CloudBudget {
  private readonly store: BudgetStore;
  private readonly now: () => number;

  constructor(store: BudgetStore = defaultStore(), now: () => number = () => Date.now()) {
    this.store = store;
    this.now = now;
  }

  private read(): number[] {
    try {
      const raw = JSON.parse(this.store.getItem(KEY) ?? "[]");
      return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number") : [];
    } catch {
      return [];
    }
  }

  /** Throws CloudBudgetError when the session or per-minute limit is reached; otherwise records one call. */
  take(): void {
    const t = this.now();
    const calls = this.read();
    if (calls.length >= CLOUD_PER_SESSION) {
      throw new CloudBudgetError(
        `This session has used its ${CLOUD_PER_SESSION} cloud reads. Open a new tab later, or use on-device checks.`,
        Number.POSITIVE_INFINITY,
      );
    }
    const recent = calls.filter((c) => t - c < 60_000);
    if (recent.length >= CLOUD_PER_MINUTE) {
      const wait = 60_000 - (t - Math.min(...recent));
      throw new CloudBudgetError(
        `Cloud reads are limited to ${CLOUD_PER_MINUTE} a minute. Try again in ${Math.ceil(wait / 1000)} seconds.`,
        wait,
      );
    }
    calls.push(t);
    this.store.setItem(KEY, JSON.stringify(calls));
  }

  remaining(): number {
    return Math.max(0, CLOUD_PER_SESSION - this.read().length);
  }
}

export const cloudBudget = new CloudBudget();
