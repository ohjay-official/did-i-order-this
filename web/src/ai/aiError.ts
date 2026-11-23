import { CloudBudgetError } from "./cloudBudget.ts";

/**
 * Turns an AI or App Check failure into one plain sentence a person can act on.
 * Raw SDK messages stay in the console; the screen gets the reason, not a stack.
 */
export const APP_CHECK_MESSAGE =
  "This browser could not pass Google's App Check, so the cloud check is unavailable here. Try another browser, or use Chrome with on-device AI.";

function errorText(error: unknown): string {
  const raw = error instanceof Error ? `${error.name} ${error.message} ${String((error as { code?: unknown }).code ?? "")}` : String(error);
  return raw.toLowerCase();
}

/** True for App Check and reCAPTCHA failures, including the cloud's 401 after a failed token exchange. */
export function isAppCheckError(error: unknown): boolean {
  if (error instanceof CloudBudgetError) return false;
  return /app ?check|appcheck|recaptcha|attestation/.test(errorText(error));
}

export function describeAiError(error: unknown): string {
  if (error instanceof CloudBudgetError) return error.message;
  const text = errorText(error);
  if (/did not answer in time/.test(text)) {
    return "The cloud did not answer in time. Check your connection and try again.";
  }
  if (/429|resource_exhausted|quota|rate limit|too many requests/.test(text)) {
    return "The cloud limit for this project was reached. Wait a minute and try again, or run a limited check.";
  }
  if (/app ?check|appcheck|recaptcha|attestation/.test(text)) {
    return APP_CHECK_MESSAGE;
  }
  if (/failed to fetch|networkerror|network error|offline|err_internet|load failed/.test(text)) {
    return "The cloud could not be reached. Check your connection and try again.";
  }
  if (/not available in this environment|on-device model|device model/.test(text)) {
    return "On-device AI is not available in this browser.";
  }
  if (/invalid or incomplete|could not parse|json/.test(text)) {
    return "The AI reply was not a usable claim, even after one retry.";
  }
  if (/not configured/.test(text)) {
    return "AI is not configured on this deployment.";
  }
  return "The AI read failed for an unknown reason.";
}
