import type { EmailClaim, InferenceSourceValue, OfficialPack, Outcome, Verdict } from "@did-i-order-this/core";
import { findOfficialDomain, readTextSignals } from "@did-i-order-this/core";
import { GoogleAIBackend, InferenceMode, InferenceSource, Schema, getAI, getGenerativeModel } from "firebase/ai";
import {
  ensureAppCheckToken,
  getFirebaseApp,
  getOnDeviceFirebaseApp,
  isCloudAiAvailable,
  isFirebaseConfigured,
} from "../firebase/app.ts";
import { AppCheckBlockedError, AppCheckGate } from "./appCheckGate.ts";
import { isAppCheckError } from "./aiError.ts";
import { CloudBudget } from "./cloudBudget.ts";
import { hasOnDeviceApi } from "./onDevice.ts";
import { withTimeout } from "../ui/checkFlow.ts";

/**
 * The next-step tip under a verdict. The model never writes the words: it
 * only picks one template id from a fixed, vetted list (and, optionally, the
 * brand already in the payload). Code renders the text and checks that the
 * template belongs to the verdict's outcome and to the action read from the
 * email, so no model sentence can soften a Warning or invent a link.
 *
 * Where it runs:
 * - in the cloud only after cloud agreement for this check (a "Check in the
 *   cloud" yes, or the home page's cloud mode), with its own budget and App
 *   Check gate, separate from the email read;
 * - otherwise on this device only (ONLY_ON_DEVICE, the app with no App
 *   Check), and only when the browser has an on-device model;
 * - otherwise not at all.
 */

/** Short enough that a hung App Check or model call cannot hold the verdict. */
export const NEXT_STEP_TIMEOUT_MS = 8_000;

export type RiskyAction = "pay" | "log_in" | "download" | "none";

export interface NextStepPayload {
  outcome: Outcome;
  action: RiskyAction;
  brand?: string;
}

export interface NextStepInput {
  claim: EmailClaim;
  verdict: Pick<Verdict, "outcome" | "headline" | "reasons">;
  pack: OfficialPack;
  /** The real sender domain from the From header, when known. */
  senderDomain?: string;
  /** The email text: the action is read from it in code. */
  emailText?: string;
  /** True only after the user agreed to the cloud for this check. */
  cloudAgreed?: boolean;
}

export interface NextStepTemplate {
  id: string;
  outcome: Outcome;
  actions: readonly RiskyAction[];
  /** {site} becomes the brand's official site, or a generic "own app or site". */
  text: string;
}

/** Every sentence the tip can ever show. Reviewed by hand; no model wording. */
export const NEXT_STEP_TEMPLATES: readonly NextStepTemplate[] = [
  { id: "warn_pay_own_site", outcome: "warning", actions: ["pay"], text: "Do not pay anything through this email. If you think a fee is real, open {site} yourself and pay only there." },
  { id: "warn_pay_report", outcome: "warning", actions: ["pay"], text: "Do not pay through this email. Report it as phishing in your mail app, then delete it." },
  { id: "warn_login_own_site", outcome: "warning", actions: ["log_in"], text: "Do not sign in through this email's links. To check your account, type the address of {site} yourself." },
  { id: "warn_download_delete", outcome: "warning", actions: ["download"], text: "Do not open any attachment or download from this email. Report it as phishing in your mail app, then delete it." },
  { id: "warn_check_own_site", outcome: "warning", actions: ["none", "pay", "log_in", "download"], text: "Do not use this email's links. Check the parcel or order on {site} directly." },
  { id: "warn_report", outcome: "warning", actions: ["none"], text: "Report this email as phishing in your mail app, then delete it." },
  { id: "neutral_check_own_site", outcome: "neutral", actions: ["none", "pay", "log_in", "download"], text: "If you are unsure, check the parcel or order on {site} directly, not through this email." },
  { id: "neutral_pay_wait", outcome: "neutral", actions: ["pay"], text: "Do not pay from this email until you have checked {site} directly." },
  { id: "neutral_login_wait", outcome: "neutral", actions: ["log_in"], text: "Do not sign in from this email's links. Go to {site} directly if you need your account." },
  { id: "neutral_download_wait", outcome: "neutral", actions: ["download"], text: "Do not open attachments from this email until you have checked {site} directly." },
  { id: "safe_follow_own_site", outcome: "safe", actions: ["none"], text: "You can also follow this parcel or order on {site}." },
  { id: "safe_changes_own_site", outcome: "safe", actions: ["none"], text: "Nothing else to do. For any change, use {site} rather than a reply to this email." },
];

