import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "./client";

/**
 * Upload a product image to Firebase Storage under `products/{productId}/...`.
 * Storage rules require an admin role and an image content type under 5 MB.
 * Returns the public download URL.
 */
export async function uploadProductImage(
  file: File,
  productId = "new"
): Promise<string> {
  const storage = getFirebaseStorage();
  const safeName = file.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `products/${productId}/${Date.now()}-${safeName}`;
  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return getDownloadURL(imageRef);
}
