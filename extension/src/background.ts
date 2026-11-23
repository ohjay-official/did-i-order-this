import {
  GMAIL_PREFIX,
  MESSAGE,
  PANEL_PORT,
  isTrustedSender,
  manifestPrefixes,
  sanitizeEmail,
  type EmailTextMessage,
  type ExtractedEmail,
  type GetEmailMessage,
} from "./messages.ts";

/**
 * One entry per tab, and only while the side panel is open. Content scripts
 * send email text only when told the panel is open; when the last panel
 * closes, every stored email is dropped.
 */
type Entry = { email: ExtractedEmail | null; reason?: string; at: number; tabId: number };
const entries = new Map<number, Entry>();
const contentTabs = new Set<number>();
const panels = new Set<chrome.runtime.Port>();
let clock = 0;

function panelOpen(): boolean {
  return panels.size > 0;
}

function tellContent(open: boolean): void {
  for (const tabId of contentTabs) {
    chrome.tabs.sendMessage(tabId, { type: MESSAGE.PANEL_STATE, open }).catch(() => contentTabs.delete(tabId));
  }
}

function tellPanels(tabId?: number): void {
  for (const port of panels) {
    try {
      port.postMessage({ type: MESSAGE.CHANGED, tabId });
    } catch {
      panels.delete(port);
    }
  }
}

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PANEL_PORT || port.sender?.id !== chrome.runtime.id) return;
  panels.add(port);
  if (panels.size === 1) tellContent(true);
  port.onMessage.addListener(() => {
    // Keep-alive pings from the panel; nothing to do.
  });
  port.onDisconnect.addListener(() => {
    panels.delete(port);
    if (!panelOpen()) {
      entries.clear();
      tellContent(false);
    }
  });
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  entries.delete(tabId);
  contentTabs.delete(tabId);
});
chrome.tabs?.onActivated?.addListener((info) => tellPanels(info.tabId));

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return;
  const type = (message as { type?: unknown }).type;

  if (type === MESSAGE.READY || type === MESSAGE.EMAIL_TEXT) {
    // Only this extension's content script on a declared page may report.
    if (!isTrustedSender(sender, chrome.runtime.id, manifestPrefixes()) || sender.tab?.id === undefined) {
      sendResponse({ ok: false });
      return;
    }
    const tabId = sender.tab.id;
    contentTabs.add(tabId);
    if (type === MESSAGE.READY) {
      sendResponse({ open: panelOpen() });
      return;
    }
    if (!panelOpen()) {
      // No panel to show it: do not keep email text.
      sendResponse({ ok: false, open: false });
      return;
    }
    const incoming = message as Partial<EmailTextMessage>;
    const email = sanitizeEmail(incoming.email);
    if (email) {
      // The page decides nothing here: only Gmail itself is not a fixture.
      const url = sender.tab?.url ?? sender.url ?? "";
      if (url.startsWith(GMAIL_PREFIX)) delete email.fixture;
      else email.fixture = true;
    }
    entries.set(tabId, {
      email,
      reason: typeof incoming.reason === "string" ? incoming.reason.slice(0, 300) : undefined,
      at: ++clock,
      tabId,
    });
    tellPanels(tabId);
    sendResponse({ ok: true });
    return;
  }

  if (type === MESSAGE.GET_EMAIL) {
    if (sender.id !== chrome.runtime.id) return;
    const request = message as GetEmailMessage;
    const pick = (): Entry | undefined => {
      let entry: Entry | undefined;
      if (typeof request.tabId === "number") entry = entries.get(request.tabId);
      if (!entry && request.latest) entry = [...entries.values()].sort((a, b) => b.at - a.at)[0];
      return entry;
    };
    const answer = (entry: Entry | undefined) =>
      sendResponse({ type: MESSAGE.EMAIL_TEXT, email: entry?.email ?? null, reason: entry?.reason } satisfies EmailTextMessage);
    const tabId = typeof request.tabId === "number" ? request.tabId : pick()?.tabId;
    if (request.fresh && typeof tabId === "number" && panelOpen()) {
      // The user clicked Check: have the page read the thread again right now,
      // so a Gmail flag or banner that appeared since the last read counts.
      const reread = chrome.tabs.sendMessage(tabId, { type: MESSAGE.PANEL_STATE, open: true, reread: true });
      const timeout = new Promise((resolve) => setTimeout(resolve, 1500));
      void Promise.race([reread, timeout])
        .catch(() => {})
        .then(() => answer(entries.get(tabId) ?? pick()));
      return true;
    }
    const entry = pick();
    if (!entry && typeof request.tabId === "number" && panelOpen()) {
      // Ask that tab's content script to send its thread now.
      chrome.tabs.sendMessage(request.tabId, { type: MESSAGE.PANEL_STATE, open: true }).catch(() => {});
    }
    answer(entry);
  }
});