const GENERIC_SITE = "the carrier's or store's own app or site";

export interface GenerateResult {
  raw: string;
  inferenceSource: InferenceSourceValue;
}

export interface NextStepDeps {
  firebaseConfigured: () => boolean;
  cloudAvailable: () => boolean;
  /** True when the browser has an on-device model. */
  onDeviceAvailable?: () => boolean;
  cloudBlocked: () => boolean;
  takeBudget: () => void;
  ensureAppCheck: () => Promise<void>;
  blockAppCheck: () => void;
  isAppCheckError: (error: unknown) => boolean;
  generate: (prompt: string, ids: string[], brands: string[], where: "cloud" | "device") => Promise<GenerateResult>;
  timeoutMs?: number;
}

export function isNextStepReason(reason: string): boolean {
  return reason.startsWith("Next step, chosen in the cloud:") || reason.startsWith("Next step, chosen on this device:");
}

export function formatNextStepReason(source: InferenceSourceValue, tip: string): string {
  const where = source === "in_cloud" ? "in the cloud" : "on this device";
  return `Next step, chosen ${where}: ${tip}`;
}

/** The action, read in code from the email text, with the model's label able only to add to it. */
export function actionFromEmail(claim: EmailClaim, emailText: string | undefined, pack: OfficialPack): RiskyAction {
  const signals = readTextSignals(emailText, pack);
  if (signals.asksToPay || signals.parcelFeeLure || signals.amountDue || claim.asked_action === "pay") return "pay";
  if (signals.asksToLogIn || claim.asked_action === "log_in") return "log_in";
  if (signals.asksToDownload || claim.asked_action === "download") return "download";
  return "none";
}

/**
 * The brand goes in only when the real sender domain is on the official list.
 * A claimed name alone is never enough.
 */
export function brandForPayload(input: Pick<NextStepInput, "senderDomain" | "pack">): string | undefined {
  if (!input.senderDomain) return undefined;
  return findOfficialDomain(input.pack, input.senderDomain)?.name;
}

export function buildNextStepPayload(input: NextStepInput): NextStepPayload {
  const payload: NextStepPayload = {
    outcome: input.verdict.outcome,
    action: actionFromEmail(input.claim, input.emailText, input.pack),
  };
  const brand = brandForPayload(input);
  if (brand) payload.brand = brand;
  return payload;
}

export function templatesFor(payload: Pick<NextStepPayload, "outcome" | "action">): NextStepTemplate[] {
  return NEXT_STEP_TEMPLATES.filter((t) => t.outcome === payload.outcome && t.actions.includes(payload.action));
}

/** The brand's official site, from the pack. */
export function officialSiteFor(brand: string | undefined, pack: OfficialPack): string {
  if (!brand) return GENERIC_SITE;
  const entry = pack.officialDomains.find((item) => item.name === brand);
  return entry ? `the official ${brand} app or ${entry.domain}` : GENERIC_SITE;
}

/**
 * Renders the chosen template, or returns undefined when the id is unknown,
 * belongs to another outcome, or does not fit the action. A brand that is not
 * the payload's brand is dropped, not used.
 */
export function renderNextStep(choice: { template?: unknown; brand?: unknown }, payload: NextStepPayload, pack: OfficialPack): string | undefined {
  const template = NEXT_STEP_TEMPLATES.find((t) => t.id === choice.template);
  if (!template) return undefined;
  if (template.outcome !== payload.outcome || !template.actions.includes(payload.action)) return undefined;
  const brand = payload.brand && choice.brand === payload.brand ? payload.brand : undefined;
  return template.text.replace("{site}", officialSiteFor(brand, pack));
}

export function parseChoice(raw: string): { template?: unknown; brand?: unknown } {
  try {
    const parsed: unknown = JSON.parse(raw.trim());
    if (parsed && typeof parsed === "object") return parsed as { template?: unknown; brand?: unknown };
  } catch {
    // Not JSON: nothing usable.
  }
  return {};
}

export function buildNextStepPrompt(payload: NextStepPayload, templates: NextStepTemplate[]): string {
  return [
    "Pick the one next-step template that best fits someone who just checked a delivery or billing email.",
    "Reply with JSON only: the template id, and the brand only if one is given below.",
    "",
    JSON.stringify({ outcome: payload.outcome, action: payload.action, brand: payload.brand }),
    "",
    ...templates.map((t) => `${t.id}: ${t.text}`),
  ].join("\n");
}

