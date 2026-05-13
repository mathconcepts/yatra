import { describe, it, expect, vi } from "vitest";
import {
  formatStatsLine,
  layoutPostcard,
  drawPostcard,
  exportPostcard,
} from "../src/services/exportPostcard.js";
import devotional from "../src/services/tonePalettes/devotional.js";

function fakeCtx({ width = 720, height = 1280 } = {}) {
  const calls = { fillText: [], fillRect: 0, drawImage: 0, stroke: 0, gradient: 0 };
  const ctx = {
    canvas: { width, height },
    font: "",
    fillStyle: "",
    strokeStyle: "",
    textBaseline: "",
    textAlign: "",
    lineWidth: 1,
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    fill() {},
    stroke() { calls.stroke++; },
    moveTo() {},
    lineTo() {},
    fillRect() { calls.fillRect++; },
    drawImage() { calls.drawImage++; },
    fillText(text, x, y) { calls.fillText.push({ text, x, y, font: this.font, alpha: this.globalAlpha }); },
    measureText(s) { return { width: s.length * 14 }; },
    createLinearGradient() { calls.gradient++; return { addColorStop() {} }; },
  };
  return { ctx, calls };
}

describe("formatStatsLine", () => {
  it("includes distance + duration + climb in English", () => {
    const s = formatStatsLine({ distanceKm: 4.2, durationHr: 1.5, elevGainM: 160, language: "en" });
    expect(s).toContain("4.2 km");
    expect(s).toContain("~1.5 hr");
    expect(s).toContain("+160 m climb");
  });
  it("translates units to Telugu", () => {
    const s = formatStatsLine({ distanceKm: 4.2, durationHr: 1.5, elevGainM: 160, language: "te" });
    expect(s).toContain("కిమీ");
    expect(s).toContain("మీ");
    expect(s).toContain("ఎక్కువ");
  });
  it("translates units to Hindi and Tamil", () => {
    expect(formatStatsLine({ distanceKm: 4.2, language: "hi" })).toContain("किमी");
    expect(formatStatsLine({ distanceKm: 4.2, language: "ta" })).toContain("கி.மீ");
  });
  it("omits missing fields cleanly", () => {
    expect(formatStatsLine({ distanceKm: 4.2 })).toBe("4.2 km");
    expect(formatStatsLine({})).toBe("");
  });
  it("uses integer formatting for long distances", () => {
    expect(formatStatsLine({ distanceKm: 25.6, language: "en" })).toContain("26 km");
  });
  it("falls back to English for unknown languages", () => {
    expect(formatStatsLine({ distanceKm: 4.2, language: "zz" })).toContain("km");
  });
  it("rejects negative or zero values silently", () => {
    expect(formatStatsLine({ distanceKm: 0, elevGainM: -10 })).toBe("");
  });
});

describe("layoutPostcard", () => {
  it("produces non-overlapping regions inside the safe-zone insets", () => {
    const L = layoutPostcard({ width: 1080, height: 1920, palette: devotional });
    expect(L.hero.y).toBeGreaterThanOrEqual(L.insets.top);
    expect(L.hero.y + L.hero.h).toBeLessThanOrEqual(L.title.y);
    expect(L.title.y + L.title.h).toBeLessThanOrEqual(L.subtitle.y);
    expect(L.subtitle.y + L.subtitle.h).toBeLessThanOrEqual(L.ornament.y);
    expect(L.ornament.y + L.ornament.h).toBeLessThanOrEqual(1920 - L.insets.bottom + 16);
  });
  it("scales insets proportionally to canvas height", () => {
    const Lbig = layoutPostcard({ width: 1080, height: 1920, palette: devotional });
    const Lsmall = layoutPostcard({ width: 720, height: 1280, palette: devotional });
    expect(Lsmall.insets.top).toBeLessThan(Lbig.insets.top);
    expect(Lsmall.insets.top / Lbig.insets.top).toBeCloseTo(1280 / 1920, 1);
  });
  it("rejects missing inputs", () => {
    expect(() => layoutPostcard({ width: 0, height: 1280, palette: devotional })).toThrow();
    expect(() => layoutPostcard({ width: 1080, height: 0, palette: devotional })).toThrow();
    expect(() => layoutPostcard({ width: 1080, height: 1920 })).toThrow();
  });
});

