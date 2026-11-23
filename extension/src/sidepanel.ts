import {
  OrderHistoryParseError,
  canSaveShipmentFromClaim,
  decideVerdict,
  ingestSenderFromClaim,
  ingestShipmentFromClaim,
  parseOrderHistoryFile,
  runLimitedCheck,
  type EmailClaim,
  type LedgerSender,
  type LedgerSnapshot,
  type LimitedCheckResult,
  type Verdict,
} from "@did-i-order-this/core";
import { readClaim } from "../../web/src/ai/readClaim.ts";
import { checkOnDeviceReady } from "./onDeviceCheck.ts";
import { describeAiError } from "../../web/src/ai/aiError.ts";
import { isFirebaseConfigured } from "../../web/src/firebase/app.ts";
import { getOfficialPack } from "../../web/src/packs/official.ts";
import { clearLedger, loadLedger, saveOrder, saveSender, saveShipment } from "./ledger.ts";
import {
  HOSTED_APP_URL,
  MESSAGE,
  PANEL_PORT,
  sanitizeEmail,
  type EmailTextMessage,
  type ExtractedEmail,
} from "./messages.ts";
import { senderCheckForEmail, verdictOptionsForEmail } from "./senderCheck.ts";

type ViewState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; verdict: Verdict; claim: EmailClaim; saved: boolean; canSave: boolean }
  | { status: "limited"; result: LimitedCheckResult }
  | { status: "error"; message: string };

const appRoot = document.getElementById("app");
if (!appRoot) throw new Error("The side panel root is missing.");
const root = appRoot;

let email: ExtractedEmail | null = null;
let emailReason = "Open a Gmail thread. The side panel reads the open thread's expanded messages.";
let ledger: LedgerSnapshot = { orders: [], shipments: [], senders: [] };
let view: ViewState = { status: "idle" };
let importNote = "";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function render(): void {
  root.innerHTML = `
    <h1>Did I Order This?</h1>
    <p class="lede">Check the open Gmail thread on this device. Cloud checks run on the hosted site, not here.</p>
    <div class="actions">
      <label class="btn btn-secondary">
        Import order history
        <input type="file" accept=".csv,.zip,text/csv,application/zip" data-action="import" hidden />
      </label>
      <button type="button" class="btn btn-secondary" data-action="clear">Clear saved orders</button>
    </div>
    ${importNote ? `<p class="note">${escapeHtml(importNote)}</p>` : ""}
    <section class="email">
      ${
        email
          ? `<pre class="email-body">${escapeHtml(email.text)}</pre>`
          : `<p class="note">${escapeHtml(emailReason)} You can also use the sample inbox at <a href="${HOSTED_APP_URL}" target="_blank" rel="noreferrer">${HOSTED_APP_URL}</a>.</p>`
      }
    </section>
    <div class="actions">
      <button type="button" class="btn" data-action="check" ${email ? "" : "disabled"}>Check this email</button>
      <button type="button" class="btn btn-secondary" data-action="limited" ${email ? "" : "disabled"}>Run a limited check (no AI)</button>
    </div>
    ${renderResult()}
  `;

  root.querySelector("[data-action=check]")?.addEventListener("click", () => {
    void runCheck();
  });
  root.querySelector("[data-action=limited]")?.addEventListener("click", runLimited);
  root.querySelector("[data-action=clear]")?.addEventListener("click", () => {
    void (async () => {
      ledger = await clearLedger();
      importNote = "Saved orders were cleared on this device.";
      render();
    })();
  });
  root.querySelector("[data-action=save]")?.addEventListener("click", () => {
    void saveCurrentShipment();
  });
  root.querySelector<HTMLInputElement>("[data-action=import]")?.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) void importFile(file);
  });
}

function renderResult(): string {
  if (view.status === "idle") return "";
  if (view.status === "checking") return `<p class="status">Checking this email on this device</p>`;
  if (view.status === "error") {
    return `<div class="result result-error"><p class="outcome">Error</p><p class="note">${escapeHtml(view.message)}</p></div>`;
  }
  if (view.status === "limited") {
    return `<div class="result result-limited">
      <p class="source-label">${escapeHtml(view.result.inferenceSourceLabel)}</p>
      <h2>${escapeHtml(view.result.headline)}</h2>
      <ul>${view.result.findings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>`;
  }
  const { verdict, claim, canSave, saved } = view;
  return `<div class="result result-${verdict.outcome}">
    <p class="outcome">${escapeHtml(verdict.outcome)}</p>
    <h2>${escapeHtml(verdict.headline)}</h2>
    <p class="source-label">${escapeHtml(verdict.inferenceSourceLabel)}</p>
    <ul>${verdict.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
    <p>Claims to be: ${escapeHtml(claim.claimed_party.name)} (${escapeHtml(claim.claimed_party.role)})</p>
    ${
      canSave && !saved
        ? `<button type="button" class="btn" data-action="save">Save this shipment</button>`
        : ""
    }
    ${saved ? `<p class="note">Saved on this device.</p>` : ""}
  </div>`;
}

function runLimited(): void {
  if (!email) return;
  view = {
    status: "limited",
    result: runLimitedCheck(
      email.text,
      { fromDomain: email.fromDomain, senderVerified: senderCheckForEmail(email) === "verified" },
      ledger,
      getOfficialPack(),
    ),
  };
  render();
}

