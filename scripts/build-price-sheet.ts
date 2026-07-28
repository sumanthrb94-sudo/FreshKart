/**
 * One-time (and re-runnable) migration: build `settings/priceSheet` from the
 * CURRENT `products` collection's live prices, using the Admin SDK (bypasses
 * Security Rules).
 *
 * `settings/priceSheet` is what the order-create rule reads to validate item
 * prices — a single get() call for the whole cart instead of one get() per
 * line item, which is what lets orders carry more than ~15 distinct products
 * (previously capped by Firestore's get()-call budget per rule evaluation).
 *
 * MUST be run BEFORE publishing a firestore.rules version that reads
 * settings/priceSheet. If that document doesn't exist yet when the new rules
 * go live, every single order create will fail — worse than the item-count
 * bug this migration fixes. Going forward, updateProduct/createProduct/
 * updateProductPrices in src/lib/api/firebase.ts keep this doc in sync
 * automatically; this script is only needed for the initial backfill (or to
 * repair the doc if it's ever suspected to have drifted).
 *
 * Usage (same credentials as seed-firestore.ts):
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
 *   export FIREBASE_PROJECT_ID=freshkart-e0479
 *   npm run build-price-sheet
 *
 * Or pass the service-account JSON inline via FIREBASE_SERVICE_ACCOUNT_JSON.
 */
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
  console.log(`Reading live product prices from "${projectId ?? "(from credentials)"}"…`);
  const snap = await db.collection("products").get();

  const prices: Record<string, number> = {};
  for (const doc of snap.docs) {
    const price = doc.data().price;
    if (typeof price !== "number") {
      console.warn(`  ⚠ product "${doc.id}" has no numeric price — skipping`);
      continue;
    }
    prices[doc.id] = price;
  }

  await db.doc("settings/priceSheet").set({ prices }, { merge: true });
  console.log(`✅ settings/priceSheet now has ${Object.keys(prices).length} product price(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Build failed:", e);
    process.exit(1);
  });
