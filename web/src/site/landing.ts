import { decideVerdict, runLimitedCheck, type Verdict } from "@did-i-order-this/core";
import { readClaim } from "../ai/readClaim.ts";
import { isCloudAiAvailable, isFirebaseConfigured } from "../firebase/app.ts";
import { loadLedger } from "../ledger/store.ts";
import { getOfficialPack } from "../packs/official.ts";
import { formatEmailText, sampleThreads, type SampleThread } from "../demo/seed.ts";
import { mountStage } from "./stage.ts";
import { extractFromDomain } from "./emailText.ts";

type Mode = "device" | "cloud";

interface HeroResult {
  kind: "verdict" | "limited" | "error";
  outcome?: Verdict["outcome"];
  headline: string;
  sourceLabel: string;
  reasons: string[];
  sampleNote?: string;
}

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
  const showStamp = !result.sampleNote;
  const stamp = showStamp
    ? `<p class="source-label${stamped ? " is-stamped" : ""}">${escapeHtml(result.sourceLabel)}</p>`
    : "";
  const reasons = result.reasons
    .slice(0, 4)
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `
    <div class="hero-verdict result result-${tone}">
      <p class="outcome">${escapeHtml(result.kind === "limited" ? "limited" : result.kind === "error" ? "error" : tone)}</p>
      <h2 class="headline">${escapeHtml(result.headline)}</h2>
      ${stamp}
      ${note}
      <ul class="reasons">${reasons}</ul>
    </div>
  `;
}

function autosize(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  const next = Math.min(Math.max(textarea.scrollHeight, 56), 160);
  textarea.style.height = `${next}px`;
}

async function runChecker(emailText: string, mode: Mode): Promise<HeroResult> {
  const ledger = await loadLedger();
  const pack = getOfficialPack();
  const fromDomain = extractFromDomain(emailText);
  const sample = matchSample(emailText);

  if (isFirebaseConfigured()) {
    try {
      const first = await readClaim(emailText, "only_on_device");
      const verdict = decideVerdict(first.claim, ledger, pack, first.inferenceSource);
      return {
        kind: "verdict",
        outcome: verdict.outcome,
        headline: verdict.headline,
        sourceLabel: verdict.inferenceSourceLabel,
        reasons: verdict.reasons,
      };
    } catch {
      // Continue to cloud (if allowed) or the sample / limited fallback.
    }

    if (mode === "cloud" && isCloudAiAvailable()) {
      try {
        const second = await readClaim(emailText, "only_in_cloud");
        const verdict = decideVerdict(second.claim, ledger, pack, second.inferenceSource);
        return {
          kind: "verdict",
          outcome: verdict.outcome,
          headline: verdict.headline,
          sourceLabel: verdict.inferenceSourceLabel,
          reasons: verdict.reasons,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "The cloud check could not run.";
        if (!sample) {
          const limited = runLimitedCheck(emailText, { fromDomain }, ledger, pack);
          return {
            kind: "limited",
            headline: limited.headline,
            sourceLabel: limited.inferenceSourceLabel,
            reasons: [message, ...limited.findings],
          };
        }
      }
    }
  }

  if (sample) {
    const verdict = decideVerdict(sample.expectedClaim, ledger, pack, undefined);
    return {
      kind: "verdict",
      outcome: verdict.outcome,
      headline: verdict.headline,
      sourceLabel: verdict.inferenceSourceLabel,
      reasons: verdict.reasons,
      sampleNote:
        "On-device AI did not run in this browser. This check used the structured claim prepared for this sample.",
    };
  }

  const limited = runLimitedCheck(emailText, { fromDomain }, ledger, pack);
  return {
    kind: "limited",
    headline: limited.headline,
    sourceLabel: limited.inferenceSourceLabel,
    reasons: limited.findings,
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
    resultNode.innerHTML = `<p class="hero-status">${escapeHtml(text)}</p>`;
  };

  const showResult = (result: HeroResult) => {
    hero.classList.add("has-result");
    if (prefersReducedMotion()) {
      resultNode.innerHTML = renderResult(result, true);
      return;
    }
    resultNode.innerHTML = renderResult(result, false);
    const stamp = resultNode.querySelector(".source-label");
    window.requestAnimationFrame(() => stamp?.classList.add("is-stamped"));
  };

  const run = async (emailText: string, displayText?: string) => {
    const trimmed = emailText.trim();
    if (!trimmed) {
      input.focus();
      return;
    }
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
        ? "Trying on this device first. Cloud is allowed if that is unavailable."
        : "Checking against the orders stored on this device",
    );
    try {
      const result = await runChecker(trimmed, mode);
      if (current !== token) return;
      if (prefersReducedMotion()) {
        showResult(result);
        return;
      }
      timer = window.setTimeout(() => {
        if (current === token) showResult(result);
      }, 280);
    } catch (error) {
      if (current !== token) return;
      const message = error instanceof Error ? error.message : "The check could not run.";
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
      void run(text, label);
    });
  });

  setMode("device");
  autosize(input);
}

