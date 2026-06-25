/**
 * Seed the catalog using the Firebase WEB SDK (no service account needed).
 * Works while Firestore writes are allowed — i.e. Firestore is in TEST MODE,
 * or your rules permit the write. Reads config from .env.local.
 *
 *   npm run seed:firestore:client
 *
 * If your rules are locked (production mode), use the Admin SDK seed instead
 * (`npm run seed:firestore`) or open Firestore test mode temporarily.
 */
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, writeBatch } from "firebase/firestore";
import { PRODUCTS } from "../src/lib/mock-data";

// Minimal .env.local loader (so the web config is available in this script).
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env.local — rely on existing env */
}

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

if (!config.apiKey || !config.projectId) {
  console.error("❌ Missing NEXT_PUBLIC_FIREBASE_* config in .env.local");
  process.exit(1);
}

const db = getFirestore(initializeApp(config));

async function main() {
  console.log(`Seeding ${PRODUCTS.length} products into "${config.projectId}" (web SDK)…`);
  const batch = writeBatch(db);
  for (const { id, ...data } of PRODUCTS) {
    batch.set(doc(db, "products", id), data);
  }
  await batch.commit();
  console.log("✅ Catalog seeded.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Seed failed (are Firestore writes allowed / test mode on?):", e?.message ?? e);
    process.exit(1);
  });
