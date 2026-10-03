process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "AIzaSyDyzw_2drbin8Hn0kK2y_C7D72vOGpbPuY";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "freshkart-e0479.firebaseapp.com";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "freshkart-e0479";
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "freshkart-e0479.firebasestorage.app";
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "1012666773826";
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:1012666773826:web:42146d2aa7e232acdc18db";

import { initializeApp as initAdmin, cert } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

const saPath = path.resolve(__dirname, "../serviceAccount.json");
const sa = JSON.parse(fs.readFileSync(saPath, "utf8"));

async function simulate() {
  console.log("=== STARTING FIREBASE LIVE SIMULATION TEST ===");

  const { signInWithCustomToken, signOut } = await import("firebase/auth");
  const { doc, getDoc } = await import("firebase/firestore");
  const { getFirebaseAuth, getDb } = await import("../src/lib/firebase/client");
  const { FirebaseDataSource } = await import("../src/lib/api/firebase");

  // 1. Init Admin SDK
  const adminApp = initAdmin({
    credential: cert(sa),
    projectId: "freshkart-e0479",
  }, "simulation-admin");
  const adminAuth = getAdminAuth(adminApp);
  const adminDb = getAdminFirestore(adminApp);

  // 2. Client SDK initialized via getFirebaseAuth / getDb
  const clientAuth = getFirebaseAuth();
  const clientDb = getDb();

  const ADMIN_UID = "Xnkp5QJDfwSj2tkaDZ5DFgiRw972";
  const BUYER_UID = "0ACOCAWDnbdVT3jfrGaLTJlGQzB3";

  console.log("\n1. Generating Admin custom token for:", ADMIN_UID);
  const adminToken = await adminAuth.createCustomToken(ADMIN_UID);

  console.log("2. Signing into Client SDK as Admin...");
  const adminUserCredential = await signInWithCustomToken(clientAuth, adminToken);
  console.log("   Signed in as Admin:", adminUserCredential.user.uid, adminUserCredential.user.email);

  // Pick two sample products to assign
  const productsSnap = await adminDb.collection("products").limit(2).get();
  if (productsSnap.empty) {
    throw new Error("No products found in Firestore to test with.");
  }
  const sampleProductIds = productsSnap.docs.map((d) => d.id);
  const originalCategories = productsSnap.docs.map((d) => d.data().category || "vegetables");
  console.log("   Sample products for test:", sampleProductIds);

  const api = new FirebaseDataSource();

  // Test Listing Categories
  console.log("\n3. Testing listCategories()...");
  const categoriesInitial = await api.listCategories();
  console.log("   Categories count:", categoriesInitial.length);
  console.log("   Categories:", categoriesInitial.map((c) => `${c.id} (${c.name})`).join(", "));

  // Test Adding Category with Product Assignment
  const testCatName = `Test Exotic ${Date.now() % 10000}`;
  console.log(`\n4. Testing createCategory("${testCatName}", [${sampleProductIds.join(", ")}])...`);
  const createdCategory = await api.createCategory({
    name: testCatName,
    productIds: sampleProductIds,
  });
  console.log("   ✅ Category created successfully:", createdCategory);

  // Verify in Firestore directly
  const createdDocSnap = await adminDb.collection("categories").doc(createdCategory.id).get();
  if (!createdDocSnap.exists) {
    throw new Error(`Category document ${createdCategory.id} not found in Firestore!`);
  }
  console.log("   ✅ Verified category document exists in Firestore:", createdDocSnap.data());

  // Verify products have the new category
  for (const pid of sampleProductIds) {
    const pSnap = await adminDb.collection("products").doc(pid).get();
    const pData = pSnap.data();
    if (pData?.category !== createdCategory.id) {
      throw new Error(`Product ${pid} category is ${pData?.category}, expected ${createdCategory.id}`);
    }
  }
  console.log("   ✅ Verified assigned products updated to category:", createdCategory.id);

  // Verify listCategories now includes it
  const categoriesAfterAdd = await api.listCategories();
  const found = categoriesAfterAdd.find((c) => c.id === createdCategory.id);
  if (!found) throw new Error("Newly created category not found in listCategories!");
  console.log("   ✅ listCategories() contains newly created category:", found.name);

  // Test Deleting Category with Fallback
  console.log(`\n5. Testing deleteCategory("${createdCategory.id}", "vegetables")...`);
  await api.deleteCategory(createdCategory.id, "vegetables");
  console.log("   ✅ deleteCategory() completed without error.");

  // Verify in Firestore that category doc is deleted
  const deletedDocSnap = await adminDb.collection("categories").doc(createdCategory.id).get();
  if (deletedDocSnap.exists) {
    throw new Error(`Category document ${createdCategory.id} still exists in Firestore after deletion!`);
  }
  console.log("   ✅ Verified category document was removed from Firestore.");

  // Verify assigned products were reassigned to fallback
  for (let i = 0; i < sampleProductIds.length; i++) {
    const pid = sampleProductIds[i];
    const pSnap = await adminDb.collection("products").doc(pid).get();
    const pData = pSnap.data();
    if (pData?.category !== "vegetables") {
      throw new Error(`Product ${pid} was not reassigned to fallback "vegetables"! Found: ${pData?.category}`);
    }
    // Restore original category if needed
    if (originalCategories[i] !== "vegetables") {
      await adminDb.collection("products").doc(pid).update({ category: originalCategories[i] });
    }
  }
  console.log("   ✅ Verified products safely reassigned to fallback 'vegetables'.");

  // Sign out admin
  await signOut(clientAuth);
  console.log("\n6. Signed out Admin.");

  // Test Negative Case: Non-Admin Buyer Permissions
  console.log("\n7. Testing Non-Admin (Buyer) permissions...");
  const buyerToken = await adminAuth.createCustomToken(BUYER_UID);
  await signInWithCustomToken(clientAuth, buyerToken);
  console.log("   Signed in as Buyer:", BUYER_UID);

  let caughtError = false;
  try {
    await api.createCategory("Unauthorized Category");
  } catch (err: any) {
    caughtError = true;
    console.log("   ✅ Unauthorized createCategory correctly rejected with:", err.message || err.code);
  }
  if (!caughtError) {
    throw new Error("Security failure: Buyer was able to create a category!");
  }

  let caughtDeleteError = false;
  try {
    await api.deleteCategory("vegetables");
  } catch (err: any) {
    caughtDeleteError = true;
    console.log("   ✅ Unauthorized deleteCategory correctly rejected with:", err.message || err.code);
  }
  if (!caughtDeleteError) {
    throw new Error("Security failure: Buyer was able to delete a category!");
  }

  await signOut(clientAuth);
  console.log("\n=== ALL SIMULATION TESTS PASSED SUCCESSFULLY! ===");
}

simulate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌ SIMULATION TEST FAILED:", err);
    process.exit(1);
  });
