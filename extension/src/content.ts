import { extractOpenGmailThread } from "./extract.ts";
import { MESSAGE, type EmailTextMessage } from "./messages.ts";

/** What was last sent: the whole extracted email, so a new Gmail flag, sender, link or hidden-text mark is sent too. */
let lastKey = "";
let panelOpen = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Sends the open thread, but only while the side panel is open. Resolves once the background has it. */
function publish(force = false): Promise<void> {
  if (!panelOpen) return Promise.resolve();
  const email = extractOpenGmailThread(document);
  const key = JSON.stringify(email);
  if (!force && key === lastKey) return Promise.resolve();
  lastKey = key;
  const message: EmailTextMessage = email
    ? { type: MESSAGE.EMAIL_TEXT, email }
    : {
        type: MESSAGE.EMAIL_TEXT,
        email: null,
        reason: "This thread could not be read. Open the sample inbox, or wait until a message is open.",
      };
  return chrome.runtime.sendMessage(message).then(
    (reply: { open?: boolean } | undefined) => {
      if (reply?.open === false) {
        panelOpen = false;
        lastKey = "";
      }
    },
    () => {},
  );
}

/** Asks the background, with no email text, whether the panel is open. */
function check(): void {
  chrome.runtime.sendMessage({ type: MESSAGE.READY }).then(
    (reply: { open?: boolean } | undefined) => {
      panelOpen = reply?.open === true;
      if (panelOpen) void publish();
      else lastKey = "";
    },
    () => {},
  );
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  // While the panel is closed, page changes send nothing at all.
  timer = setTimeout(() => void publish(), 250);
}

chrome.runtime.onMessage.addListener((message: { type?: unknown; open?: unknown; reread?: unknown }, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== MESSAGE.PANEL_STATE) return;
  panelOpen = message.open === true;
  lastKey = "";
  // A reread (the user clicked Check) answers only after the fresh read reached the background.
  void publish(message.reread === true).then(() => sendResponse({ done: true }));
  return true;
});

check();
window.addEventListener("hashchange", schedule);
window.addEventListener("popstate", schedule);
const observer = new MutationObserver(schedule);
const root = document.body;
if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
