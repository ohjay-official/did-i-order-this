/**
 * Decides quickly whether an on-device read is worth trying, so a browser
 * with no on-device model reaches the cloud consent step (or the sample
 * fallback) in well under a second instead of after about 12 seconds.
 *
 * Product code never calls the Prompt API. The only thing this file does is
 * check whether the browser exposes it at all, which is the same test the
 * Firebase SDK makes before it builds its on-device adapter.
 */

/** Chrome can report the model as unavailable for a few seconds after it starts. */
export const WARMUP_WINDOW_MS = 12_000;
export const WARMUP_RETRY_MS = 1_000;

const NOT_AVAILABLE = "not available in this environment";

export class NoOnDeviceModelError extends Error {
  constructor(message = "No on-device model is available in this browser.") {
    super(message);
    this.name = "NoOnDeviceModelError";
  }
}

/**
 * True when the browser exposes the built-in Prompt API. When it does not,
 * Firebase AI Logic has no on-device adapter, and an "only on device" request
 * would be sent to the cloud instead. Callers must stop before that happens.
 */
export function hasOnDeviceApi(scope: object = globalThis): boolean {
  // The SDK builds its on-device adapter only when this global is truthy. A key
  // that exists but holds undefined (a shim or a "disable AI" script) must count
  // as missing, or an "only on device" read would quietly go to the cloud.
  return typeof (scope as { LanguageModel?: unknown }).LanguageModel === "function";
}

/**
 * Second lock for every "only on device" call. Firebase AI Logic sends a
 * request to the cloud when a model has no on-device adapter, whatever the
 * mode says, so refuse to call generateContent unless the adapter exists and
 * is set to on-device only.
 */
export function assertOnDeviceAdapter(model: object): void {
  const adapter = (model as { chromeAdapter?: { mode?: unknown } }).chromeAdapter;
  if (!adapter || adapter.mode !== "only_on_device") throw new NoOnDeviceModelError();
}

/** Hosts a Firebase AI Logic or App Check call would use. */
export function isGoogleAiRequest(input: unknown): boolean {
  let raw: string;
  if (typeof input === "string") raw = input;
  else if (input instanceof URL) raw = input.href;
  else if (input && typeof (input as { url?: unknown }).url === "string") raw = (input as { url: string }).url;
  else return true;
  if (raw.startsWith("data:")) return false;
  try {
    const host = new URL(raw, "https://invalid.invalid").hostname.toLowerCase();
    return /(^|\.)(googleapis\.com|google\.com|gstatic\.com|recaptcha\.net)$/.test(host);
  } catch {
    return true;
  }
}

export class CloudRequestBlockedError extends Error {
  constructor() {
    super("A cloud request was blocked during an on-device-only read.");
    this.name = "CloudRequestBlockedError";
  }
}

let blockDepth = 0;
let realFetch: typeof fetch | undefined;

/**
 * Runs an on-device-only call with requests to Google's AI and App Check
 * hosts refused, so even an SDK change cannot send the text to the cloud.
 */
export async function withCloudFetchBlocked<T>(run: () => Promise<T>): Promise<T> {
  const scope = globalThis as { fetch?: typeof fetch };
  if (blockDepth === 0 && typeof scope.fetch === "function") {
    realFetch = scope.fetch;
    const original = realFetch;
    scope.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (isGoogleAiRequest(input)) return Promise.reject(new CloudRequestBlockedError());
      return original.call(globalThis, input, init);
    }) as typeof fetch;
  }
  blockDepth += 1;
  try {
    return await run();
  } finally {
    blockDepth -= 1;
    if (blockDepth === 0 && realFetch) {
      scope.fetch = realFetch;
      realFetch = undefined;
    }
  }
}

export function isNotReadyYet(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(NOT_AVAILABLE);
}

export interface WarmupOptions {
  /** Milliseconds since this page started loading. */
  pageAgeMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Remembers, for this tab session, that the model stayed unavailable past the warm-up window. */
  memory?: MissingModelMemory;
}

/**
 * Chrome reports the same "unavailable" for a model that is still starting
 * and for one that is off for good (an enterprise policy, an unsupported
 * device), and product code may not ask the Prompt API which it is. So once a
 * page in this tab has waited out the whole window and still had no model,
 * later pages try once and do not wait again.
 */
export interface MissingModelMemory {
  isMissing(): boolean;
  setMissing(missing: boolean): void;
}

export const MISSING_MODEL_KEY = "dio.onDeviceMissing.v1";

export const sessionMissingModelMemory: MissingModelMemory = {
  isMissing() {
    try {
      return globalThis.sessionStorage?.getItem(MISSING_MODEL_KEY) === "1";
    } catch {
      return false;
    }
  },
  setMissing(missing) {
    try {
      if (missing) globalThis.sessionStorage?.setItem(MISSING_MODEL_KEY, "1");
      else globalThis.sessionStorage?.removeItem(MISSING_MODEL_KEY);
    } catch {
      // Storage can be blocked; then every page waits out the window.
    }
  },
};

function defaultPageAge(): number {
  return typeof performance === "undefined" ? Number.POSITIVE_INFINITY : performance.now();
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Warms the on-device model. A "not available" answer is retried only while
 * the page is in its first WARMUP_WINDOW_MS (the known "Chrome just started"
 * case). After that window, the same answer means this browser has no model,
 * so it fails at once. Once a page in this tab waited out the window with no
 * model, later pages try once and fail at once.
 */
export async function warmUpOnDevice(
  model: { initializeDeviceModel(): Promise<void> },
  options: WarmupOptions = {},
): Promise<void> {
  const pageAge = options.pageAgeMs ?? defaultPageAge;
  const sleep = options.sleep ?? defaultSleep;
  const memory = options.memory ?? sessionMissingModelMemory;
  const knownMissing = memory.isMissing();
  let retried = false;
  for (;;) {
    try {
      await model.initializeDeviceModel();
      if (knownMissing) memory.setMissing(false);
      return;
    } catch (error) {
      if (!isNotReadyYet(error)) throw error;
      if (knownMissing || pageAge() + WARMUP_RETRY_MS > WARMUP_WINDOW_MS) {
        // Waited out the window and still nothing: do not wait again in this tab.
        if (retried) memory.setMissing(true);
        throw error;
      }
      retried = true;
      await sleep(WARMUP_RETRY_MS);
    }
  }
}
