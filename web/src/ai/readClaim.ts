import type { EmailClaim, InferenceSourceValue } from "@did-i-order-this/core";
import {
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  getAI,
  getGenerativeModel,
  type GenerativeModel,
  type HybridParams,
} from "firebase/ai";
import { getFirebaseApp } from "../firebase/app.ts";
import { parseClaimResponse } from "./parseClaim.ts";
import { CLAIM_PROMPT, getClaimSchema } from "./schema.ts";

export type ReadClaimMode = "only_on_device" | "prefer_on_device" | "only_in_cloud";

const MODE_MAP: Record<ReadClaimMode, InferenceMode> = {
  only_on_device: InferenceMode.ONLY_ON_DEVICE,
  prefer_on_device: InferenceMode.PREFER_ON_DEVICE,
  only_in_cloud: InferenceMode.ONLY_IN_CLOUD,
};

function mapInferenceSource(value: unknown): InferenceSourceValue {
  if (value === InferenceSource.ON_DEVICE || value === "on_device") return "on_device";
  if (value === InferenceSource.IN_CLOUD || value === "in_cloud") return "in_cloud";
  throw new Error("The model response did not include a usable inferenceSource.");
}

// Firebase defaults expectedInputs to text+image. This product only sends
// email text, so request the text model. The image-capable model is often
// unavailable (availability() === "unavailable") on machines that can still
// run text Nano.
export const ON_DEVICE_CREATE_OPTIONS = {
  expectedInputs: [{ type: "text" as const, languages: ["en"] }],
  expectedOutputs: [{ type: "text" as const, languages: ["en"] }],
};

function hybridParams(mode: ReadClaimMode): HybridParams {
  const schema = getClaimSchema();
  return {
    mode: MODE_MAP[mode],
    onDeviceParams: {
      createOptions: ON_DEVICE_CREATE_OPTIONS,
      promptOptions: {
        responseConstraint: schema,
      },
    },
    inCloudParams: {
      // Product brief default. Cloud is used only after consent.
      model: "gemini-3.5-flash-lite",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    },
  };
}

async function generateClaim(emailText: string, mode: ReadClaimMode): Promise<{
  claim: EmailClaim;
  inferenceSource: InferenceSourceValue;
}> {
  const ai = getAI(getFirebaseApp(), { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, hybridParams(mode));

  if (mode !== "only_in_cloud") {
    await initializeOnDevice(model);
  }

  const prompt = `${CLAIM_PROMPT}\n\n---\n${emailText}\n---`;
  const result = await model.generateContent(prompt);
  const claim = parseClaimResponse(result.response.text());
  const inferenceSource = mapInferenceSource(result.response.inferenceSource);
  return { claim, inferenceSource };
}

async function initializeOnDevice(model: GenerativeModel): Promise<void> {
  // Chrome can report the Prompt API as unavailable for a few seconds after
  // launch, before the on-device backend is ready. Retry that transient case
  // instead of immediately falling back to cloud consent.
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await model.initializeDeviceModel();
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("not available in this environment")) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw lastError;
}

export async function readClaim(
  emailText: string,
  mode: ReadClaimMode,
): Promise<{ claim: EmailClaim; inferenceSource: InferenceSourceValue }> {
  try {
    return await generateClaim(emailText, mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("invalid or incomplete")) throw error;
    // Retry once with the same mode when the structured claim is unusable.
    return generateClaim(emailText, mode);
  }
}
