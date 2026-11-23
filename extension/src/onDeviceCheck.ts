import { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel } from "firebase/ai";
import { getOnDeviceFirebaseApp } from "../../web/src/firebase/app.ts";
import { ON_DEVICE_CREATE_OPTIONS } from "../../web/src/ai/readClaim.ts";
import { NoOnDeviceModelError, assertOnDeviceAdapter, hasOnDeviceApi, warmUpOnDevice, withCloudFetchBlocked } from "../../web/src/ai/onDevice.ts";

export interface OnDeviceCheckDeps {
  hasApi: () => boolean;
  makeModel: () => { initializeDeviceModel(): Promise<void> };
}

const defaultDeps: OnDeviceCheckDeps = {
  hasApi: () => hasOnDeviceApi(),
  makeModel: () =>
    getGenerativeModel(getAI(getOnDeviceFirebaseApp(), { backend: new GoogleAIBackend() }), {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: { createOptions: ON_DEVICE_CREATE_OPTIONS },
    }),
};

/**
 * One quick look, through Firebase AI Logic, at whether Chrome's on-device
 * model can start, before the side panel asks for a read. The side panel page
 * is always freshly opened, so the shared warm-up would keep retrying "not
 * available" for its first 12 seconds; here a single answer is final, so a
 * browser without the model hears so in about 2 seconds instead of about 10.
 * Throws the same errors readClaim would, so the caller shows the same message.
 */
export async function checkOnDeviceReady(deps: OnDeviceCheckDeps = defaultDeps): Promise<void> {
  if (!deps.hasApi()) throw new NoOnDeviceModelError();
  const model = deps.makeModel();
  assertOnDeviceAdapter(model);
  await withCloudFetchBlocked(() => warmUpOnDevice(model, { pageAgeMs: () => Number.POSITIVE_INFINITY }));
}
