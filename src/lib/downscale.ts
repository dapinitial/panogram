// Client-side pano downscaling (browser APIs only — import from client
// components). The Osmo 360's 120MP stills are ~15,000px wide: past every
// mobile GPU's texture cap and a ~40MB download for every viewer. We resize
// to a viewer-safe width at upload time.
//
// ORDER MATTERS: canvas re-encoding strips EXIF/XMP, so capture-geo
// extraction (lib/exif.ts) must run on the ORIGINAL file before this.

const TARGET_W = 8192;   // common WebGL max-texture size — safe almost everywhere
const FALLBACK_W = 4096; // older iOS canvas limits — always works
const JPEG_QUALITY = 0.88;

async function encodeAt(bitmap: ImageBitmap, width: number, name: string): Promise<File> {
  const height = Math.round((bitmap.height / bitmap.width) * width);
  const scaled = await createImageBitmap(bitmap, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: "high",
  });
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(scaled, 0, 0);
  scaled.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  return new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

/**
 * Returns a viewer-safe version of an uploaded image: originals at or under
 * the target width pass through untouched; larger ones re-encode as JPEG at
 * TARGET_W (FALLBACK_W if the device can't handle the big canvas). Any
 * failure returns the original — downscaling is an optimization, never a
 * gate. Videos and non-images pass through.
 */
export async function downscaleForViewer(file: File): Promise<{ file: File; resized: boolean }> {
  if (!file.type.startsWith("image/")) return { file, resized: false };
  try {
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width <= TARGET_W) return { file, resized: false };
      try {
        return { file: await encodeAt(bitmap, TARGET_W, file.name), resized: true };
      } catch {
        return { file: await encodeAt(bitmap, FALLBACK_W, file.name), resized: true };
      }
    } finally {
      bitmap.close();
    }
  } catch {
    return { file, resized: false }; // undecodable here — let storage take the original
  }
}
