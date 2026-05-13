/**
 * Scene composer — wraps the per-frame work that runs between the
 * MapLibre snapshot and the MP4 encoder.
 *
 * Pipeline (per frame):
 *   1. reelRenderer.captureFrame(t) returns an ImageBitmap (or canvas)
 *   2. composeFrame(...) draws it onto a working canvas
 *   3. gradeCanvas applies the tone palette's color LUT
 *   4. drawCaption burns in the active scene's caption line
 *   5. the working canvas's ImageBitmap is what gets fed to the encoder
 *
 * Why this is a separate file: keeping the per-frame compositor in one
 * pure place means the MP4 export path, the Reels live preview, and the
 * postcard cover frame can all share the same code. Reels can skip the
 * caption pass; the postcard skips the color LUT; both can call the
 * subset they want.
 *
 * The composer NEVER touches MapLibre, NEVER calls the Worker, NEVER
 * decodes audio. It is a pure function over (frame, scene, palette) ->
 * graded+captioned frame.
 */

import { gradeCanvas } from "./colorGrade.js";
import { drawCaption, DEFAULT_INSETS_9x16 } from "./captionBurnIn.js";

/**
 * Find the scene whose [tStart, tEnd) contains absolute time `tSeconds`.
 * Returns null if no scene matches. Pure, exported for tests.
 */
export function findActiveScene(scenes, tSeconds) {
  if (!Array.isArray(scenes) || scenes.length === 0) return null;
  for (const s of scenes) {
    if (typeof s.tStart !== "number" || typeof s.tEnd !== "number") continue;
    if (tSeconds >= s.tStart && tSeconds < s.tEnd) return s;
  }
  // After the last scene's tEnd, return the last scene so the final
  // caption holds through any trailing tail of the video.
  return scenes[scenes.length - 1];
}

/**
 * Compute progress within a scene (0..1). Clamps. Pure.
 */
export function progressInScene(scene, tSeconds) {
  if (!scene) return 0;
  const dur = scene.tEnd - scene.tStart;
  if (dur <= 0) return 0;
  const p = (tSeconds - scene.tStart) / dur;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

/**
 * Compose one frame onto a target 2D canvas context.
 *
 * Inputs:
 *   ctx           — CanvasRenderingContext2D of the working/output canvas
 *   sourceFrame   — ImageBitmap, HTMLCanvasElement, or OffscreenCanvas to draw
 *   scenes        — full scene list from the script generator
 *   tSeconds      — absolute timestamp in the reel
 *   palette       — tone palette (see tonePalettes/)
 *   language      — one of SUPPORTED_LANGUAGES; controls caption font
 *   options.skipGrade   — true to skip the color LUT pass
 *   options.skipCaption — true to skip the caption pass
 *   options.insets      — override DEFAULT_INSETS_9x16
 *
 * Mutates `ctx` in place. Returns the scene that was rendered (or null
 * if no scene matched) so the caller can introspect.
 */
export function composeFrame(
  ctx,
  { sourceFrame, scenes, tSeconds, palette, language, options = {} } = {},
) {
  if (!ctx || typeof ctx.drawImage !== "function") {
    throw new Error("composeFrame: ctx must be a 2D canvas context");
  }
  if (!palette) throw new Error("composeFrame: palette required");
  if (!language) throw new Error("composeFrame: language required");

  const { width, height } = ctx.canvas;
  if (sourceFrame) {
    ctx.drawImage(sourceFrame, 0, 0, width, height);
  }

  if (!options.skipGrade) {
    gradeCanvas(ctx, palette.color?.lut);
  }

  const scene = findActiveScene(scenes, tSeconds);
  if (!options.skipCaption && scene) {
    const tInScene = progressInScene(scene, tSeconds);
    drawCaption(ctx, {
      scene,
      palette,
      language,
      tInScene,
      insets: options.insets || DEFAULT_INSETS_9x16,
    });
  }

  return scene;
}
