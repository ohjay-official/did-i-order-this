import { decideVerdict, runLimitedCheck, senderDomainFromHeader, type EmailClaim, type Verdict } from "@did-i-order-this/core";
import { readClaim } from "../ai/readClaim.ts";
import { appCheckGate } from "../ai/appCheckGate.ts";
import { describeAiError } from "../ai/aiError.ts";
import { isCloudAiAvailable, isFirebaseConfigured } from "../firebase/app.ts";
import { ledgerForCheck, loadLedger, saveSender, saveShipment } from "../ledger/store.ts";
import { prepareTryChip } from "../demo/shipmentDemo.ts";
import { runCheckFlow } from "../ui/checkFlow.ts";
import { isNextStepReason, suggestNextStep } from "../ai/nextStep.ts";
import { askCloudConsentOnPage, isConsentDialogOpen } from "../ui/consentDialog.ts";
import { getOfficialPack } from "../packs/official.ts";
import { formatEmailText, sampleThreads, type SampleThread } from "../demo/seed.ts";
import { mountStage } from "./stage.ts";

type Mode = "device" | "cloud";

interface HeroResult {
  kind: "verdict" | "limited" | "error";
  outcome?: Verdict["outcome"];
  headline: string;
  sourceLabel: string;
  reasons: string[];
  claim?: EmailClaim;
  senderDomain?: string;
  emailText?: string;
  cloudAgreed?: boolean;
  sampleNote?: string;
  demoNote?: string;
  /** Why AI did not run, for example the cloud failure reason or "not sent". */
  detail?: string;
}

function reasonsForDisplay(reasons: string[]): string[] {
  const tip = reasons.find(isNextStepReason);
  const rest = reasons.filter((reason) => !isNextStepReason(reason)).slice(0, 4);
  return tip ? [...rest, tip] : rest;
}

/** On the home page every cloud check is asked about; a yes is not remembered. */
const ASK_EVERY_TIME = { has: () => false, remember: () => undefined };

export const HOME_SAMPLE_NOTE =
  "On-device AI did not run in this browser. This check used the structured claim prepared for this sample.";
export const HOME_DECLINED_NOTE = "You chose not to send this email to the cloud, so this is a limited check (no AI).";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function matchSample(emailText: string): SampleThread | undefined {
  const trimmed = emailText.trim();
  return sampleThreads.find((thread) => formatEmailText(thread).trim() === trimmed);
}

function renderResult(result: HeroResult, stamped: boolean): string {
  const tone = result.outcome ?? "neutral";
  const note = result.sampleNote ? `<p class="hero-note">${escapeHtml(result.sampleNote)}</p>` : "";
  const demoNote = result.demoNote ? `<p class="hero-note" data-demo-note>${escapeHtml(result.demoNote)}</p>` : "";
  const detail = result.detail ? `<p class="hero-note" data-fallback-detail>${escapeHtml(result.detail)}</p>` : "";
  const showStamp = !result.sampleNote;
  const stamp = showStamp
    ? `<p class="source-label${stamped ? " is-stamped" : ""}">${escapeHtml(result.sourceLabel)}</p>`
    : "";
  const reasons = reasonsForDisplay(result.reasons)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `
    <div class="hero-verdict result result-${tone}">
      <p class="outcome">${escapeHtml(result.kind === "limited" ? "limited" : result.kind === "error" ? "error" : tone)}</p>
      <h2 class="headline">${escapeHtml(result.headline)}</h2>
      ${stamp}
      ${note}
      ${detail}
      ${demoNote}
      <ul class="reasons">${reasons}</ul>
    </div>
  `;
}

function autosize(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  const next = Math.min(Math.max(textarea.scrollHeight, 56), 160);
  textarea.style.height = `${next}px`;
}

export interface CheckerHooks {
  askForCloudConsent?: () => Promise<boolean>;
  onCloudStart?: () => void;
}

