export const MESSAGE = {
  EMAIL_TEXT: "DIO_EMAIL_TEXT",
  GET_EMAIL: "DIO_GET_EMAIL",
  /** Content script to background, no email text: "is the panel open?". */
  READY: "DIO_READY",
  /** Background to content script: the side panel opened or closed. */
  PANEL_STATE: "DIO_PANEL_STATE",
  /** Background to side panel over its port: a stored email changed, or the active tab did. */
  CHANGED: "DIO_CHANGED",
} as const;

/** The port name the side panel connects with, so the background knows it is open. */
export const PANEL_PORT = "dio-panel";

export const HOSTED_APP_URL = "https://did-i-order-this.vercel.app";

/**
 * Longest email text the side panel will accept (characters). The verdict
 * reads all of it; the AI read gets the first MODEL_INPUT_CHARS (20,000), and
 * a longer email is never Safe. Past this cap the text is cut and marked.
 */
export const MAX_EMAIL_CHARS = 200_000;

/** What Gmail itself shows about the message: in Spam, a warning banner, or a "via" sender. */
/** "foreign_ui": Gmail is shown in a language the flag checks can't read. */
export type GmailFlag = "spam" | "warning" | "via" | "foreign_ui";
const GMAIL_FLAGS: readonly GmailFlag[] = ["spam", "warning", "via", "foreign_ui"];

export type ExtractedEmail = {
  text: string;
  fromDomain: string;
  subject: string;
  fromEmail?: string;
  fromName?: string;
  /** True when the open thread has messages from more than one sender domain. */
  mixedSenders?: boolean;
  /** Hosts of link and form targets in the bodies, Gmail redirects unwrapped. */
  linkHosts?: string[];
  /** Hosts of images the bodies load. */
  imageHosts?: string[];
  /** Hidden text that differs from what is shown. */
  hiddenText?: boolean;
  /** Any hidden words at all in the bodies (Gmail's own folding aside). Stops Safe. */
  hiddenAny?: boolean;
  /** An attachment or embedded frame the extension does not read. Never Safe (round 6). */
  unreadContent?: boolean;
  /** The text was longer than MAX_EMAIL_CHARS and was cut. */
  truncated?: boolean;
  /** Gmail's own flags on the open message. */
  gmailFlags?: GmailFlag[];
  /**
   * Set by the background, never by the page: the email came from a page that
   * is not Gmail (the extension's test page). Caps the result at Neutral.
   */
  fixture?: boolean;
};

export type EmailTextMessage = {
  type: typeof MESSAGE.EMAIL_TEXT;
  email: ExtractedEmail | null;
  reason?: string;
};

/** From the side panel: the email for one tab, or (panel opened as a tab, as in tests) the latest one. */
export type GetEmailMessage = { type: typeof MESSAGE.GET_EMAIL; tabId?: number; latest?: boolean; fresh?: boolean };

/** Gmail itself is the only page whose sender the extension trusts. */
export const GMAIL_PREFIX = "https://mail.google.com/";

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
  if (v.text.length > MAX_EMAIL_CHARS || v.truncated === true) email.truncated = true;
  const hosts = (value: unknown) =>
    Array.isArray(value) ? value.filter((h): h is string => isString(h, 253) && h.length > 0).map((h) => h.toLowerCase()).slice(0, 200) : [];
  const links = hosts(v.linkHosts);
  if (links.length) email.linkHosts = links;
  const images = hosts(v.imageHosts);
  if (images.length) email.imageHosts = images;
  if (v.hiddenText === true) email.hiddenText = true;
  if (v.hiddenAny === true) email.hiddenAny = true;
  if (v.unreadContent === true) email.unreadContent = true;
  const flags = Array.isArray(v.gmailFlags) ? GMAIL_FLAGS.filter((flag) => (v.gmailFlags as unknown[]).includes(flag)) : [];
  if (flags.length) email.gmailFlags = flags;
  // A page can only mark itself as a fixture (a downgrade); the background sets the real value.
  if (v.fixture === true) email.fixture = true;
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
