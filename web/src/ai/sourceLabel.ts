import type { InferenceSourceLabel, InferenceSourceValue } from "@did-i-order-this/core";
import { labelForSource } from "@did-i-order-this/core";

export function sourceLabel(
  source: InferenceSourceValue,
): "Checked on this device" | "Checked in the cloud" {
  const label = labelForSource(source);
  if (label === "Checked on this device" || label === "Checked in the cloud") return label;
  throw new Error(`Unexpected inference source: ${source}`);
}

export type { InferenceSourceLabel };