async function runCheck(): Promise<void> {
  if (!email || view.status === "checking") return;
  const checking = email;
  view = { status: "checking" };
  render();
  if (!isFirebaseConfigured()) {
    view = {
      status: "error",
      message: `On-device AI is not configured in this extension build. Use a limited check, or open the hosted site: ${HOSTED_APP_URL}`,
    };
    render();
    return;
  }
  try {
    // Fail fast (about 2 seconds) when this browser has no on-device model.
    await checkOnDeviceReady();
    // The sender domain is Gmail's own record of the address, not text parsed from the display name.
    const result = await readClaim(checking.text, "only_on_device", { senderDomain: checking.fromDomain });
    // Gmail moved to another email while this one was read: drop the stale result.
    if (email?.text !== checking.text) return;
    const options = verdictOptionsForEmail(checking);
    const verdict = decideVerdict(result.claim, ledger, getOfficialPack(), result.inferenceSource, options);
    view = {
      status: "done",
      verdict,
      claim: result.claim,
      canSave: canSaveShipmentFromClaim(result.claim, ledger, getOfficialPack(), options),
      saved: false,
    };
  } catch (error) {
    if (email?.text !== checking.text) return;
    const detail = `The AI read could not run. ${describeAiError(error)}`;
    view = {
      status: "error",
      message: `${detail} This extension does not send mail to the cloud. Open ${HOSTED_APP_URL} to check in the cloud after you agree, or run a limited check here.`,
    };
  }
  render();
}

async function saveCurrentShipment(): Promise<void> {
  if (view.status !== "done" || !view.canSave || !email) return;
  const shipment = ingestShipmentFromClaim(view.claim, {
    fromDomain: email.fromDomain,
    subject: email.subject,
  });
  if (!shipment) return;
  await saveShipment(shipment);
  const sender = ingestSenderFromClaim(view.claim, {
    fromDomain: email.fromDomain,
    subject: email.subject,
  });
  if (sender) await saveSender(sender);
  ledger = await loadLedger();
  view = { ...view, saved: true };
  render();
}

async function importFile(file: File): Promise<void> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseOrderHistoryFile({ name: file.name, bytes });
    for (const order of parsed.orders) {
      await saveOrder(order);
      const sender: LedgerSender = {
        domain: order.senderDomain,
        displayName: order.merchant,
        role: "merchant",
        firstSeenAt: order.confirmedAt,
        confirmedAt: order.confirmedAt,
      };
      await saveSender(sender);
    }
    for (const shipment of parsed.shipments) await saveShipment(shipment);
    ledger = await loadLedger();
    importNote = `Imported ${parsed.orders.length} orders on this device. The file was not uploaded.`;
  } catch (error) {
    importNote =
      error instanceof OrderHistoryParseError ? error.message : "This file could not be imported. It was not uploaded.";
  }
  render();
}

function applyEmailMessage(message: EmailTextMessage): void {
  email = message.email;
  if (!message.email) {
    emailReason = message.reason ?? emailReason;
  }
  view = { status: "idle" };
  render();
}

/**
 * The tab whose thread the panel shows: the active tab of the panel's window.
 * When the panel page is open as a tab of its own (tests and development),
 * there is no other active tab to ask about, so it shows the latest email.
 */
async function emailRequest(): Promise<{ type: typeof MESSAGE.GET_EMAIL; tabId?: number; latest?: boolean }> {
  const own = await chrome.tabs?.getCurrent?.().catch(() => undefined);
  if (own) return { type: MESSAGE.GET_EMAIL, latest: true };
  const [active] = (await chrome.tabs?.query?.({ active: true, currentWindow: true }).catch(() => [])) ?? [];
  return { type: MESSAGE.GET_EMAIL, tabId: active?.id };
}

async function refreshEmail(): Promise<void> {
  const current = (await chrome.runtime.sendMessage(await emailRequest())) as EmailTextMessage | undefined;
  if (current?.type !== MESSAGE.EMAIL_TEXT) {
    render();
    return;
  }
  const next = sanitizeEmail(current.email);
  // Same thread as before (another tab changed): keep the current result on screen.
  if (next && email && next.text === email.text && next.fixture === email.fixture) return;
  applyEmailMessage({ ...current, email: next });
}

/** Tells the background the panel is open, for as long as this page lives. */
function connectPanel(): void {
  const port = chrome.runtime.connect({ name: PANEL_PORT });
  const ping = setInterval(() => {
    try {
      port.postMessage({ type: "ping" });
    } catch {
      clearInterval(ping);
    }
  }, 20_000);
  port.onMessage.addListener((message: { type?: unknown }) => {
    if (message?.type === MESSAGE.CHANGED) void refreshEmail();
  });
  port.onDisconnect.addListener(() => {
    clearInterval(ping);
    // The service worker restarted: connect again so content scripts keep sending.
    setTimeout(() => {
      connectPanel();
      void refreshEmail();
    }, 500);
  });
}

async function start(): Promise<void> {
  try {
    ledger = await loadLedger();
  } catch {
    ledger = { orders: [], shipments: [], senders: [] };
  }
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      connectPanel();
      await refreshEmail();
      return;
    }
  } catch {
    // Paint the idle panel if the extension APIs are not available.
  }
  render();
}

void start();
