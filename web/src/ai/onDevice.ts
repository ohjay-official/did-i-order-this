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
  return "LanguageModel" in scope;
}

export function isNotReadyYet(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(NOT_AVAILABLE);
}

export interface WarmupOptions {
  /** Milliseconds since this page started loading. */
  pageAgeMs?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

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
 * so it fails at once.
 */
export async function warmUpOnDevice(
  model: { initializeDeviceModel(): Promise<void> },
  options: WarmupOptions = {},
): Promise<void> {
  const pageAge = options.pageAgeMs ?? defaultPageAge;
  const sleep = options.sleep ?? defaultSleep;
  for (;;) {
    try {
      await model.initializeDeviceModel();
      return;
    } catch (error) {
      if (!isNotReadyYet(error)) throw error;
      if (pageAge() + WARMUP_RETRY_MS > WARMUP_WINDOW_MS) throw error;
      await sleep(WARMUP_RETRY_MS);
    }
  }
}