describe("drawPostcard", () => {
  it("paints parchment background then draws hero, title, subtitle", () => {
    const { ctx, calls } = fakeCtx();
    drawPostcard(ctx, {
      sourceFrame: { width: 720, height: 720 },
      palette: devotional,
      language: "te",
      title: "యాదగిరి గుట్ట",
      statsLine: "4.2 కిమీ",
    });
    expect(calls.fillRect).toBeGreaterThanOrEqual(1); // background
    expect(calls.drawImage).toBe(1); // hero
    expect(calls.fillText.length).toBeGreaterThanOrEqual(2); // title + subtitle (+ ornament label)
  });

  it("uses the Telugu typeface for te language", () => {
    const { ctx, calls } = fakeCtx();
    drawPostcard(ctx, {
      palette: devotional,
      language: "te",
      title: "యాదగిరి",
    });
    expect(calls.fillText[0].font).toMatch(/Mandali|Hind Guntur/);
  });

  it("uses the Latin typeface for English", () => {
    const { ctx, calls } = fakeCtx();
    drawPostcard(ctx, {
      palette: devotional,
      language: "en",
      title: "Yadagiri Gutta",
    });
    expect(calls.fillText[0].font).toMatch(/Fraunces|Cormorant/);
  });

  it("falls back to gradient when no source frame is provided", () => {
    const { ctx, calls } = fakeCtx();
    drawPostcard(ctx, {
      palette: devotional,
      language: "en",
      title: "X",
    });
    expect(calls.drawImage).toBe(0);
    expect(calls.fillRect).toBeGreaterThanOrEqual(2); // background + hero fill
  });

  it("draws the ornament rule when present", () => {
    const { ctx, calls } = fakeCtx();
    drawPostcard(ctx, {
      palette: devotional,
      language: "en",
      title: "X",
    });
    expect(calls.stroke).toBe(1);
  });

  it("rejects missing title, palette, or unsupported language", () => {
    const { ctx } = fakeCtx();
    expect(() => drawPostcard(ctx, { palette: devotional, language: "en" })).toThrow(/title/);
    expect(() => drawPostcard(ctx, { language: "en", title: "X" })).toThrow(/palette/);
    expect(() => drawPostcard(ctx, { palette: devotional, language: "??", title: "X" })).toThrow(/unsupported/);
  });

  it("rejects non-canvas context", () => {
    expect(() => drawPostcard({}, { palette: devotional, language: "en", title: "X" })).toThrow();
  });
});

describe("exportPostcard", () => {
  const config = {
    id: "yadagiri-gutta",
    title: "Yadagiri Gutta",
    routes: [{ stats: { distanceKm: 4.2, durationHr: 1.5 } }],
    origin: { elev: 380 },
    destination: { elev: 540 },
  };

  function makeDeps() {
    const calls = { created: 0, blobs: 0, urls: [] };
    const ctxBundle = fakeCtx();
    const fakeCanvas = {
      width: 720,
      height: 1280,
      getContext: vi.fn(() => ctxBundle.ctx),
    };
    return {
      createCanvas: vi.fn((w, h) => {
        calls.created++;
        fakeCanvas.width = w;
        fakeCanvas.height = h;
        ctxBundle.ctx.canvas = { width: w, height: h };
        return fakeCanvas;
      }),
      toBlob: vi.fn(async () => {
        calls.blobs++;
        return { __fakeBlob: true, type: "image/png" };
      }),
      createObjectURL: vi.fn((blob) => {
        const u = `blob:test/${calls.blobs}`;
        calls.urls.push(u);
        return u;
      }),
      calls,
      ctxBundle,
    };
  }

  it("orchestrates draw + encode and returns a blob URL", async () => {
    const deps = makeDeps();
    const url = await exportPostcard({
      config,
      palette: devotional,
      language: "te",
      createCanvas: deps.createCanvas,
      toBlob: deps.toBlob,
      createObjectURL: deps.createObjectURL,
    });
    expect(url).toMatch(/^blob:/);
    expect(deps.createCanvas).toHaveBeenCalledWith(720, 1280);
    expect(deps.toBlob).toHaveBeenCalledTimes(1);
    expect(deps.ctxBundle.calls.fillText.length).toBeGreaterThan(0);
  });

  it("computes climb from destination - origin elevation", async () => {
    const deps = makeDeps();
    await exportPostcard({
      config,
      palette: devotional,
      language: "en",
      createCanvas: deps.createCanvas,
      toBlob: deps.toBlob,
      createObjectURL: deps.createObjectURL,
    });
    // Stats text "160 m climb" should appear in one of the fillText calls
    const texts = deps.ctxBundle.calls.fillText.map((c) => c.text).join(" | ");
    expect(texts).toMatch(/160 m climb/);
  });

  it("passes source canvas through to the hero region", async () => {
    const deps = makeDeps();
    const sourceCanvas = { __fakeSource: true };
    await exportPostcard({
      sourceCanvas,
      config,
      palette: devotional,
      language: "en",
      createCanvas: deps.createCanvas,
      toBlob: deps.toBlob,
      createObjectURL: deps.createObjectURL,
    });
    expect(deps.ctxBundle.calls.drawImage).toBe(1);
  });

  it("rejects missing config or palette", async () => {
    const deps = makeDeps();
    await expect(exportPostcard({ palette: devotional, createCanvas: deps.createCanvas })).rejects.toThrow(/config/);
    await expect(exportPostcard({ config, createCanvas: deps.createCanvas })).rejects.toThrow(/palette/);
  });

  it("throws when toBlob returns null", async () => {
    const deps = makeDeps();
    deps.toBlob = vi.fn(async () => null);
    await expect(
      exportPostcard({
        config,
        palette: devotional,
        language: "en",
        createCanvas: deps.createCanvas,
        toBlob: deps.toBlob,
        createObjectURL: deps.createObjectURL,
      }),
    ).rejects.toThrow(/encode failed/);
  });
});
