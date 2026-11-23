import type {
  AskedAction,
  EmailClaim,
  InferenceSourceValue,
  OfficialPack,
  Outcome,
  Verdict,
} from "@did-i-order-this/core";
import {
  findOfficialDomain,
  looksLikeCarrierTracking,
  looksLikeTracking,
  normalizeDomain,
} from "@did-i-order-this/core";
import {
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  Schema,
  getAI,
  getGenerativeModel,
} from "firebase/ai";
import { ensureAppCheckToken, getFirebaseApp, isCloudAiAvailable, isFirebaseConfigured } from "../firebase/app.ts";
import { AppCheckBlockedError, appCheckGate } from "./appCheckGate.ts";
import { isAppCheckError } from "./aiError.ts";
import { CloudBudgetError, cloudBudget } from "./cloudBudget.ts";
import { withTimeout } from "../ui/checkFlow.ts";

/** Short enough that a hung App Check or model call cannot hold the verdict. */
export const NEXT_STEP_TIMEOUT_MS = 8_000;
export const MAX_ADVICE_CHARS = 240;

export type RiskyAction = "pay" | "log_in" | "download" | "none";

export interface NextStepPayload {
  outcome: Outcome;
  headline: string;
  action: RiskyAction;
  brand?: string;
}

export interface NextStepInput {
  claim: EmailClaim;
  verdict: Pick<Verdict, "outcome" | "headline" | "reasons">;
  pack: OfficialPack;
  /** The real sender domain from the From header, when known. */
  senderDomain?: string;
}

export interface NextStepDeps {
  firebaseConfigured: () => boolean;
  cloudAvailable: () => boolean;
  cloudBlocked: () => boolean;
  takeBudget: () => void;
  ensureAppCheck: () => Promise<void>;
  blockAppCheck: () => void;
  isAppCheckError: (error: unknown) => boolean;
  generateAdvice: (
    payload: NextStepPayload,
    pack: OfficialPack,
  ) => Promise<{ text: string; inferenceSource: InferenceSourceValue }>;
  timeoutMs?: number;
}

const URL_RE = /\bhttps?:\/\/[^\s)<>"']+/gi;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export function isNextStepReason(reason: string): boolean {
  return reason.startsWith("Next step written in the cloud:") || reason.startsWith("Next step written on this device:");
}

export function formatNextStepReason(source: InferenceSourceValue, advice: string): string {
  const where = source === "in_cloud" ? "in the cloud" : "on this device";
  return `Next step written ${where}: ${advice}`;
}

