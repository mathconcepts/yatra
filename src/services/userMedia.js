/**
 * User media uploads — 0-3 photos, optional, scene inserts.
 *
 * The Director pipeline (M2) consumes a list of ImageBitmap-like
 * objects. The wizard collects File objects from <input type=file>;
 * this module turns them into bitmaps + caches blob URLs the renderer
 * can paint over a scene frame.
 *
 * Validation: max 5 MB per file (Android browsers struggle past that),
 * JPEG/PNG/WebP only, max 3 photos per render.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 3;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export class MediaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Pure: validate one file. Throws MediaError on rejection. Async because
 * a future revision may sniff signature bytes; for now it's sync work
 * wrapped in a Promise so the wizard can chain .then().
 */
export async function validateFile(file) {
  if (!file || typeof file !== "object") throw new MediaError("missing", "No file provided");
  if (typeof file.size !== "number") throw new MediaError("invalid", "File is not a real upload");
  if (file.size > MAX_FILE_BYTES) {
    throw new MediaError("too-big", `${file.name || "Photo"} is over 5 MB. Resize and try again.`);
  }
  if (!ALLOWED.has(file.type)) {
    throw new MediaError("wrong-type", `${file.name || "Photo"} is not JPEG/PNG/WebP.`);
  }
  return true;
}

/**
 * Browser-side: decode a File into an ImageBitmap. Falls back to
 * an HTMLImageElement when ImageBitmap is unavailable.
 */
export async function decodeFile(file) {
  await validateFile(file);
  if (typeof createImageBitmap === "function") {
    return await createImageBitmap(file);
  }
  // Fallback path. Rare on modern Android Chrome.
  const url = URL.createObjectURL(file);
  return await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new MediaError("decode", `Image decode failed: ${e?.message || e}`));
    img.src = url;
  });
}

/**
 * Decode an array of Files into bitmaps in parallel. Partial successes
 * are valuable — failed files come back as { file, error: MediaError }.
 */
export async function decodeMany(files) {
  if (!Array.isArray(files)) return [];
  if (files.length > MAX_PHOTOS) {
    files = files.slice(0, MAX_PHOTOS);
  }
  return Promise.all(files.map(async (file) => {
    try {
      return { file, bitmap: await decodeFile(file) };
    } catch (err) {
      return { file, error: err instanceof MediaError ? err : new MediaError("decode", String(err)) };
    }
  }));
}

/**
 * Pure: assign each photo to one POI in the tour. Strategy: photo[i] →
 * POI[i] (first photo → first POI in tour order). Photos past the POI
 * count are dropped with a warning. POIs without a photo get null.
 *
 * Returns Map<poiId, bitmap | null>.
 */
export function assignPhotosToPois(photos, pois) {
  const out = new Map();
  if (!Array.isArray(pois)) return out;
  const decoded = (photos || []).filter((p) => p?.bitmap);
  pois.forEach((p, i) => {
    out.set(p.id, decoded[i]?.bitmap || null);
  });
  return out;
}

export const MEDIA_LIMITS = { MAX_FILE_BYTES, MAX_PHOTOS, ALLOWED: Array.from(ALLOWED) };
