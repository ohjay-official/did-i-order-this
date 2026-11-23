import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

export type RecaptchaProviderType = "v3" | "enterprise";

let app: FirebaseApp | null = null;
let onDeviceApp: FirebaseApp | null = null;
let appCheck: AppCheck | null = null;

export function firebaseConfigFromEnv(): FirebaseWebConfig | null {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim();
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim();
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim();
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim();
  const appId = import.meta.env.VITE_FIREBASE_APP_ID?.trim();
  if (!apiKey || !authDomain || !projectId || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }
  return { apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId };
}

export function recaptchaSiteKeyFromEnv(): string | null {
  const key = import.meta.env.VITE_FIREBASE_RECAPTCHA_SITE_KEY?.trim();
  return key ? key : null;
}

export function recaptchaProviderTypeFromEnv(raw?: string | null): RecaptchaProviderType {
  const value = (raw ?? import.meta.env.VITE_FIREBASE_RECAPTCHA_PROVIDER ?? "").trim().toLowerCase();
  if (value === "enterprise" || value === "recaptcha-enterprise" || value === "recaptchaenterprise") {
    return "enterprise";
  }
  return "v3";
}

export function isFirebaseConfigured(): boolean {
  return firebaseConfigFromEnv() !== null;
}

export function isCloudAiAvailable(): boolean {
  return isFirebaseConfigured() && recaptchaSiteKeyFromEnv() !== null;
}

/**
 * The app used for on-device reads. It has no App Check, so an on-device check
 * never loads Google reCAPTCHA or asks Google for a token: nothing leaves the
 * browser. It is a separate named app because the AI service reads App Check
 * once, when it is first created for an app.
 */
export function getOnDeviceFirebaseApp(): FirebaseApp {
  if (onDeviceApp) return onDeviceApp;
  const config = firebaseConfigFromEnv();
  if (!config) {
    throw new Error("Firebase is not configured in this deployment.");
  }
  onDeviceApp = initializeApp(config, "on-device");
  return onDeviceApp;
}

/**
 * The app used for cloud calls (the email read after consent, and the hosted
 * site's next-step tip). App Check (reCAPTCHA) starts the first time this
 * app is created.
 */
export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const config = firebaseConfigFromEnv();
  if (!config) {
    throw new Error("Firebase is not configured in this deployment.");
  }
  app = initializeApp(config);
  const recaptchaKey = recaptchaSiteKeyFromEnv();
  if (recaptchaKey && !appCheck) {
    const provider =
      recaptchaProviderTypeFromEnv() === "enterprise"
        ? new ReCaptchaEnterpriseProvider(recaptchaKey)
        : new ReCaptchaV3Provider(recaptchaKey);
    appCheck = initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  }
  return app;
}

export class AppCheckFailedError extends Error {
  constructor(cause?: unknown) {
    super("App Check could not verify this browser.");
    this.name = "AppCheckFailedError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Gets an App Check token before any email text is sent. If this browser cannot
 * pass App Check, the cloud would reject the request anyway, so the email is
 * not sent at all.
 */
export async function ensureAppCheckToken(): Promise<void> {
  getFirebaseApp();
  if (!appCheck) return;
  try {
    await getToken(appCheck, false);
  } catch (error) {
    throw new AppCheckFailedError(error);
  }
}
