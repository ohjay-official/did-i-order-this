import { MESSAGE, isTrustedSender, manifestPrefixes, sanitizeEmail, type EmailTextMessage, type ExtractedEmail } from "./messages.ts";

let latest: ExtractedEmail | null = null;
let latestReason: string | undefined;

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  const type = (message as { type?: unknown }).type;

  if (type === MESSAGE.EMAIL_TEXT) {
    // Only this extension's content script on Gmail may set the open email.
    if (!isTrustedSender(sender, chrome.runtime.id, manifestPrefixes())) {
      sendResponse({ ok: false });
      return;
    }
    const incoming = message as Partial<EmailTextMessage>;
    latest = sanitizeEmail(incoming.email);
    latestReason = typeof incoming.reason === "string" ? incoming.reason.slice(0, 300) : undefined;
    sendResponse({ ok: true });
    return;
  }

  if (type === MESSAGE.GET_EMAIL) {
    if (sender.id !== chrome.runtime.id) return;
    sendResponse({ type: MESSAGE.EMAIL_TEXT, email: latest, reason: latestReason } satisfies EmailTextMessage);
  }
});
