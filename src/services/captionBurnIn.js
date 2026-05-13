/**
 * Per-line caption burn-in.
 *
 * Why per-line and not per-scene: Instagram autoplay-muted is the
 * dominant feed reality. If narration is the artifact and the viewer's
 * speakers are off, scene-level captions leave the muted viewer staring
 * at silence. Per-line means one caption per narration line, held for
 * the scene duration, with fade timing from the tone palette.
 *
 * Why typeset on canvas and not as an MP4 subtitle track: WhatsApp's
 * compression strips subtitle tracks; Instagram doesn't render `.srt`
 * sidecar files in feed. The caption must be pixels in the frame.
 *
 * What this file does NOT do:
 *   - Generate caption text. That's the script's `captionText` field.
 *   - Pick fonts. That's the tone palette.
 *   - Decide WHEN to show a caption. That's the scene composer (it
 *     knows scene timing).
 *
 * What this file does:
 *   - Layout a caption on a 9:16 frame with the right safe-zone insets.
 *   - Draw it onto a CanvasRenderingContext2D with the palette's font,
 *     color, motion, and opacity.
 *   - Word-wrap to fit the caption inside the safe zone (Indic place
 *     names like "శ్రీ యాదగిరి గుట్ట" can run long).
 *
 * Safe zones come from the autoplan design review: Instagram's feed has
 * a top notch zone of ~220px and a bottom caption+handle gutter of
 * ~320px on a 1080×1920 export. Captions live inside [220, 1600].
 */

import { SUPPORTED_LANGUAGES } from "./tonePalettes/schema.js";

export const DEFAULT_INSETS_9x16 = Object.freeze({ top: 220, bottom: 320, side: 64 });

/**
 * Pick the right font face for a language. Falls back to Latin for
 * unknown languages.
 */
export function fontForLanguage(typography, language) {
  if (!typography) return "system-ui, sans-serif";
  switch (language) {
    case "hi": return typography.devanagari;
    case "te": return typography.telugu;
    case "ta": return typography.tamil;
    case "en":
    default: return typography.latin;
  }
}

/**
 * Pure: layout caption text into wrapped lines that fit in `maxWidth`,
 * given a font-measurement function. The measurer is injected so the
 * function is testable without a real canvas.
 *
 * Returns { lines, fontSizePx } — `fontSizePx` may be smaller than the
 * palette baseline if the caption was shrunk to fit.
 */
export function layoutCaption({
  text,
  baseSizePx,
  minSizePx = 22,
  maxWidth,
  maxLines = 3,
  measure,
}) {
  if (!text) return { lines: [], fontSizePx: baseSizePx };
  if (typeof measure !== "function") throw new Error("layoutCaption: measure fn required");
  let size = baseSizePx;
  while (size >= minSizePx) {
    const wrapped = wrapWords(text, maxWidth, (s) => measure(s, size));
    if (wrapped.length <= maxLines) return { lines: wrapped, fontSizePx: size };
    size -= 2;
  }
  // Could not fit in maxLines even at min size — keep the longest few
  // lines from the smallest attempt and accept truncation rather than
  // dropping the caption entirely.
  const wrapped = wrapWords(text, maxWidth, (s) => measure(s, minSizePx));
  return { lines: wrapped.slice(0, maxLines), fontSizePx: minSizePx };
}

/**
 * Greedy word wrap. Uses the provided width measurer; falls back to a
 * single line if no whitespace exists in the text.
 */
