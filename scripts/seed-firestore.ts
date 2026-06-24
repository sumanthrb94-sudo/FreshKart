/**
 * Seed a Firebase project with the FreshKart catalog, demo accounts and sample
 * orders. Uses the Admin SDK (bypasses Security Rules).
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
 *   export FIREBASE_PROJECT_ID=your-project-id        # or rely on the SA file
 *   npm run seed:firestore
 *
 * Alternatively pass the service account JSON inline via
 *   FIREBASE_SERVICE_ACCOUNT_JSON='{"project_id":...}'
 *
 * It is idempotent — re-running updates existing docs/users.
 */
import { initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { DEMO_PASSWORD, ORDERS, PRODUCTS, USERS } from "../src/lib/mock-data";

const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT;

initializeApp({
  credential: saJson ? cert(JSON.parse(saJson)) : applicationDefault(),
  projectId,
});

const auth = getAuth();
const db = getFirestore();

async function seedUsers() {
  for (const user of USERS) {
    const { id, ...profile } = user;
    // Auth user (uid == our user id so the Firestore doc id lines up).
    try {
      await auth.createUser({
        uid: id,
        email: user.email,
        password: DEMO_PASSWORD,
        displayName: user.name,
      });
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code.includes("already-exists") || code.includes("email-already-exists")) {
        await auth.updateUser(id, { email: user.email, password: DEMO_PASSWORD });
      } else {
        throw e;
      }
    }
    await db.collection("users").doc(id).set(profile, { merge: true });
    console.log(`  · user ${user.email} (${user.role})`);
  }
}

async function seedCollection<T extends { id: string }>(name: string, rows: T[]) {
  const batch = db.batch();
  for (const row of rows) {
    const { id, ...data } = row;
    batch.set(db.collection(name).doc(id), data);
  }
  await batch.commit();
  console.log(`  · ${rows.length} ${name}`);
}

async function main() {
  console.log(`Seeding Firebase project "${projectId ?? "(from credentials)"}"…`);
  console.log("Users:");
  await seedUsers();
  console.log("Products:");
  await seedCollection("products", PRODUCTS);
  console.log("Orders:");
  await seedCollection("orders", ORDERS);
  console.log("\n✅ Seed complete. Demo password for all accounts:", DEMO_PASSWORD);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\n❌ Seed failed:", e);
    process.exit(1);
  });
