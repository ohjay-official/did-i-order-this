import { CloudBudgetError } from "./cloudBudget.ts";

/**
 * Turns an AI or App Check failure into one plain sentence a person can act on.
 * Raw SDK messages stay in the console; the screen gets the reason, not a stack.
 */
export function describeAiError(error: unknown): string {
  if (error instanceof CloudBudgetError) return error.message;
  const raw = error instanceof Error ? `${error.name} ${error.message} ${String((error as { code?: unknown }).code ?? "")}` : String(error);
  const text = raw.toLowerCase();
  if (/429|resource_exhausted|quota|rate limit|too many requests/.test(text)) {
    return "The cloud limit for this project was reached. Wait a minute and try again, or run a limited check.";
  }
  if (/app ?check|appcheck|recaptcha|attestation/.test(text)) {
    return "This page could not prove it is the real site (App Check). Reload the page and try again.";
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
