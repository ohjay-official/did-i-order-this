export type InferenceModeChoice =
  | "only_on_device"
  | "prefer_on_device"
  | "only_in_cloud"
  | "cancelled";

export type ConsentPrompt = () => Promise<boolean>;

/**
 * Default is on-device only. When on-device AI is unavailable, a consent
 * prompt is required before any cloud mode. "cancelled" means no cloud call.
 */
export async function chooseInferenceMode(
  onDeviceAvailable: boolean,
  askForCloudConsent: ConsentPrompt,
): Promise<InferenceModeChoice> {
  if (onDeviceAvailable) return "only_on_device";
  const agreed = await askForCloudConsent();
  if (!agreed) return "cancelled";
  return "only_in_cloud";
}
