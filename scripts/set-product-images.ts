/**
 * Set ONLY the `imageUrl` field on each catalog product in Firestore, using
 * the Admin SDK (bypasses Security Rules). Unlike `seed-firestore.ts`, this
 * never touches price/stock/active/etc. — it's a targeted field update, safe
 * to run even if live prices or stock have since diverged from the seed
 * defaults in mock-data.ts.
 *
 * Usage (same credentials as seed-firestore.ts):
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
 *   export FIREBASE_PROJECT_ID=freshkart-e0479
 *   npm run set-product-images
 *
 * Or pass the service-account JSON inline via FIREBASE_SERVICE_ACCOUNT_JSON.
 * Only updates products whose doc id already exists — never creates one.
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
  console.log(`Setting imageUrl on ${PRODUCTS.length} products in "${projectId ?? "(from credentials)"}"…`);
  const col = db.collection("products");
  const existing = await col.listDocuments();
  const existingIds = new Set(existing.map((d) => d.id));

  const batch = db.batch();
  let updated = 0;
  let skipped = 0;
  for (const { id, imageUrl } of PRODUCTS) {
    if (!imageUrl) continue;
    if (!existingIds.has(id)) {
      console.warn(`  ⚠ no live product with id "${id}" — skipping`);
      skipped++;
      continue;
    }
    batch.update(col.doc(id), { imageUrl });
    updated++;
  }
  await batch.commit();
  console.log(`✅ Updated ${updated} product photo(s).${skipped ? ` Skipped ${skipped} (no matching live product).` : ""}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Update failed:", e);
    process.exit(1);
  });
