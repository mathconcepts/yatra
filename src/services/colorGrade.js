/**
 * Per-frame color grade.
 *
 * Why this exists: the autoplan eng review caught that the original
 * design doc's "color LUT applied to map tiles via basemap variants"
 * approach won't work. ESRI tiles are raster, MapLibre style filters
 * only tint vector. A CSS filter on `map.getCanvas()` doesn't land in
 * the MP4 either because `preserveDrawingBuffer` snapshots the WebGL
 * framebuffer, not the styled DOM. The only path that actually shows
 * up in the exported video is a per-frame canvas pass run between the
 * MapLibre snapshot and the encoder.
 *
 * Implementation: apply a 4x4 color matrix (rows = output channels,
 * columns = input channels + bias) per pixel via ImageData. Reads each
 * palette's `color.lut`. Cheap (~3ms on a 720x1280 frame in Chrome).
 *
 * The function takes a CanvasRenderingContext2D + a 4x4 matrix and
 * mutates the canvas in place. Pure with respect to inputs other than
 * the canvas itself — same matrix on the same pixels always produces
 * the same output.
 */

/** Default identity matrix. Useful for callers that may pass null/undefined. */
export const IDENTITY_LUT = Object.freeze([
  [1, 0, 0, 0],
  [0, 1, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 1],
]);

/** Validate a LUT shape; returns null on success, error string on fail. */
export function validateLut(lut) {
  if (!Array.isArray(lut) || lut.length !== 4) return "lut must be a 4x4 matrix";
  for (let i = 0; i < 4; i++) {
    if (!Array.isArray(lut[i]) || lut[i].length !== 4) return `lut row ${i} must have 4 columns`;
    for (let j = 0; j < 4; j++) {
      if (typeof lut[i][j] !== "number" || !Number.isFinite(lut[i][j])) {
        return `lut[${i}][${j}] must be a finite number`;
      }
    }
  }
  return null;
}

/**
 * Apply the LUT to a row of RGBA bytes. Pure; exported for testing.
 * Mutates `data` in place. Same shape as ImageData.data.
 *
 * Math: out[c] = sum_k lut[c][k] * in[k] for k in {R, G, B, A}.
 * The 4th column is the bias when applied to alpha=1; for an alpha=255
 * input the column-3 entry doubles as a per-channel offset scaled by 1.
 *
 * Output is clamped to [0, 255] and rounded to integer bytes.
 */
export function applyLutToPixels(data, lut) {
  const err = validateLut(lut);
  if (err) throw new Error(err);
  const m00 = lut[0][0], m01 = lut[0][1], m02 = lut[0][2], m03 = lut[0][3];
  const m10 = lut[1][0], m11 = lut[1][1], m12 = lut[1][2], m13 = lut[1][3];
  const m20 = lut[2][0], m21 = lut[2][1], m22 = lut[2][2], m23 = lut[2][3];
  // Row 3 (alpha) is preserved as identity in practice; we still honor
  // the matrix so callers can fade if they want to.
  const m30 = lut[3][0], m31 = lut[3][1], m32 = lut[3][2], m33 = lut[3][3];

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const nr = m00 * r + m01 * g + m02 * b + m03 * a;
    const ng = m10 * r + m11 * g + m12 * b + m13 * a;
    const nb = m20 * r + m21 * g + m22 * b + m23 * a;
    const na = m30 * r + m31 * g + m32 * b + m33 * a;
    data[i] = nr < 0 ? 0 : nr > 255 ? 255 : nr | 0;
    data[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : ng | 0;
    data[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : nb | 0;
    data[i + 3] = na < 0 ? 0 : na > 255 ? 255 : na | 0;
  }
  return data;
}

/**
 * Color-grade a 2D canvas in place. Skips the work when the LUT is
 * identity (cheap fast path for tones that don't tint, like Explorer).
 *
 * `ctx` is a CanvasRenderingContext2D obtained from an HTMLCanvasElement
 * or an OffscreenCanvas. Width/height are read from `ctx.canvas`.
 */
export function gradeCanvas(ctx, lut) {
  if (!ctx || typeof ctx.getImageData !== "function") {
    throw new Error("gradeCanvas: ctx must be a CanvasRenderingContext2D");
  }
  const useLut = lut || IDENTITY_LUT;
  if (isIdentity(useLut)) return;
  const { width, height } = ctx.canvas;
  if (!width || !height) return;
  const img = ctx.getImageData(0, 0, width, height);
  applyLutToPixels(img.data, useLut);
  ctx.putImageData(img, 0, 0);
}

/** True iff `lut` is the identity matrix within floating-point tolerance. */
export function isIdentity(lut) {
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const want = i === j ? 1 : 0;
      if (Math.abs(lut[i][j] - want) > 1e-9) return false;
    }
  }
  return true;
}
