import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

let app: FirebaseApp | null = null;
let appCheckReady = false;

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

export function isFirebaseConfigured(): boolean {
  return firebaseConfigFromEnv() !== null;
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const config = firebaseConfigFromEnv();
  if (!config) {
    throw new Error("Firebase is not configured in this deployment.");
  }
  app = initializeApp(config);
  const recaptchaKey = recaptchaSiteKeyFromEnv();
  if (recaptchaKey && !appCheckReady) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(recaptchaKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckReady = true;
  }
  return app;
}
