import { extractOpenGmailThread } from "./extract.ts";
import { MESSAGE, type EmailTextMessage } from "./messages.ts";

let lastText = "";
let panelOpen = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Sends the open thread, but only while the side panel is open. */
function publish(): void {
  if (!panelOpen) return;
  const email = extractOpenGmailThread(document);
  const text = email?.text ?? "";
  if (text === lastText) return;
  lastText = text;
  const message: EmailTextMessage = email
    ? { type: MESSAGE.EMAIL_TEXT, email }
    : {
        type: MESSAGE.EMAIL_TEXT,
        email: null,
        reason: "This thread could not be read. Open the sample inbox, or wait until a message is open.",
      };
  chrome.runtime.sendMessage(message).then(
    (reply: { open?: boolean } | undefined) => {
      if (reply?.open === false) {
        panelOpen = false;
        lastText = "";
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
      if (panelOpen) publish();
      else lastText = "";
    },
    () => {},
  );
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  // While the panel is closed, page changes send nothing at all.
  timer = setTimeout(publish, 250);
}

chrome.runtime.onMessage.addListener((message: { type?: unknown; open?: unknown }, sender) => {
  if (sender.id !== chrome.runtime.id || message?.type !== MESSAGE.PANEL_STATE) return;
  panelOpen = message.open === true;
  lastText = "";
  publish();
});

check();
window.addEventListener("hashchange", schedule);
window.addEventListener("popstate", schedule);
const observer = new MutationObserver(schedule);
const root = document.body;
if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