export function riskyActionFromClaim(action: AskedAction): RiskyAction {
  if (action === "pay" || action === "log_in" || action === "download") return action;
  return "none";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWord(name: string, text: string): boolean {
  const official = name.trim();
  if (!official) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(official)}([^A-Za-z0-9]|$)`, "i").test(text);
}

/**
 * Returns the official pack's canonical name when the claimed name matches it
 * (exact, case-insensitive, or as a whole word). Never returns the raw claimed
 * string if it is not on the list.
 */
export function officialBrandFromClaimedName(name: string, pack: OfficialPack): string | undefined {
  const raw = name.trim().replace(/\s+/g, " ");
  if (!raw) return undefined;
  for (const entry of pack.officialDomains) {
    if (wholeWord(entry.name, raw) || raw.toLowerCase() === entry.name.trim().toLowerCase()) return entry.name;
  }
  return undefined;
}

/**
 * True when the headline or a reason names the official brand as a word,
 * not as part of a hostname like dhl-parcel-desk.example.
 */
export function verdictNamesBrand(verdict: Pick<Verdict, "headline" | "reasons">, brand: string): boolean {
  const official = brand.trim();
  if (!official) return false;
  const text = [verdict.headline, ...verdict.reasons].join("\n");
  const pattern = new RegExp(`(^|[^A-Za-z0-9])${escapeRegex(official)}(?![.-][A-Za-z0-9])`, "i");
  return pattern.test(text);
}

/**
 * Brand goes in the payload only when the real sender domain is official, or
 * when the verdict text itself already names a claimed brand that is on the
 * official list. A claimed name alone is not enough.
 */
export function brandForPayload(input: NextStepInput): string | undefined {
  if (input.senderDomain) {
    const official = findOfficialDomain(input.pack, input.senderDomain);
    if (official) return official.name;
  }
  const claimed = officialBrandFromClaimedName(input.claim.claimed_party.name, input.pack);
  if (claimed && verdictNamesBrand(input.verdict, claimed)) return claimed;
  return undefined;
}

export function buildNextStepPayload(input: NextStepInput): NextStepPayload {
  const payload: NextStepPayload = {
    outcome: input.verdict.outcome,
    headline: input.verdict.headline,
    action: riskyActionFromClaim(input.claim.asked_action),
  };
  const brand = brandForPayload(input);
  if (brand) payload.brand = brand;
  return payload;
}

export function officialHosts(pack: OfficialPack): string[] {
  return pack.officialDomains.map((entry) => normalizeDomain(entry.domain)).filter(Boolean);
}

function hostIsOfficial(host: string, pack: OfficialPack): boolean {
  const normalized = normalizeDomain(host);
  if (!normalized) return false;
  return officialHosts(pack).some((official) => normalized === official || normalized.endsWith(`.${official}`));
}

function urlIsAllowed(raw: string, pack: OfficialPack): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return hostIsOfficial(url.hostname, pack);
  } catch {
    return false;
  }
}

/**
 * True when advice on a Warning verdict would contradict or soften it by
 * calling the email genuine or safe.
 */
export function softensWarning(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    /\b(this|the|that)\s+(email|message|mail|notice|request)\s+(is|looks|appears|seems)\s+(safe|genuine|authentic|legitimate|real|official)\b/,
    /\b(safe|genuine|authentic|legitimate|real)\s+(email|message|mail|notice)\b/,
    /\b(is|looks|appears|seems)\s+not\s+a\s+(scam|fake|fraud)\b/,
    /\bnot\s+a\s+(scam|fake|fraud)\b/,
    /\bnothing\s+to\s+worry\b/,
    /\bno\s+reason\s+for\s+concern\b/,
    /\byou\s+can\s+trust\s+(this|the|that)\s+(email|message|mail|notice)\b/,
    /\bthis\s+is\s+(a\s+)?(real|official|genuine|safe|legitimate|authentic)\s+(email|message|mail|notice)\b/,
    /\b(treat|regard|consider)\s+(this|it|the email)\s+as\s+(safe|genuine|legitimate|authentic)\b/,
  ];
  return patterns.some((pattern) => pattern.test(t));
}

export function isLeakedNumberWarning(verdict?: Pick<Verdict, "headline" | "reasons">): boolean {
  if (!verdict) return false;
  const text = [verdict.headline, ...verdict.reasons].join("\n").toLowerCase();
  return text.includes("likely leaked") || text.includes("not from the carrier's official domain");
}

/**
 * True when advice would treat a leaked-number Warning as if the unofficial
 * match were Safe or from the official carrier.
 */
export function softensLeakedNumberWarning(text: string): boolean {
  const t = text.toLowerCase();
  const patterns = [
    /\bmatches a shipment you are expecting\b/,
    /\b(this|the)\s+(email|message|mail|notice)\s+is\s+from\s+(the\s+)?(official\s+)?(carrier|domain|sender)\b/,
    /\bfrom the official (carrier|domain|sender)\b/,
    /\bhas not leaked\b/,
    /\bnumber has not leaked\b/,
    /\bsafe because it (cites|includes|has|mentions) your tracking\b/,
    /\byou (are|'re) expecting this (parcel|shipment|email)\b/,
  ];
  return patterns.some((pattern) => pattern.test(t));
}

/**
 * True when the sentence contradicts or softens the verdict. On Warning,
 * that includes genuine/safe wording and, for a leaked-number Warning,
 * treating the unofficial match as Safe or official.
 */
export function contradictsVerdict(
  text: string,
  outcome?: Outcome,
  verdict?: Pick<Verdict, "headline" | "reasons">,
): boolean {
  if (outcome === "warning") {
    if (softensWarning(text)) return true;
    if (isLeakedNumberWarning(verdict) && softensLeakedNumberWarning(text)) return true;
  }
  if (outcome === "safe") {
    const t = text.toLowerCase();
    if (/\b(this|the|that)\s+(email|message|mail|notice)\s+(is|looks|appears|seems)\s+(a\s+)?(scam|fake|fraud|phishing)\b/.test(t)) {
      return true;
    }
    if (/\bnumber has likely leaked\b/.test(t) || /\bnot from the carrier's official domain\b/.test(t)) {
      return true;
    }
  }
  return false;
}

/**
 * Accepts a single plain-text sentence. Drops the line (returns undefined)
 * when it is empty, too long to trim cleanly, contains HTML, an email
 * address, a tracking-shaped number, a link that is not on the official
 * domain list, or wording that contradicts or softens the verdict (including a leaked-number Warning).
 */
export function validateNextStepAdvice(
  raw: string,
  pack: OfficialPack,
  outcome?: Outcome,
  verdict?: Pick<Verdict, "headline" | "reasons">,
): string | undefined {
  if (typeof raw !== "string") return undefined;
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (/[<>]/.test(text)) return undefined;
  if (EMAIL_RE.test(text)) return undefined;

  const markdownLinks = [...text.matchAll(MARKDOWN_LINK_RE)];
  for (const match of markdownLinks) {
    if (!urlIsAllowed(match[2], pack)) return undefined;
  }
  const urls = text.match(URL_RE) ?? [];
  for (const url of urls) {
    if (!urlIsAllowed(url, pack)) return undefined;
  }

  const tokens = text.split(/[^\w]+/).filter(Boolean);
  for (const token of tokens) {
    if (looksLikeCarrierTracking(token) || looksLikeTracking(token)) return undefined;
  }

  if (contradictsVerdict(text, outcome, verdict)) return undefined;

  if (text.length > MAX_ADVICE_CHARS) {
    const sliced = text.slice(0, MAX_ADVICE_CHARS);
    const sentence = sliced.match(/^(.*?[.!?])(\s|$)/);
    text = (sentence?.[1] ?? sliced.replace(/\s+\S*$/, "")).trim();
    if (!text || text.length < 24) return undefined;
    if (contradictsVerdict(text, outcome, verdict)) return undefined;
  }
  return text;
}

function adviceSchema(): Schema {
  return Schema.object({
    properties: {
      advice: Schema.string(),
    },
  });
}

export function buildNextStepPrompt(payload: NextStepPayload, pack: OfficialPack): string {
  const allowed = pack.officialDomains
    .map((entry) => `${entry.name} (${entry.domain})`)
    .join(", ");
  const warningRule =
    payload.outcome === "warning"
      ? "The outcome is Warning. Do not say the email is genuine, authentic, legitimate, real, or safe. Do not contradict or soften the warning. If the headline says the tracking number matches but the email is not from the official domain, do not treat that match as Safe or official."
      : "Do not contradict the verdict outcome.";
  return [
    "Write one short sentence of practical next-step advice for someone who just checked a delivery or billing email.",
    "Use only the JSON facts below. They are a verdict category, our own headline, an official brand name when allowed, and a risky-action type.",
    "Do not invent tracking numbers, order numbers, email addresses, or quotes from an email.",
    "If a brand is present, make the advice specific to how that brand really collects fees or logins, and where to report a fake.",
    warningRule,
    "Plain text only. No HTML. Links only to these official domains, if you include a link at all:",
    allowed,
    "",
    JSON.stringify(payload),
  ].join("\n");
}

function mapInferenceSource(value: unknown): InferenceSourceValue {
  if (value === InferenceSource.ON_DEVICE || value === "on_device") return "on_device";
  if (value === InferenceSource.IN_CLOUD || value === "in_cloud") return "in_cloud";
  throw new Error("The model response did not include a usable inferenceSource.");
}

function parseAdviceText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && "advice" in parsed && typeof (parsed as { advice: unknown }).advice === "string") {
      return (parsed as { advice: string }).advice;
    }
  } catch {
    // Plain text is also accepted.
  }
  return trimmed;
}

export async function generateNextStepAdvice(
  payload: NextStepPayload,
  pack: OfficialPack,
): Promise<{ text: string; inferenceSource: InferenceSourceValue }> {
  const schema = adviceSchema();
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_IN_CLOUD,
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    },
    onDeviceParams: {
      promptOptions: { responseConstraint: schema },
    },
  });
  const result = await model.generateContent(buildNextStepPrompt(payload, pack));
  return {
    text: parseAdviceText(result.response.text()),
    inferenceSource: mapInferenceSource(result.response.inferenceSource),
  };
}

function defaultDeps(): NextStepDeps {
  return {
    firebaseConfigured: isFirebaseConfigured,
    cloudAvailable: isCloudAiAvailable,
    cloudBlocked: () => appCheckGate.isBlocked(),
    takeBudget: () => cloudBudget.take(),
    ensureAppCheck: ensureAppCheckToken,
    blockAppCheck: () => appCheckGate.block(),
    isAppCheckError,
    generateAdvice: generateNextStepAdvice,
    timeoutMs: NEXT_STEP_TIMEOUT_MS,
  };
}

/**
 * Hosted-site only. Never throws to the caller: budget, App Check, timeout or
 * a bad model reply all mean "show nothing extra". The verdict is unchanged.
 */
export async function suggestNextStep(input: NextStepInput, deps: NextStepDeps = defaultDeps()): Promise<string | undefined> {
  if (!deps.firebaseConfigured() || !deps.cloudAvailable() || deps.cloudBlocked()) return undefined;
  const payload = buildNextStepPayload(input);
  try {
    deps.takeBudget();
  } catch (error) {
    if (error instanceof CloudBudgetError) return undefined;
    return undefined;
  }
  try {
    await deps.ensureAppCheck();
  } catch (error) {
    if (error instanceof AppCheckBlockedError || deps.isAppCheckError(error)) deps.blockAppCheck();
    return undefined;
  }
  try {
    const result = await withTimeout(deps.generateAdvice(payload, input.pack), deps.timeoutMs ?? NEXT_STEP_TIMEOUT_MS);
    const advice = validateNextStepAdvice(result.text, input.pack, input.verdict.outcome, input.verdict);
    if (!advice) return undefined;
    return formatNextStepReason(result.inferenceSource, advice);
  } catch (error) {
    if (deps.isAppCheckError(error) || error instanceof AppCheckBlockedError) deps.blockAppCheck();
    return undefined;
  }
}
