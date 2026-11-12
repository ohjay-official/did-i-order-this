import {
  OrderHistoryParseError,
  decideVerdict,
  ingestSenderFromClaim,
  ingestShipmentFromClaim,
  parseOrderHistoryFile,
  runLimitedCheck,
  type EmailClaim,
  type InferenceSourceValue,
  type LedgerSender,
  type LedgerSnapshot,
  type LimitedCheckResult,
  type Verdict,
} from "@did-i-order-this/core";
import { readClaim } from "../ai/readClaim.ts";
import { chooseInferenceMode } from "../consent.ts";
import { formatEmailText, sampleThreads, type SampleThread } from "../demo/seed.ts";
import { isCloudAiAvailable, isFirebaseConfigured } from "../firebase/app.ts";
import { loadLedger, resetToDemoSeed, saveOrder, saveSender, saveShipment } from "../ledger/store.ts";
import { getOfficialPack } from "../packs/official.ts";

type CheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "consent" }
  | {
      status: "done";
      verdict: Verdict;
      claim: EmailClaim;
      usedSampleClaim: boolean;
      canSaveShipment: boolean;
      saved: boolean;
    }
  | { status: "limited"; result: LimitedCheckResult }
  | { status: "error"; message: string; canLimited: boolean };

export class InboxApp {
  private root: HTMLElement;
  private threads = sampleThreads;
  private selectedId = this.threads[0]?.id ?? "";
  private ledger: LedgerSnapshot = { orders: [], shipments: [], senders: [] };
  private check: CheckState = { status: "idle" };
  private note = "";
  private importNote = "";

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async start(): Promise<void> {
    this.ledger = await loadLedger();
    this.render();
  }

  private selected(): SampleThread | undefined {
    return this.threads.find((thread) => thread.id === this.selectedId);
  }

