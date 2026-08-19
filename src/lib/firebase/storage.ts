import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "./client";
import { downscaleImage } from "@/lib/image/downscale";

/**
 * Upload a product image to Firebase Storage under `products/{productId}/...`.
 * Storage rules require an admin role and an image content type under 5 MB.
 * Returns the public download URL.
 *
 * The raw camera photo is downscaled and recompressed in the browser first
 * (multi-megapixel original → ~40–150 KB). Because these images are served
 * straight from Storage with no server-side optimiser, that shrink is what
 * lets a fresh shop reload paint in 1–2 s on a slow connection instead of
 * waiting on full-resolution originals, and it cuts Storage bandwidth too.
 */
export async function uploadProductImage(
  file: File,
  productId = "new"
): Promise<string> {
  const optimized = await downscaleImage(file).catch(() => file);
  const storage = getFirebaseStorage();
  const safeName = optimized.name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const path = `products/${productId}/${Date.now()}-${safeName}`;
  const imageRef = ref(storage, path);
  await uploadBytes(imageRef, optimized, { contentType: optimized.type });
  return getDownloadURL(imageRef);
}
