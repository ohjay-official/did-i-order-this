import { extractOpenGmailThread } from "./extract.ts";
import { MESSAGE, type EmailTextMessage } from "./messages.ts";

let lastText = "";
let timer: ReturnType<typeof setTimeout> | undefined;

function publish(): void {
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
  void chrome.runtime.sendMessage(message);
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(publish, 250);
}

publish();
window.addEventListener("hashchange", schedule);
window.addEventListener("popstate", schedule);
const observer = new MutationObserver(schedule);
const root = document.body;
if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
