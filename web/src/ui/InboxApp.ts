import {
  OrderHistoryParseError,
  canSaveShipmentFromClaim,
  decideVerdict,
  ingestSenderFromClaim,
  ingestShipmentFromClaim,
  parseOrderHistoryFile,
  runLimitedCheck,
  senderDomainFromHeader,
  type EmailClaim,
  type InferenceSourceValue,
  type LedgerSender,
  type LedgerSnapshot,
  type LimitedCheckResult,
  type Verdict,
} from "@did-i-order-this/core";
import { readClaim } from "../ai/readClaim.ts";
import { cloudConsentMemory } from "../ai/consentMemory.ts";
import { formatEmailText, sampleThreads, type SampleThread } from "../demo/seed.ts";
import {
  SHIPMENT_NEXT_THREAD_ID,
  hasMatchingShipmentDemo,
  loadMatchingShipmentDemo,
  matchingShipmentDemo,
} from "../demo/shipmentDemo.ts";
import { NOT_CHECKED_HEADLINE, SAMPLE_NOTE, runCheckFlow } from "./checkFlow.ts";
import { appCheckGate } from "../ai/appCheckGate.ts";
import { isNextStepReason, suggestNextStep } from "../ai/nextStep.ts";
import { isCloudAiAvailable, isFirebaseConfigured } from "../firebase/app.ts";
import { ledgerForCheck, loadLedger, resetToDemoSeed, saveOrder, saveSender, saveShipment } from "../ledger/store.ts";
import { importNoteText } from "../ledger/importNote.ts";
import { getOfficialPack } from "../packs/official.ts";
import { wireModalKeys } from "./dialogKeys.ts";
import { CONSENT_DIALOG_HTML } from "./consentDialog.ts";

type CheckState =
  | { status: "idle" }
  | { status: "checking"; where: "device" | "cloud" }
  | { status: "consent" }
  | {
      status: "done";
      verdict: Verdict;
      claim: EmailClaim;
      usedSampleClaim: boolean;
      fallbackDetail: string;
      cloudConsentRemembered: boolean;
      canSaveShipment: boolean;
      saved: boolean;
      /** Which email this verdict belongs to, so it is never shown or saved under another. */
      emailKey: string;
    }
  | { status: "limited"; result: LimitedCheckResult }
  | { status: "not_sent"; message: string }
  | { status: "error"; message: string; canLimited: boolean };

export class InboxApp {
  private static initialThread(threads: SampleThread[]): string {
    const wanted = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("thread");
    const hit = threads.find((thread) => thread.id === wanted);
    return hit?.id ?? threads[0]?.id ?? "";
  }

  private root: HTMLElement;
  private threads = sampleThreads;
  private selectedId = InboxApp.initialThread(this.threads);
  private pasteText = "";
  private mode: "thread" | "paste" = "thread";
  private ledger: LedgerSnapshot = { orders: [], shipments: [], senders: [] };
  private check: CheckState = { status: "idle" };
  private note = "";
  private importNote = "";
  /** Bumped on every check and every switch of email; a result from an older check is dropped. */
  private checkSeq = 0;

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

  private expectedCount(): number {
    return this.ledger.shipments.filter((item) => item.expected).length;
  }

  private currentEmail(): { text: string; fromDomain: string; subject: string; sample?: SampleThread } | null {
    if (this.mode === "paste") {
      const text = this.pasteText.trim();
      if (!text) return null;
      const sample = sampleThreads.find((thread) => formatEmailText(thread).trim() === text);
      return {
        text,
        fromDomain: sample?.fromDomain ?? senderDomainFromHeader(text),
        subject: sample?.subject ?? (text.match(/^Subject:\s*(.+)$/im)?.[1] ?? "Pasted email"),
        sample,
      };
    }
    const thread = this.selected();
    if (!thread) return null;
    return {
      text: formatEmailText(thread),
      fromDomain: thread.fromDomain,
      subject: thread.subject,
      sample: thread,
    };
  }

  private emailKey(email: { text: string } | null): string {
    return email ? `${this.mode}:${this.mode === "thread" ? this.selectedId : ""}:${email.text}` : "";
  }

  private isBusy(): boolean {
    return this.check.status === "checking" || this.check.status === "consent";
  }