  private render(): void {
    const thread = this.selected();
    this.root.innerHTML = `
      <header class="site-header">
        <div>
          <p class="kicker">Sample inbox</p>
          <h1>Did I Order This?</h1>
          <p class="lede">Check a delivery or billing email against the orders and tracking numbers stored on this device.</p>
        </div>
        <div class="header-actions">
          <label class="btn btn-secondary file-label">
            Import order history
            <input type="file" accept=".csv,.zip,text/csv,application/zip" data-action="import" hidden />
          </label>
          <button type="button" class="btn btn-secondary" data-action="reset">Reset demo ledger</button>
        </div>
      </header>
      ${this.importNote ? `<p class="note import-note">${escapeHtml(this.importNote)}</p>` : ""}
      <div class="workspace">
        <aside class="thread-list" aria-label="Sample threads">
          ${this.threads
            .map((item) => {
              const current = item.id === this.selectedId ? "is-current" : "";
              return `<button type="button" class="thread-item ${current}" data-thread="${item.id}">
                <span class="thread-from">${escapeHtml(item.fromName)}</span>
                <span class="thread-subject">${escapeHtml(item.subject)}</span>
                <span class="thread-date">${escapeHtml(item.date)}</span>
              </button>`;
            })
            .join("")}
        </aside>
        <section class="thread-pane">
          ${thread ? this.renderThread(thread) : "<p>Select a thread.</p>"}
        </section>
      </div>
      ${this.check.status === "consent" ? this.renderConsent() : ""}
    `;

    this.root.querySelector("[data-action=reset]")?.addEventListener("click", () => {
      void this.resetLedger();
    });
    this.root.querySelector<HTMLInputElement>("[data-action=import]")?.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (file) void this.importFile(file);
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-thread]")) {
      button.addEventListener("click", () => {
        this.selectedId = button.dataset.thread ?? "";
        this.check = { status: "idle" };
        this.note = "";
        this.render();
      });
    }
    this.root.querySelector("[data-action=check]")?.addEventListener("click", () => {
      void this.runCheck();
    });
    this.root.querySelector("[data-action=save]")?.addEventListener("click", () => {
      void this.saveShipment();
    });
    this.root.querySelector("[data-action=limited]")?.addEventListener("click", () => {
      this.runLimited();
    });
    this.root.querySelector("[data-action=consent-yes]")?.addEventListener("click", () => {
      this.consentResolver?.(true);
    });
    this.root.querySelector("[data-action=consent-no]")?.addEventListener("click", () => {
      this.consentResolver?.(false);
    });
  }

  private renderThread(thread: SampleThread): string {
    return `
      <article class="email">
        <header class="email-header">
          <p><strong>From</strong> ${escapeHtml(thread.fromName)} &lt;${escapeHtml(thread.fromEmail)}&gt;</p>
          <p><strong>Subject</strong> ${escapeHtml(thread.subject)}</p>
          <p><strong>Date</strong> ${escapeHtml(thread.date)}</p>
        </header>
        <pre class="email-body">${escapeHtml(thread.body)}</pre>
        <div class="actions">
          <button type="button" class="btn btn-primary" data-action="check">Check this email</button>
        </div>
      </article>
      ${this.renderResult()}
    `;
  }

  private renderResult(): string {
    if (this.check.status === "idle") {
      return this.note ? `<p class="note">${escapeHtml(this.note)}</p>` : "";
    }
    if (this.check.status === "checking") {
      return `<p class="note">Checking this email.</p>`;
    }
    if (this.check.status === "consent") {
      return "";
    }
    if (this.check.status === "error") {
      return `<div class="result">
        <p class="note">${escapeHtml(this.check.message)}</p>
        ${
          this.check.canLimited
            ? `<div class="actions"><button type="button" class="btn btn-secondary" data-action="limited">Run a limited check (no AI)</button></div>`
            : ""
        }
      </div>`;
    }
    if (this.check.status === "limited") {
      const { result } = this.check;
      return `
        <div class="result result-limited">
          <p class="source-label">${escapeHtml(result.inferenceSourceLabel)}</p>
          <h2 class="headline">${escapeHtml(result.headline)}</h2>
          <ul class="reasons">
            ${result.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    const { verdict, claim, usedSampleClaim, canSaveShipment, saved } = this.check;
    const claimLines = [
      `Claims to be: ${claim.claimed_party.name} (${claim.claimed_party.role})`,
      claim.claimed_party.domain ? `Claimed domain: ${claim.claimed_party.domain}` : "",
      `Asks you to: ${claim.asked_action}`,
      `Cited numbers: ${
        claim.cited_numbers.length
          ? claim.cited_numbers.map((item) => `${item.kind} ${item.value}`).join(", ")
          : "none"
      }`,
      `Email kind: ${claim.email_kind}`,
    ].filter(Boolean);

    return `
      <div class="result result-${verdict.outcome}">
        <p class="outcome">${escapeHtml(verdict.outcome)}</p>
        <h2 class="headline">${escapeHtml(verdict.headline)}</h2>
        <p class="source-label">${escapeHtml(verdict.inferenceSourceLabel)}</p>
        ${
          usedSampleClaim
            ? `<p class="note">On-device AI did not run in this browser. This ledger check used the structured claim prepared for this sample thread.</p>`
            : ""
        }
        <ul class="reasons">
          ${verdict.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
        <div class="claim-box">
          <h3>Claim that was checked</h3>
          ${claimLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
        </div>
        ${
          canSaveShipment && !saved
            ? `<div class="confirm-card">
                <p>Save this shipment to the ledger on this device?</p>
                <button type="button" class="btn btn-primary" data-action="save">Save to your ledger</button>
              </div>`
            : ""
        }
        ${saved ? `<p class="note">Saved to your ledger.</p>` : ""}
      </div>
    `;
  }

  private renderConsent(): string {
    return `
      <div class="consent-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <div class="consent-card">
          <h2 id="consent-title">Check this email in the cloud?</h2>
          <p>No on-device AI is available. Checking in the cloud would send this email off the device.</p>
          <div class="actions">
            <button type="button" class="btn btn-primary" data-action="consent-yes">Check in the cloud</button>
            <button type="button" class="btn btn-secondary" data-action="consent-no">Do not send</button>
          </div>
        </div>
      </div>
    `;
  }

  private consentResolver: ((value: boolean) => void) | null = null;

  private askForCloudConsent(): Promise<boolean> {
    this.check = { status: "consent" };
    this.render();
    return new Promise((resolve) => {
      this.consentResolver = (value) => {
        this.consentResolver = null;
        resolve(value);
      };
    });
  }

  private async resetLedger(): Promise<void> {
    this.ledger = await resetToDemoSeed();
    this.check = { status: "idle" };
    this.note = "Demo ledger reset. There are no expected parcels.";
    this.importNote = "";
    this.render();
  }

  private async importFile(file: File): Promise<void> {
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
      this.ledger = await loadLedger();
      const shipmentText =
        parsed.shipments.length === 1 ? "1 shipment" : `${parsed.shipments.length} shipments`;
      this.importNote = `Imported ${parsed.orders.length} orders and ${shipmentText} on this device. The file was not uploaded.`;
    } catch (error) {
      const message =
        error instanceof OrderHistoryParseError
          ? error.message
          : "This file could not be imported. It was not uploaded.";
      this.importNote = message;
    }
    this.render();
  }

  private runLimited(): void {
    const thread = this.selected();
    if (!thread) return;
    const result = runLimitedCheck(
      formatEmailText(thread),
      { fromDomain: thread.fromDomain },
      this.ledger,
      getOfficialPack(),
    );
    this.check = { status: "limited", result };
    this.render();
  }

  private finishWithSampleClaim(thread: SampleThread): void {
    const claim = thread.expectedClaim;
    const verdict = decideVerdict(claim, this.ledger, getOfficialPack(), undefined);
    const shipment = ingestShipmentFromClaim(claim, {
      fromDomain: thread.fromDomain,
      subject: thread.subject,
    });
    this.check = {
      status: "done",
      verdict,
      claim,
      usedSampleClaim: true,
      canSaveShipment: shipment !== null,
      saved: false,
    };
    this.render();
  }

  private finishWithClaim(thread: SampleThread, claim: EmailClaim, inferenceSource?: InferenceSourceValue): void {
    const verdict = decideVerdict(claim, this.ledger, getOfficialPack(), inferenceSource);
    const shipment = ingestShipmentFromClaim(claim, {
      fromDomain: thread.fromDomain,
      subject: thread.subject,
    });
    this.check = {
      status: "done",
      verdict,
      claim,
      usedSampleClaim: false,
      canSaveShipment: shipment !== null,
      saved: false,
    };
    this.render();
  }

  private async runCheck(): Promise<void> {
    const thread = this.selected();
    if (!thread) return;
    this.check = { status: "checking" };
    this.note = "";
    this.render();

    const emailText = formatEmailText(thread);

    if (!isFirebaseConfigured()) {
      this.finishWithSampleClaim(thread);
      return;
    }

    try {
      const first = await readClaim(emailText, "only_on_device");
      this.finishWithClaim(thread, first.claim, first.inferenceSource);
      return;
    } catch {
      // Continue to cloud consent or the no-key fallback.
    }

    if (!isCloudAiAvailable()) {
      this.finishWithSampleClaim(thread);
      return;
    }

    const mode = await chooseInferenceMode(false, () => this.askForCloudConsent());
    if (mode === "cancelled") {
      this.check = {
        status: "error",
        message: "The AI read could not run. The email was not sent to the cloud.",
        canLimited: true,
      };
      this.render();
      return;
    }

    try {
      const second = await readClaim(emailText, mode);
      this.finishWithClaim(thread, second.claim, second.inferenceSource);
    } catch (cloudError) {
      const cloudMessage = cloudError instanceof Error ? cloudError.message : "Cloud check failed.";
      this.check = {
        status: "error",
        message: `The AI read could not run. ${cloudMessage}`,
        canLimited: true,
      };
      this.render();
    }
  }

  private async saveShipment(): Promise<void> {
    if (this.check.status !== "done") return;
    const thread = this.selected();
    if (!thread) return;
    const shipment = ingestShipmentFromClaim(this.check.claim, {
      fromDomain: thread.fromDomain,
      subject: thread.subject,
    });
    if (!shipment) return;
    await saveShipment(shipment);
    const sender = ingestSenderFromClaim(this.check.claim, {
      fromDomain: thread.fromDomain,
      subject: thread.subject,
    });
    if (sender) await saveSender(sender);
    this.ledger = await loadLedger();
    this.check = { ...this.check, saved: true };
    this.render();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
