/**
 * Shrink and recompress an image in the browser BEFORE it is uploaded to
 * Firebase Storage, so product photos load fast on slow connections and cost
 * nothing to serve (there is no server-side optimizer — Vercel image
 * optimization is off to keep the bill at zero). A 2–5 MB phone photo becomes
 * roughly 40–150 KB with no visible quality loss at product-card sizes.
 *
 * Why this is the right layer: the largest place a product image renders is a
 * ~256 px card (≈512 px at 2× retina) and the smallest is a 96 px thumbnail,
 * so a longest edge of ~800 px is already sharper than any display needs.
 * Uploading the raw multi-megapixel original just to show it at 96–256 px is
 * the entire reason a fresh reload took 3–5 s.
 *
 * Behaviour:
 * - Only rasterises bitmap photos. SVGs and non-images pass straight through
 *   (an SVG is already tiny and can't be canvas-resized meaningfully).
 * - Already-small files pass through untouched, so we never bloat a lean asset.
 * - EXIF orientation is baked in, so phone portraits stay upright.
 * - Re-encodes as WebP when the browser supports it, else JPEG.
 * - Fails safe: any error, or a result that isn't actually smaller, returns the
 *   original file so an upload is never blocked by optimisation.
 */
export async function downscaleImage(
  file: File,
  {
    maxDim = 800,
    quality = 0.8,
    skipUnderBytes = 150 * 1024,
  }: { maxDim?: number; quality?: number; skipUnderBytes?: number } = {}
): Promise<File> {
  if (typeof document === "undefined") return file; // SSR guard
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  if (file.size <= skipUnderBytes) return file;

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      source = await loadViaImg(file);
    } catch {
      return file;
    }
  }

  const srcW = source.width;
  const srcH = source.height;
  if (!srcW || !srcH) return file;

  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  const blob = await encode(canvas, quality);
  if (!blob || blob.size >= file.size) return file; // no real gain → keep original

  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const base = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${base}.${ext}`, { type: blob.type, lastModified: Date.now() });
}

/** Prefer WebP; fall back to JPEG if the browser can't encode WebP. */
function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === "image/webp") return resolve(webp);
        canvas.toBlob((jpeg) => resolve(jpeg ?? webp), "image/jpeg", quality);
      },
      "image/webp",
      quality
    );
  });
}

/** Fallback decode for browsers without createImageBitmap orientation support. */
function loadViaImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode failed"));
    };
    img.src = url;
  });
}