  private render(): void {
    const thread = this.selected();
    const expected = this.expectedCount();
    const expectedLabel = expected === 1 ? "1 expected parcel" : `${expected} expected parcels`;
    const orderLabel = this.ledger.orders.length === 1 ? "1 order" : `${this.ledger.orders.length} orders`;

    this.root.innerHTML = `
      <p class="demo-bar" role="note"><span class="demo-bar-tag">Sample data</span><span class="demo-bar-text">The five emails, the demo order and any demo parcel are fictional. Nothing here is your real mail. Fictional samples; not affiliated with DHL or UPS.</span></p>
      <header class="app-header">
        <div>
          <p class="eyebrow">Sample inbox</p>
          <h1>Check an email against what you ordered</h1>
          <p class="lede">Compare a delivery or billing email with the orders and tracking numbers stored on this device.</p>
        </div>
        <div class="app-tools">
          <p class="app-ledger">${escapeHtml(orderLabel)} and ${escapeHtml(expectedLabel)} are stored on this device.</p>
          <div class="header-actions">
            <label class="btn btn-secondary file-label">
              Import order history
              <input type="file" accept=".csv,.zip,text/csv,application/zip" data-action="import" hidden />
            </label>
            <button type="button" class="btn btn-secondary" data-action="reset">Reset demo data</button>
          </div>
        </div>
      </header>
      ${this.importNote ? `<p class="note import-note">${escapeHtml(this.importNote)}</p>` : ""}
      <div class="workspace">
        <aside class="thread-list" aria-label="Sample threads">
          ${this.threads
            .map((item) => {
              const current = this.mode === "thread" && item.id === this.selectedId ? "is-current" : "";
              return `<button type="button" class="thread-item ${current}" data-thread="${item.id}">
                <span class="thread-from">${escapeHtml(item.fromName)}</span>
                <span class="thread-subject">${escapeHtml(item.subject)}</span>
                <span class="thread-date">${escapeHtml(item.date)}</span>
              </button>`;
            })
            .join("")}
          <form class="paste-card ${this.mode === "paste" ? "is-current" : ""}" data-paste-form>
            <h2>Paste an email</h2>
            <label class="visually-hidden" for="app-paste">Paste the email you want to check</label>
            <textarea id="app-paste" data-paste rows="5" placeholder="Paste the email">${escapeHtml(this.pasteText)}</textarea>
            <button type="submit" class="btn" data-action="check-paste"${this.isBusy() ? " disabled" : ""}>Check pasted email</button>
          </form>
        </aside>
        <section class="thread-pane">
          ${this.mode === "paste" ? this.renderPastePane() : thread ? this.renderThread(thread) : "<p class=\"empty-state\">Select a sample email, or paste one.</p>"}
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
        this.mode = "thread";
        this.checkSeq += 1;
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
      this.revealResult();
    });
    this.root.querySelector("[data-action=load-shipment-demo]")?.addEventListener("click", () => {
      void this.loadShipmentDemo();
    });
    this.root.querySelector("[data-action=forget-cloud-consent]")?.addEventListener("click", () => {
      cloudConsentMemory.forget();
      if (this.check.status === "done") this.check = { ...this.check, cloudConsentRemembered: false };
      this.render();
    });
    this.root.querySelector("[data-action=consent-yes]")?.addEventListener("click", () => {
      this.consentResolver?.(true);
    });
    this.root.querySelector("[data-action=consent-no]")?.addEventListener("click", () => {
      this.consentResolver?.(false);
    });
    const consentOverlay = this.root.querySelector<HTMLElement>(".consent-overlay");
    if (consentOverlay) wireModalKeys(consentOverlay, () => this.consentResolver?.(false), "[data-action=consent-no]");
    const pasteForm = this.root.querySelector<HTMLFormElement>("[data-paste-form]");
    const pasteInput = this.root.querySelector<HTMLTextAreaElement>("[data-paste]");
    pasteInput?.addEventListener("input", () => {
      this.pasteText = pasteInput.value;
    });
    pasteForm?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (this.isBusy()) return;
      this.pasteText = pasteInput?.value ?? this.pasteText;
      this.mode = "paste";
      this.checkSeq += 1;
      void this.runCheck();
    });
  }

  private renderPastePane(): string {
    const text = this.pasteText.trim();
    if (!text && this.check.status === "idle") {
      return `<p class="empty-state">Paste an email on the left, then check it against the orders stored on this device.</p>${this.renderResult()}`;
    }
    return `
      <article class="email">
        <header class="email-header">
          <p><strong>Pasted email</strong></p>
        </header>
        <pre class="email-body" tabindex="0">${escapeHtml(text)}</pre>
      </article>
      ${this.renderResult()}
    `;
  }

  private renderThread(thread: SampleThread): string {
    return `
      <article class="email">
        <header class="email-header">
          <p><strong>From</strong> ${escapeHtml(thread.fromName)} &lt;${escapeHtml(thread.fromEmail)}&gt;</p>
          <p><strong>Subject</strong> ${escapeHtml(thread.subject)}</p>
          <p><strong>Date</strong> ${escapeHtml(thread.date)}</p>
        </header>
        <pre class="email-body" tabindex="0">${escapeHtml(thread.body)}</pre>
        <div class="actions">
          <button type="button" class="btn btn-primary" data-action="check"${this.isBusy() ? " disabled" : ""}>Check this email</button>
        </div>
      </article>
      ${this.renderResult()}
    `;
  }

  private renderResult(): string {
    if (this.check.status === "idle") {
      if (this.note) return `<p class="note pane-note" role="status">${escapeHtml(this.note)}</p>`;
      if (this.mode === "thread") {
        return `<p class="empty-state">Check this email to compare it with the orders stored on this device.</p>`;
      }
      return "";
    }
    if (this.check.status === "checking") {
      const where = this.check.where === "cloud" ? "in the cloud" : "on this device";
      return `<div class="result is-checking" aria-busy="true"><p class="status is-loading">Checking this email ${where}</p></div>`;
    }
    if (this.check.status === "consent") {
      return "";
    }
    if (this.check.status === "not_sent") {
      return `<div class="result result-error" data-not-sent>
        <p class="outcome">Not sent</p>
        <h2 class="headline">${escapeHtml(NOT_CHECKED_HEADLINE)}</h2>
        <p class="note">${escapeHtml(this.check.message)}</p>
        <div class="actions"><button type="button" class="btn btn-secondary" data-action="limited">Run a limited check (no AI)</button></div>
      </div>`;
    }
    if (this.check.status === "error") {
      return `<div class="result result-error">
        <p class="outcome">Error</p>
        <h2 class="headline">The check could not finish</h2>
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
          <p class="outcome">limited</p>
          <h2 class="headline">${escapeHtml(result.headline)}</h2>
          <p class="source-label">${escapeHtml(result.inferenceSourceLabel)}</p>
          <ul class="reasons">
            ${result.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("")}
          </ul>
        </div>
        ${this.renderShipmentDemo()}
      `;
    }

    const { verdict, claim, usedSampleClaim, fallbackDetail, cloudConsentRemembered, canSaveShipment, saved } =
      this.check;
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
        ${
          // Same as the homepage fallback: a prepared claim gets the note, not a source stamp.
          usedSampleClaim ? "" : `<p class="source-label">${escapeHtml(verdict.inferenceSourceLabel)}</p>`
        }
        ${
          usedSampleClaim
            ? `<p class="note sample-note">${escapeHtml(SAMPLE_NOTE)}</p>`
            : ""
        }
        ${fallbackDetail ? `<p class="note fallback-detail" data-fallback-detail>${escapeHtml(fallbackDetail)}</p>` : ""}
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
                <p>Save this shipment to the orders stored on this device?</p>
                <button type="button" class="btn btn-primary" data-action="save">Save this shipment</button>
              </div>`
            : ""
        }
        ${saved ? `<p class="note">Saved on this device.</p>` : ""}
        ${
          cloudConsentRemembered
            ? `<div class="consent-remembered" data-consent-remembered>
                <p class="note">Your yes to cloud checks is remembered for sample emails until you close this tab.</p>
                <button type="button" class="btn btn-secondary" data-action="forget-cloud-consent">Ask me each time</button>
              </div>`
            : ""
        }
      </div>
      ${this.renderShipmentDemo()}
    `;
  }

  /** One-tap next step after the first verdict, while no parcel is expected. Claude styles the card. */
  private renderShipmentDemo(): string {
    if (this.mode !== "thread") return "";
    if (this.expectedCount() > 0 || hasMatchingShipmentDemo(this.ledger)) return "";
    return `<div class="demo-next" data-demo-next>
        <p>Next, see a match. This stores the UPS parcel from the Northwind sample email as an expected parcel on this device. It is demo data, and Reset demo data removes it.</p>
        <button type="button" class="btn btn-secondary" data-action="load-shipment-demo">Load the matching shipment demo</button>
      </div>`;
  }

  private async loadShipmentDemo(): Promise<void> {
    await loadMatchingShipmentDemo({ shipment: saveShipment, sender: saveSender });
    this.ledger = await loadLedger();
    this.mode = "thread";
    this.selectedId = SHIPMENT_NEXT_THREAD_ID;
    this.check = { status: "idle" };
    const { shipment } = matchingShipmentDemo();
    this.note = `Matching shipment demo loaded. ${shipment.carrier ?? "UPS"} ${shipment.trackingNumber} is now an expected parcel on this device (demo data). Check this UPS email next.`;
    this.render();
  }

  private renderConsent(): string {
    return CONSENT_DIALOG_HTML;
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
    this.checkSeq += 1;
    this.check = { status: "idle" };
    const expected = this.expectedCount();
    this.note =
      expected === 0
        ? "Demo data reset. There are no expected parcels."
        : `Demo data reset. Your imported orders and parcels were kept (${expected === 1 ? "1 expected parcel" : `${expected} expected parcels`}).`;
    this.importNote = "";
    this.render();
  }

  private async importFile(file: File): Promise<void> {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parseOrderHistoryFile({ name: file.name, bytes });
      let newOrders = 0;
      let newShipments = 0;
      for (const order of parsed.orders) {
        if (await saveOrder(order)) newOrders += 1;
        const sender: LedgerSender = {
          domain: order.senderDomain,
          displayName: order.merchant,
          role: "merchant",
          firstSeenAt: order.confirmedAt,
          confirmedAt: order.confirmedAt,
        };
        await saveSender(sender);
      }
      for (const shipment of parsed.shipments) {
        if (await saveShipment(shipment)) newShipments += 1;
      }
      this.ledger = await loadLedger();
      this.importNote = importNoteText(newOrders, newShipments, parsed.orders.length + parsed.shipments.length);
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
    const current = this.currentEmail();
    if (!current) return;
    const result = runLimitedCheck(
      current.text,
      { fromDomain: current.fromDomain },
      ledgerForCheck(this.ledger, Boolean(current.sample)),
      getOfficialPack(),
    );
    this.check = { status: "limited", result };
    this.render();
  }

  private finishWithSampleClaim(thread: SampleThread, emailKey: string, fallbackDetail = ""): void {
    const claim = thread.expectedClaim;
    const ledger = ledgerForCheck(this.ledger, true);
    const verdict = decideVerdict(claim, ledger, getOfficialPack(), undefined, { emailText: formatEmailText(thread) });
    this.check = {
      status: "done",
      verdict,
      claim,
      usedSampleClaim: true,
      fallbackDetail,
      cloudConsentRemembered: false,
      canSaveShipment: canSaveShipmentFromClaim(claim, ledger, getOfficialPack(), { emailText: formatEmailText(thread) }),
      saved: false,
      emailKey,
    };
    this.render();
  }

  private finishWithClaim(
    email: { text: string; fromDomain?: string; sample?: SampleThread },
    emailKey: string,
    claim: EmailClaim,
    inferenceSource?: InferenceSourceValue,
    cloudConsentRemembered = false,
  ): void {
    // Demo rows count only for the fictional sample emails, never for someone's own mail.
    const ledger = ledgerForCheck(this.ledger, Boolean(email.sample));
    const verdict = decideVerdict(claim, ledger, getOfficialPack(), inferenceSource, { emailText: email.text });
    this.check = {
      status: "done",
      verdict,
      claim,
      usedSampleClaim: false,
      fallbackDetail: "",
      cloudConsentRemembered,
      canSaveShipment: canSaveShipmentFromClaim(claim, ledger, getOfficialPack(), { emailText: email.text }),
      saved: false,
      emailKey,
    };
    this.render();
    const seq = this.checkSeq;
    const senderDomain = email.fromDomain ?? senderDomainFromHeader(email.text);
    void this.attachNextStep(emailKey, seq, senderDomain);
  }

  /**
   * After the verdict is already on screen, try a non-blocking next-step tip.
   * Failures leave the verdict as it is.
   */
  private async attachNextStep(emailKey: string, seq: number, senderDomain?: string): Promise<void> {
    if (this.check.status !== "done" || this.check.usedSampleClaim) return;
    const { claim, verdict } = this.check;
    const line = await suggestNextStep({
      claim,
      verdict,
      pack: getOfficialPack(),
      senderDomain,
    });
    if (!line) return;
    if (seq !== this.checkSeq) return;
    if (this.check.status !== "done" || this.check.emailKey !== emailKey) return;
    if (this.check.verdict.reasons.some(isNextStepReason)) return;
    this.check = {
      ...this.check,
      verdict: { ...this.check.verdict, reasons: [...this.check.verdict.reasons, line] },
    };
    this.render();
  }

  // After a check the verdict often renders below the fold on a phone; bring it into
  // view, landing under the sticky header (scroll-margin-top in styles-v7.css).
  private revealResult(): void {
    window.requestAnimationFrame(() => {
      const result = this.root.querySelector<HTMLElement>(".result");
      if (!result) return;
      const card = result.getBoundingClientRect();
      const head = (result.querySelector<HTMLElement>(".headline") ?? result).getBoundingClientRect();
      const cover = parseFloat(getComputedStyle(result).scrollMarginTop) || 0;
      // Leave the page alone when the whole card already fits, or when the headline sits
      // in the upper part of the screen with room for the reasons under it. A headline
      // that is merely visible near the bottom edge (y=754 of 800 on a laptop) still scrolls.
      const fits = card.top >= cover && card.bottom <= window.innerHeight;
      const headHigh = head.top >= cover && head.top <= cover + (window.innerHeight - cover) * 0.4;
      if (fits || headHigh) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      result.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    });
  }

  private async runCheck(): Promise<void> {
    try {
      await this.runCheckInner();
    } finally {
      this.revealResult();
    }
  }

  private async runCheckInner(): Promise<void> {
    if (this.isBusy()) return;
    const current = this.currentEmail();
    if (!current) return;
    const seq = (this.checkSeq += 1);
    const key = this.emailKey(current);
    // A result is used only if no newer check started and the same email is still on screen.
    const stillCurrent = () => seq === this.checkSeq && this.emailKey(this.currentEmail()) === key;
    this.check = { status: "checking", where: "device" };
    this.note = "";
    this.render();

    const outcome = await runCheckFlow(
      { text: current.text, sample: current.sample },
      {
        readClaim,
        firebaseConfigured: isFirebaseConfigured,
        cloudAvailable: isCloudAiAvailable,
        cloudBlocked: () => appCheckGate.isBlocked(),
        askForCloudConsent: () => this.askForCloudConsent(),
        consentMemory: cloudConsentMemory,
        onCloudStart: () => {
          if (!stillCurrent()) return;
          this.check = { status: "checking", where: "cloud" };
          this.render();
        },
        warn: (message, error) => console.warn(message, error),
      },
    );

    if (!stillCurrent()) return;
    if (outcome.kind === "ai") {
      const remembered = outcome.inferenceSource === "in_cloud" && cloudConsentMemory.has();
      this.finishWithClaim(current, key, outcome.claim, outcome.inferenceSource, remembered);
      return;
    }
    if (outcome.kind === "sample" && current.sample) {
      this.finishWithSampleClaim(current.sample, key, outcome.detail);
      return;
    }
    if (outcome.kind === "not_sent") {
      this.check = { status: "not_sent", message: outcome.message };
      this.render();
      return;
    }
    if (outcome.kind === "error") {
      this.check = { status: "error", message: outcome.message, canLimited: outcome.canLimited };
      this.render();
      return;
    }
    this.runLimited();
  }

  private async saveShipment(): Promise<void> {
    if (this.check.status !== "done" || !this.check.canSaveShipment) return;
    const current = this.currentEmail();
    if (!current || this.emailKey(current) !== this.check.emailKey) return;
    const shipment = ingestShipmentFromClaim(this.check.claim, {
      fromDomain: current.fromDomain,
      subject: current.subject,
    });
    if (!shipment) return;
    await saveShipment(shipment);
    const sender = ingestSenderFromClaim(this.check.claim, {
      fromDomain: current.fromDomain,
      subject: current.subject,
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
