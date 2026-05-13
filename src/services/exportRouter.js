/**
 * Universal export router (v3.4 Slice R / P5).
 *
 * Given a target format + aspect, route to the right rendering pipeline.
 *
 *   - PNG: snapshot the supplied canvas / map.getCanvas() → blob URL
 *   - MP4 (9:16 / 1:1 / 16:9): use the offscreen ReelRenderer + mp4Export
 *
 * GIF and animated WebP are deferred (need additional encoders).
 *
 * Pure helpers (`aspectToDimensions`, `validateFormat`) are exported for
 * unit tests so we don't need WebCodecs to verify the routing logic.
 */

export const SUPPORTED_FORMATS = ["png", "mp4"];
export const SUPPORTED_ASPECTS = ["9:16", "1:1", "16:9"];

export function validateFormat(fmt) {
  return SUPPORTED_FORMATS.includes(fmt);
}

export function validateAspect(asp) {
  return SUPPORTED_ASPECTS.includes(asp);
}

/**
 * Pure: aspect string → {width, height}. Defaults to 720×1280 for 9:16.
 * 1:1 = 1080×1080, 16:9 = 1280×720. Pick standard social-friendly sizes.
 */
export function aspectToDimensions(aspect) {
  switch (aspect) {
    case "1:1": return { width: 1080, height: 1080 };
    case "16:9": return { width: 1280, height: 720 };
    case "9:16":
    default: return { width: 720, height: 1280 };
  }
}

/**
 * Snapshot a canvas to PNG blob URL.
 * Caller passes a canvas (e.g., map.getCanvas() from a Reel/Atlas
 * MapLibre instance).
 */
export async function exportPng(canvas) {
  if (!canvas || typeof canvas.toBlob !== "function") {
    throw new Error("No canvas to export");
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("PNG encode failed");
  return URL.createObjectURL(blob);
}

/**
 * Render an MP4 at the requested aspect from a config.
 * Reuses the existing ReelRenderer + mp4Export pipelines.
 */
export async function exportMp4({ config, aspect = "9:16", narrationUrl = null, onProgress = null } = {}) {
  if (!config) throw new Error("No config to export");
  if (!validateAspect(aspect)) throw new Error(`Unsupported aspect: ${aspect}`);
  const { width, height } = aspectToDimensions(aspect);
  const { createOffscreenReelRenderer } = await import("./reelRenderer.js");
  const { framePlan, encodeMp4 } = await import("./mp4Export.js");

  const plan = framePlan({ fps: 24, durationSec: 16 });
  const renderer = await createOffscreenReelRenderer(config, { width, height });
  const frames = [];
  try {
    for (let i = 0; i < plan.totalFrames; i++) {
      const t = i / plan.totalFrames;
      const bm = await renderer.captureFrame(t);
      frames.push(bm);
      if (typeof onProgress === "function" && i % 4 === 0) {
        onProgress({ stage: "render", frame: i + 1, total: plan.totalFrames });
      }
    }
    const audioBlob = narrationUrl ? await fetch(narrationUrl).then((r) => r.blob()) : null;
    const url = await encodeMp4(frames, {
      fps: plan.fps,
      width, height,
      audioBlob,
      onProgress: (n, total) => onProgress?.({ stage: "encode", frame: n, total }),
    });
    return url;
  } finally {
    frames.forEach((f) => f.close?.());
    renderer.destroy();
  }
}

/**
 * Top-level router: pick format + aspect, call the right exporter.
 */
export async function exportArtifact({ format, aspect, canvas, config, narrationUrl, onProgress } = {}) {
  if (!validateFormat(format)) throw new Error(`Unsupported format: ${format}`);
  if (format === "png") return exportPng(canvas);
  if (format === "mp4") return exportMp4({ config, aspect, narrationUrl, onProgress });
  throw new Error(`Unhandled format: ${format}`);
}