function choiceSchema(ids: string[], brands: string[]): Schema {
  return Schema.object({
    properties: {
      template: Schema.enumString({ enum: ids }),
      ...(brands.length ? { brand: Schema.enumString({ enum: brands }) } : {}),
    },
    optionalProperties: brands.length ? ["brand"] : [],
  });
}

function mapInferenceSource(value: unknown): InferenceSourceValue {
  if (value === InferenceSource.ON_DEVICE || value === "on_device") return "on_device";
  if (value === InferenceSource.IN_CLOUD || value === "in_cloud") return "in_cloud";
  throw new Error("The model response did not include a usable inferenceSource.");
}

/**
 * The cloud path uses the App Check app and PREFER_IN_CLOUD; the device path
 * uses the app with no App Check and ONLY_ON_DEVICE, so it loads nothing
 * from Google.
 */
export async function generateNextStepChoice(
  prompt: string,
  ids: string[],
  brands: string[],
  where: "cloud" | "device",
): Promise<GenerateResult> {
  const schema = choiceSchema(ids, brands);
  const app = where === "cloud" ? getFirebaseApp() : getOnDeviceFirebaseApp();
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    mode: where === "cloud" ? InferenceMode.ONLY_IN_CLOUD : InferenceMode.ONLY_ON_DEVICE,
    inCloudParams: {
      model: "gemini-3.5-flash-lite",
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    },
    onDeviceParams: { promptOptions: { responseConstraint: schema } },
  });
  const result = await model.generateContent(prompt);
  const source = mapInferenceSource(result.response.inferenceSource);
  if ((where === "device") !== (source === "on_device")) throw new Error("The tip ran somewhere other than asked.");
  return { raw: result.response.text(), inferenceSource: source };
}

/** Separate from the email read: a tip never spends its budget or trips its App Check gate. */
export const tipBudget = new CloudBudget(undefined, undefined, "dio.tipCloudCalls.v1");
export const tipGate = new AppCheckGate(undefined, "dio.tipAppCheckBlocked.v1");

function defaultDeps(): NextStepDeps {
  return {
    firebaseConfigured: isFirebaseConfigured,
    cloudAvailable: isCloudAiAvailable,
    onDeviceAvailable: () => hasOnDeviceApi(),
    cloudBlocked: () => tipGate.isBlocked(),
    takeBudget: () => tipBudget.take(),
    ensureAppCheck: ensureAppCheckToken,
    blockAppCheck: () => tipGate.block(),
    isAppCheckError,
    generate: generateNextStepChoice,
    timeoutMs: NEXT_STEP_TIMEOUT_MS,
  };
}

/**
 * Never throws to the caller: budget, App Check, timeout or a bad model reply
 * all mean "show nothing extra". The verdict is unchanged.
 */
export async function suggestNextStep(input: NextStepInput, deps: NextStepDeps = defaultDeps()): Promise<string | undefined> {
  if (!deps.firebaseConfigured()) return undefined;
  const payload = buildNextStepPayload(input);
  const templates = templatesFor(payload);
  if (!templates.length) return undefined;

  let where: "cloud" | "device";
  if (input.cloudAgreed) {
    if (!deps.cloudAvailable() || deps.cloudBlocked()) return undefined;
    where = "cloud";
  } else if (deps.onDeviceAvailable?.()) {
    where = "device";
  } else {
    return undefined;
  }

  if (where === "cloud") {
    try {
      deps.takeBudget();
    } catch {
      return undefined;
    }
    try {
      await deps.ensureAppCheck();
    } catch (error) {
      if (error instanceof AppCheckBlockedError || deps.isAppCheckError(error)) deps.blockAppCheck();
      return undefined;
    }
  }

  try {
    const prompt = buildNextStepPrompt(payload, templates);
    const result = await withTimeout(
      deps.generate(prompt, templates.map((t) => t.id), payload.brand ? [payload.brand] : [], where),
      deps.timeoutMs ?? NEXT_STEP_TIMEOUT_MS,
    );
    const tip = renderNextStep(parseChoice(result.raw), payload, input.pack);
    if (!tip) return undefined;
    return formatNextStepReason(result.inferenceSource, tip);
  } catch (error) {
    if (where === "cloud" && (deps.isAppCheckError(error) || error instanceof AppCheckBlockedError)) deps.blockAppCheck();
    return undefined;
  }
}
