import { MESSAGE, type EmailTextMessage, type ExtractedEmail } from "./messages.ts";

let latest: ExtractedEmail | null = null;
let latestReason: string | undefined;

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onMessage.addListener((message: EmailTextMessage | { type: string }, _sender, sendResponse) => {
  if (message.type === MESSAGE.EMAIL_TEXT && "email" in message) {
    latest = message.email;
    latestReason = message.reason;
    sendResponse({ ok: true });
    return;
  }
  if (message.type === MESSAGE.GET_EMAIL) {
    sendResponse({ type: MESSAGE.EMAIL_TEXT, email: latest, reason: latestReason } satisfies EmailTextMessage);
  }
});
