import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  type AppCheck,
} from "firebase/app-check";

/**
 * Firebase client (browser SDK). The app reaches Firestore / Auth / Storage
 * DIRECTLY from the browser, secured by Firestore Security Rules — there is no
 * separate backend server. Initialization is lazy so nothing runs unless
 * Firebase is actually configured (otherwise the app uses the mock data layer).
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/** True when the minimum Firebase config is present. */
export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

let app: FirebaseApp | undefined;
let _auth: Auth | undefined;
let _db: Firestore | undefined;
let _storage: FirebaseStorage | undefined;
let _appCheck: AppCheck | undefined;

function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error("Firebase is not configured (missing NEXT_PUBLIC_FIREBASE_* env).");
  }
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(config);
    // Start App Check as soon as the app exists — before any Auth/Firestore
    // call — so attestation tokens attach to every request once enforced.
    maybeInitAppCheck(app);
  }
  return app;
}

/**
 * Enable Firebase App Check (reCAPTCHA v3) when a site key is configured.
 * Browser-only and a no-op without NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY, so
 * it's safe to wire ahead of registering the key. Once the key is set and
 * enforcement is turned on in the Firebase console, this becomes the app's
 * abuse / rate-limit layer for direct-to-Firebase traffic.
 */
function maybeInitAppCheck(a: FirebaseApp): void {
  if (_appCheck || typeof window === "undefined") return;
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;
  if (!siteKey) return;
  try {
    _appCheck = initializeAppCheck(a, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch {
    /* App Check is optional — never block app startup on it. */
  }
}

// Resolves once the first auth state is known, so authenticated Firestore reads
// don't race the session being restored from persistence on page load.
let resolveAuthReady: (() => void) | null = null;
export const authReady: Promise<void> = new Promise((res) => {
  resolveAuthReady = res;
});

export function getFirebaseAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    // Keep the session across reloads (default, but explicit).
    setPersistence(_auth, browserLocalPersistence).catch(() => {});
    onAuthStateChanged(_auth, () => {
      resolveAuthReady?.();
      resolveAuthReady = null;
    });
  }
  return _auth;
}

export function getDb(): Firestore {
  if (!_db) {
    // Auto-detect the transport: try the streaming channel, fall back to long
    // polling when it's blocked/buffered (common on mobile / proxied networks).
    // Auto-detect adapts per connection instead of forcing one transport for
    // everyone, avoiding both the "client is offline" fast-fail (WebChannel
    // blocked) and a permanently hung long-poll when a single mode is forced.
    _db = initializeFirestore(getFirebaseApp(), {
      experimentalAutoDetectLongPolling: true,
    });
  }
  return _db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (!_storage) _storage = getStorage(getFirebaseApp());
  return _storage;
}

/**
 * Initialize Firebase Analytics (browser-only, when a measurementId is set and
 * the environment supports it). Loaded dynamically so the analytics SDK isn't in
 * the main bundle. Safe to call once on the client; no-ops otherwise.
 */
export async function initAnalytics(): Promise<void> {
  if (typeof window === "undefined" || !firebaseConfigured || !config.measurementId) {
    return;
  }
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) getAnalytics(getFirebaseApp());
  } catch {
    /* analytics is optional — ignore failures */
  }
}