/**
 * One home-page check. It runs through the same flow as the sample inbox:
 * on-device first; the cloud only when Allow cloud is on, and only after the
 * same consent dialog; and when the cloud fails, the reason is shown.
 */
export async function runChecker(emailText: string, mode: Mode, hooks: CheckerHooks = {}): Promise<HeroResult> {
  const sample = matchSample(emailText);
  // Demo rows count only for the fictional samples, never for someone's own mail.
  const ledger = ledgerForCheck(await loadLedger(), Boolean(sample));
  const pack = getOfficialPack();
  const fromDomain = senderDomainFromHeader(emailText);
  // A built-in sample's sender is set by the app; anything typed or pasted is
  // whatever the text says, so it can never give Safe.
  const senderCheck = sample ? "verified" : "pasted";

  const outcome = await runCheckFlow(
    { text: emailText, sample },
    {
      readClaim,
      firebaseConfigured: isFirebaseConfigured,
      cloudAvailable: () => mode === "cloud" && isCloudAiAvailable(),
      cloudBlocked: () => appCheckGate.isBlocked(),
      askForCloudConsent: hooks.askForCloudConsent ?? (() => askCloudConsentOnPage()),
      consentMemory: ASK_EVERY_TIME,
      onCloudStart: hooks.onCloudStart,
      warn: (message, error) => console.warn(message, error),
    },
  );

  if (outcome.kind === "ai") {
    const verdict = decideVerdict(outcome.claim, ledger, pack, outcome.inferenceSource, { emailText, senderCheck });
    return {
      kind: "verdict",
      outcome: verdict.outcome,
      headline: verdict.headline,
      sourceLabel: verdict.inferenceSourceLabel,
      reasons: verdict.reasons,
      claim: outcome.claim,
      // The brand in the tip comes only from a sender the app set itself (a
      // built-in sample), never from a From line in pasted text.
      senderDomain: sample ? fromDomain : undefined,
      emailText,
      // The tip may use the cloud only after a real yes for this check, one that
      // sent the email read to the cloud. The Allow cloud toggle alone is not a yes.
      cloudAgreed: outcome.inferenceSource === "in_cloud",
    };
  }
  if (outcome.kind === "sample") {
    const verdict = decideVerdict(outcome.claim, ledger, pack, undefined, { emailText, senderCheck });
    return {
      kind: "verdict",
      outcome: verdict.outcome,
      headline: verdict.headline,
      sourceLabel: verdict.inferenceSourceLabel,
      reasons: verdict.reasons,
      sampleNote: HOME_SAMPLE_NOTE,
      detail: outcome.detail || undefined,
    };
  }
  const limited = runLimitedCheck(emailText, { fromDomain, senderVerified: Boolean(sample) }, ledger, pack);
  const detail =
    outcome.kind === "not_sent" ? HOME_DECLINED_NOTE : outcome.kind === "error" ? outcome.message : undefined;
  return {
    kind: "limited",
    headline: limited.headline,
    sourceLabel: limited.inferenceSourceLabel,
    reasons: limited.findings,
    detail,
  };
}

