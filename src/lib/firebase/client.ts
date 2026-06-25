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

function getFirebaseApp(): FirebaseApp {
  if (!firebaseConfigured) {
    throw new Error("Firebase is not configured (missing NEXT_PUBLIC_FIREBASE_* env).");
  }
  if (!app) app = getApps().length ? getApp() : initializeApp(config);
  return app;
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
