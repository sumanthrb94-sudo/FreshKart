/**
 * Seed the Firestore catalog (39 products) using the Admin SDK, which bypasses
 * Security Rules — works whether your rules are locked or in test mode.
 *
 * Auth is phone/OTP (no email demo accounts), so this only seeds `products`.
 * The first buyer/admin profile is created when a real phone signs in; to make
 * yourself an admin, set `role: "ADMIN"` on your users/<uid> doc in the console.
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
 *   export FIREBASE_PROJECT_ID=freshkart-e0479
 *   npm run seed:firestore
 *
 * Or pass the service-account JSON inline via FIREBASE_SERVICE_ACCOUNT_JSON.
 * Idempotent — re-running overwrites the product docs.
 */
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PRODUCTS } from "../src/lib/mock-data";

const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;

initializeApp({
  credential: saJson ? cert(JSON.parse(saJson)) : applicationDefault(),
  projectId,
});

const db = getFirestore();

async function main() {
  console.log(`Seeding ${PRODUCTS.length} products into "${projectId ?? "(from credentials)"}"…`);
  const batch = db.batch();
  for (const { id, ...data } of PRODUCTS) {
    batch.set(db.collection("products").doc(id), data);
  }
  await batch.commit();
  console.log("✅ Catalog seeded.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  });