export function wrapWords(text, maxWidth, measureWidth) {
  const tokens = text.split(/(\s+)/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [];
  const lines = [];
  let current = "";
  for (const tok of tokens) {
    const candidate = current + tok;
    if (measureWidth(candidate) <= maxWidth || !current.trim()) {
      current = candidate;
    } else {
      lines.push(current.trimEnd());
      current = tok.trimStart();
    }
  }
  if (current.trim()) lines.push(current.trimEnd());
  return lines;
}

/**
 * Pure: compute the per-line opacity at progress `t` (0..1 across the
 * scene), given a fade-in/fade-out window. Used by the composer to
 * apply alpha during draw.
 */
export function captionOpacity({ tInScene, fadeInMs, fadeOutMs, sceneDurationMs }) {
  if (sceneDurationMs <= 0) return 0;
  const elapsed = tInScene * sceneDurationMs;
  const remaining = sceneDurationMs - elapsed;
  if (elapsed < fadeInMs) return Math.max(0, elapsed / fadeInMs);
  if (remaining < fadeOutMs) return Math.max(0, remaining / fadeOutMs);
  return 1;
}

/**
 * Draw a caption onto a 2D canvas context. Mutates the canvas in place.
 *
 * `scene` is one entry from the script-generator's `scenes` array
 * (`{ captionText, captionStyle }`). `palette` is from tonePalettes.
 *
 * `tInScene` is progress 0..1 within the scene; used for fade.
 */
export function drawCaption(ctx, { scene, palette, language, tInScene = 0.5, insets = DEFAULT_INSETS_9x16 }) {
  if (!ctx || typeof ctx.fillText !== "function") {
    throw new Error("drawCaption: ctx must be a 2D canvas context");
  }
  if (!scene || !scene.captionText) return;
  if (!palette) throw new Error("drawCaption: palette required");
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`drawCaption: unsupported language ${language}`);
  }

  const { width, height } = ctx.canvas;
  const isHeadline = scene.captionStyle === "headline";
  const baseSize = isHeadline ? palette.typography.titleSize : palette.typography.baseSize;
  const fontFace = fontForLanguage(palette.typography, language);
  const fadeMs = palette.caption.fadeMs ?? 600;
  const holdMs = palette.caption.holdMs ?? 1500;
  const sceneDurationMs = Math.max(1, (scene.tEnd - scene.tStart) * 1000);

  const maxWidth = width - 2 * insets.side;

  // Measurer closure — only available when we have a real ctx, which we
  // do here. layoutCaption stays pure so tests can fake the measurer.
  const measure = (s, sizePx) => {
    ctx.save();
    ctx.font = `${sizePx}px ${fontFace}`;
    const w = ctx.measureText(s).width;
    ctx.restore();
    return w;
  };

  const { lines, fontSizePx } = layoutCaption({
    text: scene.captionText,
    baseSizePx: baseSize,
    maxWidth,
    measure,
  });
  if (lines.length === 0) return;

  const lineHeight = Math.round(fontSizePx * (palette.typography.lineHeight ?? 1.4));
  const blockHeight = lineHeight * lines.length;
  // Caption anchors to the lower-third inside the safe zone.
  const safeBottom = height - insets.bottom;
  const blockTop = Math.max(insets.top, safeBottom - blockHeight - 40);

  const alpha = captionOpacity({ tInScene, fadeInMs: fadeMs, fadeOutMs: fadeMs, sceneDurationMs: Math.max(sceneDurationMs - 2 * holdMs, fadeMs * 2) });

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${fontSizePx}px ${fontFace}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  // Translucent ink strip behind text so it stays readable over the
  // map. Drawn once behind the whole block.
  ctx.fillStyle = palette.color.ink + "cc"; // ~80% alpha hex
  const padX = 24;
  const padY = 16;
  const stripWidth = Math.min(maxWidth + padX * 2, width);
  const stripX = (width - stripWidth) / 2;
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(stripX, blockTop - padY, stripWidth, blockHeight + padY * 2, 12);
    ctx.fill();
  } else {
    ctx.fillRect(stripX, blockTop - padY, stripWidth, blockHeight + padY * 2);
  }

  ctx.fillStyle = palette.color.parchment;
  const cx = width / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], cx, blockTop + i * lineHeight);
  }
  ctx.restore();
}
