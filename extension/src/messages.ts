export const MESSAGE = {
  EMAIL_TEXT: "DIO_EMAIL_TEXT",
  GET_EMAIL: "DIO_GET_EMAIL",
} as const;

export const HOSTED_APP_URL = "https://did-i-order-this.vercel.app";

/** Longest email text the side panel will accept (characters). */
export const MAX_EMAIL_CHARS = 20_000;

export type ExtractedEmail = {
  text: string;
  fromDomain: string;
  subject: string;
  fromEmail?: string;
  fromName?: string;
  /** True when the open thread has messages from more than one sender domain. */
  mixedSenders?: boolean;
};

export type EmailTextMessage = {
  type: typeof MESSAGE.EMAIL_TEXT;
  email: ExtractedEmail | null;
  reason?: string;
};

export type GetEmailMessage = { type: typeof MESSAGE.GET_EMAIL };

function isString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

/** Validates an email payload from the content script; returns a trimmed copy or null. */
export function sanitizeEmail(value: unknown): ExtractedEmail | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.text !== "string" || !isString(v.fromDomain, 253) || !isString(v.subject, 1000)) return null;
  const email: ExtractedEmail = {
    text: v.text.slice(0, MAX_EMAIL_CHARS),
    fromDomain: v.fromDomain.toLowerCase(),
    subject: v.subject,
  };
  if (isString(v.fromEmail, 320)) email.fromEmail = v.fromEmail;
  if (isString(v.fromName, 200)) email.fromName = v.fromName;
  if (v.mixedSenders === true) email.mixedSenders = true;
  return email;
}

/** Turns manifest match patterns like "https://mail.google.com/*" into URL prefixes. */
export function matchPrefixes(patterns: readonly string[]): string[] {
  return patterns.map((p) => p.replace(/\*$/, "")).filter((p) => /^https?:\/\/[^*]+\/$/.test(p));
}

/** True only for messages from this extension's own content script on a page it is declared for. */
export function isTrustedSender(
  sender: { id?: string; url?: string; tab?: { url?: string } },
  extensionId: string,
  allowedPrefixes: readonly string[] = ["https://mail.google.com/"],
): boolean {
  if (sender.id !== extensionId) return false;
  const url = sender.tab?.url ?? sender.url ?? "";
  return allowedPrefixes.some((prefix) => url.startsWith(prefix));
}

/** Prefixes from the installed manifest's content_scripts (tests may add a local fixture host). */
export function manifestPrefixes(): string[] {
  try {
    const scripts = chrome.runtime.getManifest().content_scripts ?? [];
    const prefixes = matchPrefixes(scripts.flatMap((entry) => entry.matches ?? []));
    return prefixes.length ? prefixes : ["https://mail.google.com/"];
  } catch {
    return ["https://mail.google.com/"];
  }
}