export function mountLanding(root: ParentNode = document): void {
  const hero = root.querySelector<HTMLElement>("[data-hero]");
  if (!hero) return;

  const canvas = hero.querySelector<HTMLCanvasElement>("[data-stage]");
  const form = hero.querySelector<HTMLFormElement>("[data-prompt]");
  const input = hero.querySelector<HTMLTextAreaElement>("[data-prompt-input]");
  const resultNode = hero.querySelector<HTMLElement>("[data-result]");
  const modeButtons = [...hero.querySelectorAll<HTMLButtonElement>("[data-mode]")];
  const tryButtons = [...hero.querySelectorAll<HTMLButtonElement>("[data-try]")];
  if (!form || !input || !resultNode) return;

  if (canvas) mountStage(canvas);

  let mode: Mode = "device";
  let token = 0;
  let timer: number | undefined;
  let rawText = "";
  let compact = false;

  const setMode = (next: Mode) => {
    mode = next;
    modeButtons.forEach((button) => {
      const on = button.getAttribute("data-mode") === next;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-pressed", on ? "true" : "false");
    });
  };

  const showStatus = (text: string) => {
    hero.classList.add("has-result");
    resultNode.setAttribute("aria-busy", "true");
    resultNode.innerHTML = `<p class="hero-status is-loading">${escapeHtml(text)}</p>`;
  };

  const showResult = (result: HeroResult) => {
    hero.classList.add("has-result");
    resultNode.setAttribute("aria-busy", "false");
    if (prefersReducedMotion()) {
      resultNode.innerHTML = renderResult(result, true);
      return;
    }
    resultNode.innerHTML = renderResult(result, false);
    const stamp = resultNode.querySelector(".source-label");
    window.requestAnimationFrame(() => stamp?.classList.add("is-stamped"));
  };

  const attachNextStep = (result: HeroResult, current: number) => {
    if (result.kind !== "verdict" || !result.claim || result.sampleNote) return;
    if (!result.outcome) return;
    void suggestNextStep({
      claim: result.claim,
      verdict: { outcome: result.outcome, headline: result.headline, reasons: result.reasons },
      pack: getOfficialPack(),
      senderDomain: result.senderDomain,
      emailText: result.emailText,
      cloudAgreed: result.cloudAgreed,
    }).then((line) => {
      if (!line || current !== token) return;
      if (result.reasons.some(isNextStepReason)) return;
      showResult({ ...result, reasons: [...result.reasons, line] });
    });
  };

  const run = async (emailText: string, displayText?: string, demoNote = "") => {
    // Round 7: cap paste at 200k chars, same cap as the extension sanitizer.
    const trimmed = emailText.trim().slice(0, 200_000);
    if (!trimmed) {
      input.focus();
      return;
    }
    // One check at a time while the consent dialog is open.
    if (isConsentDialogOpen()) return;
    if (timer) window.clearTimeout(timer);
    const current = (token += 1);
    rawText = trimmed;
    if (displayText) {
      compact = true;
      input.value = displayText.trim();
    } else if (!compact) {
      input.value = trimmed;
    }
    autosize(input);
    showStatus(
      mode === "cloud"
        ? "Trying on this device first. If that is unavailable, you will be asked before anything is sent to the cloud."
        : "Checking against the orders stored on this device",
    );
    try {
      const checked = await runChecker(trimmed, mode, {
        onCloudStart: () => {
          if (current === token) showStatus("Checking this email in the cloud");
        },
      });
      const result = demoNote ? { ...checked, demoNote } : checked;
      if (current !== token) return;
      if (prefersReducedMotion()) {
        showResult(result);
        attachNextStep(result, current);
        return;
      }
      timer = window.setTimeout(() => {
        if (current !== token) return;
        showResult(result);
        attachNextStep(result, current);
      }, 280);
    } catch (error) {
      if (current !== token) return;
      const message = describeAiError(error);
      showResult({
        kind: "error",
        headline: "The check could not finish.",
        sourceLabel: "Check not completed",
        reasons: [message],
      });
    }
  };

  const currentText = () => (compact ? rawText : input.value);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(currentText());
  });

  input.addEventListener("input", () => {
    compact = false;
    rawText = input.value;
    autosize(input);
  });
  input.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void run(currentText());
    }
  });

  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-mode") === "cloud" ? "cloud" : "device";
      setMode(next);
    });
  });

  tryButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-try");
      const thread = sampleThreads.find((item) => item.id === id);
      if (!thread) return;
      tryButtons.forEach((item) => {
        const on = item === button;
        item.classList.toggle("is-current", on);
        item.setAttribute("aria-pressed", on ? "true" : "false");
      });
      const text = formatEmailText(thread);
      const label = (button.textContent || thread.subject).trim();
      void prepareTryChip(thread.id, { shipment: saveShipment, sender: saveSender })
        .catch(() => "")
        .then((demoNote) => run(text, label, demoNote));
    });
  });

  setMode("device");
  autosize(input);
}

