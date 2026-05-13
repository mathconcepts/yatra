/**
 * Postcard export — a single 9:16 still designed to be the share OG image
 * and the WhatsApp preview thumbnail.
 *
 * Why this is its own file (and not folded into exportRouter):
 * the autoplan design review called this out as the most-shareable
 * artifact per byte. Stills survive WhatsApp's compression where MP4s
 * get crushed; the OG image carries 80% of the in-feed storytelling
 * before anyone taps play. The postcard is also the canonical first
 * frame of every Director MP4, so the same render must work as both a
 * standalone PNG and a video frame.
 *
 * Layout (1080×1920 logical, scales linearly to 720×1280 export):
 *
 *   ┌──────────────────────────┐ ← top safe-zone inset (220px)
 *   │   hero region (55%)      │   map snapshot or first landmark photo
 *   │                          │
 *   │   route title            │   palette.typography.titleSize
 *   │   subtitle/stats         │   palette.typography.baseSize
 *   │   ornament (mandala)     │   palette.ornament.accentColor
 *   └──────────────────────────┘ ← bottom safe-zone inset (320px)
 *
 * Pure functions:
 *   - formatStatsLine: route → human-readable distance/elevation string
 *     localized to the requested language (digits and unit suffixes)
 *   - layoutPostcard: width/height + palette → region rectangles
 *
 * Side-effecting:
 *   - drawPostcard: paints onto a 2D canvas ctx
 *   - exportPostcard: orchestrator that creates a canvas, draws, returns blob URL
 */

import { fontForLanguage, layoutCaption, DEFAULT_INSETS_9x16 } from "./captionBurnIn.js";
import { SUPPORTED_LANGUAGES } from "./tonePalettes/schema.js";

/**
 * Localized digit + unit strings. Indic scripts often use their own
 * digit forms; for share-image legibility on cross-script audiences we
 * stick to Latin digits and translate only the unit suffix. Telugu /
 * Tamil / Hindi all read Latin digits fluently in 2026 — translating
 * "km" → "కిమీ" is a smaller change with more cultural fit than
 * substituting numerals.
 */
const UNIT_LABELS = {
  km: { en: "km", te: "కిమీ", hi: "किमी", ta: "கி.மீ" },
  m: { en: "m", te: "మీ", hi: "मी", ta: "மீ" },
  hr: { en: "hr", te: "గం", hi: "घंटे", ta: "மணி" },
  climb: { en: "climb", te: "ఎక్కువ", hi: "चढ़ाई", ta: "ஏற்றம்" },
};

/** Pure: format a route's stats into one localized line. */
export function formatStatsLine({ distanceKm, durationHr, elevGainM, language = "en" } = {}) {
  const lang = SUPPORTED_LANGUAGES.includes(language) ? language : "en";
  const parts = [];
  if (Number.isFinite(distanceKm) && distanceKm > 0) {
    parts.push(`${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} ${UNIT_LABELS.km[lang]}`);
  }
  if (Number.isFinite(durationHr) && durationHr > 0) {
    parts.push(`~${durationHr.toFixed(durationHr < 2 ? 1 : 0)} ${UNIT_LABELS.hr[lang]}`);
  }
  if (Number.isFinite(elevGainM) && elevGainM > 0) {
    parts.push(`+${Math.round(elevGainM)} ${UNIT_LABELS.m[lang]} ${UNIT_LABELS.climb[lang]}`);
  }
  return parts.join("  ·  ");
}

/** Pure: compute the region rectangles given canvas size and palette. */
export function layoutPostcard({ width, height, palette, insets = DEFAULT_INSETS_9x16 }) {
  if (!width || !height || !palette) throw new Error("layoutPostcard: width, height, palette required");
  // Scale insets proportionally if the canvas isn't 1080×1920 baseline.
  const baselineH = 1920;
  const scale = height / baselineH;
  const top = Math.round(insets.top * scale);
  const bottom = Math.round(insets.bottom * scale);
  const side = Math.round(insets.side * scale);
  const inner = {
    x: side,
    y: top,
    w: width - 2 * side,
    h: height - top - bottom,
  };
  // 55% hero, 18% title block, 12% subtitle block, 15% ornament breathing room.
  const heroH = Math.round(inner.h * 0.55);
  const titleH = Math.round(inner.h * 0.18);
  const subtitleH = Math.round(inner.h * 0.12);
  const ornamentH = inner.h - heroH - titleH - subtitleH;
  return {
    canvas: { width, height },
    insets: { top, bottom, side },
    hero: { x: inner.x, y: inner.y, w: inner.w, h: heroH },
    title: { x: inner.x, y: inner.y + heroH + 16, w: inner.w, h: titleH },
    subtitle: { x: inner.x, y: inner.y + heroH + titleH + 16, w: inner.w, h: subtitleH },
    ornament: { x: inner.x, y: inner.y + heroH + titleH + subtitleH + 16, w: inner.w, h: ornamentH },
  };
}

/**
 * Draw a postcard onto a 2D canvas context. Mutates `ctx` in place.
 *
 * Inputs:
 *   ctx          — 2D context of an output canvas (size taken from ctx.canvas)
 *   sourceFrame  — optional map snapshot / hero photo to draw into the hero region (ImageBitmap | HTMLCanvasElement | HTMLImageElement)
 *   palette      — tone palette
 *   language     — caption language (drives font selection)
 *   title        — display title (route name)
 *   statsLine    — pre-formatted stats string
 *   ornamentLabel — optional small tag at the bottom (e.g., "yatra")
 */
export function drawPostcard(ctx, {
  sourceFrame = null,
  palette,
  language = "en",
  title,
  statsLine = "",
  ornamentLabel = "yatra",
  insets = DEFAULT_INSETS_9x16,
}) {
  if (!ctx || typeof ctx.fillRect !== "function") {
    throw new Error("drawPostcard: ctx must be a 2D canvas context");
  }
  if (!palette) throw new Error("drawPostcard: palette required");
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new Error(`drawPostcard: unsupported language ${language}`);
  }
  if (!title) throw new Error("drawPostcard: title required");

  const { width, height } = ctx.canvas;
  const L = layoutPostcard({ width, height, palette, insets });

  // Background — parchment, palette-driven.
  ctx.save();
  ctx.fillStyle = palette.color.parchment;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Hero region — source frame (map snapshot or photo). If absent, fill
  // with a palette-driven gradient placeholder so the postcard still
  // looks intentional.
  ctx.save();
  if (sourceFrame) {
    ctx.drawImage(sourceFrame, L.hero.x, L.hero.y, L.hero.w, L.hero.h);
  } else {
    const grad = ctx.createLinearGradient
      ? ctx.createLinearGradient(L.hero.x, L.hero.y, L.hero.x, L.hero.y + L.hero.h)
      : null;
    if (grad) {
      grad.addColorStop(0, palette.color.ink);
      grad.addColorStop(1, palette.color.primary);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = palette.color.primary;
    }
    ctx.fillRect(L.hero.x, L.hero.y, L.hero.w, L.hero.h);
  }
  ctx.restore();

  // Title — palette's headline size, language-aware font, ink color.
  const titleFont = fontForLanguage(palette.typography, language);
  const titleSize = palette.typography.titleSize || 56;
  const { lines: titleLines, fontSizePx: titleFitSize } = layoutCaption({
    text: title,
    baseSizePx: titleSize,
    minSizePx: 28,
    maxWidth: L.title.w,
    maxLines: 2,
    measure: (s, sz) => {
      ctx.save();
      ctx.font = `${sz}px ${titleFont}`;
      const w = ctx.measureText(s).width;
      ctx.restore();
      return w;
    },
  });
  ctx.save();
  ctx.fillStyle = palette.color.ink;
  ctx.font = `${titleFitSize}px ${titleFont}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  const titleLineHeight = Math.round(titleFitSize * (palette.typography.lineHeight || 1.4));
  const cx = L.title.x + L.title.w / 2;
  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], cx, L.title.y + i * titleLineHeight);
  }
  ctx.restore();

  // Subtitle — stats line in body size, dimmer ink.
  if (statsLine) {
    const bodySize = palette.typography.baseSize || 28;
    ctx.save();
    ctx.fillStyle = palette.color.ink + "b0"; // ~70% alpha
    ctx.font = `${bodySize}px ${titleFont}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillText(statsLine, cx, L.subtitle.y);
    ctx.restore();
  }

  // Ornament — saffron rule + accent label centered in remaining space.
  const accent = palette.ornament?.accentColor || palette.color.primary;
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, Math.round(L.ornament.h * 0.02));
  const ruleY = L.ornament.y + Math.round(L.ornament.h / 2);
  if (typeof ctx.beginPath === "function" && typeof ctx.stroke === "function") {
    ctx.beginPath();
    const ruleHalfW = Math.round(L.ornament.w * 0.18);
    ctx.moveTo(cx - ruleHalfW, ruleY);
    ctx.lineTo(cx + ruleHalfW, ruleY);
    ctx.stroke();
  }
  if (ornamentLabel) {
    ctx.fillStyle = accent;
    const labelSize = Math.max(14, Math.round((palette.typography.baseSize || 28) * 0.5));
    ctx.font = `${labelSize}px ${titleFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(ornamentLabel, cx, ruleY + Math.round(labelSize * 0.8));
  }
  ctx.restore();
}

/**
 * Render a postcard and return a blob URL. Used both as a standalone
 * PNG export and as the first MP4 frame.
 *
 * Inputs:
 *   sourceCanvas  — optional canvas (map snapshot) to draw in the hero region
 *   config        — Yatra location config (provides title + route stats)
 *   palette       — tone palette
 *   language      — caption language
 *   width/height  — defaults to 720×1280 (9:16)
 *
 * Tests pass `createCanvas` (factory) and `toBlobImpl` (encoder) to
 * avoid real DOM/Blob dependencies. Production wires them to
 * `document.createElement('canvas')` and the canvas's own `toBlob`.
 */
export async function exportPostcard({
  sourceCanvas = null,
  config,
  palette,
  language = "en",
  width = 720,
  height = 1280,
  createCanvas = (w, h) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  },
  toBlob = (canvas) => new Promise((resolve) => canvas.toBlob(resolve, "image/png")),
  createObjectURL = (blob) => URL.createObjectURL(blob),
} = {}) {
  if (!config) throw new Error("exportPostcard: config required");
  if (!palette) throw new Error("exportPostcard: palette required");

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("exportPostcard: 2D context unavailable");

  const route = config.routes?.[0];
  const statsLine = formatStatsLine({
    distanceKm: route?.stats?.distanceKm,
    durationHr: route?.stats?.durationHr,
    elevGainM:
      Number.isFinite(config?.destination?.elev) && Number.isFinite(config?.origin?.elev)
        ? Math.max(0, config.destination.elev - config.origin.elev)
        : undefined,
    language,
  });

  drawPostcard(ctx, {
    sourceFrame: sourceCanvas,
    palette,
    language,
    title: config.title,
    statsLine,
  });

  const blob = await toBlob(canvas);
  if (!blob) throw new Error("exportPostcard: encode failed");
  return createObjectURL(blob);
}
