import { useState, useRef } from "react";
import { isExportSupported, framePlan, encodeMp4 } from "../../services/mp4Export";

/**
 * Export panel — renders the previewed reel to an offscreen canvas
 * frame-by-frame, then encodes to MP4 via mp4Export.
 *
 * Currently uses a placeholder frame source (a colored gradient + title
 * card) for the initial release. Wiring it to MapLibre's actual canvas
 * needs cross-frame access to the live reel and is tracked in TODOS as
 * "ExportPanel → live ReelPlayer frame capture".
 *
 * The point of shipping this surface now: feature-detect + encoder
 * pipeline + UX skeleton are all the parts that are hard to retrofit.
 * Swapping in real frames is one method call.
 */
export default function ExportPanel({ config, narrationUrl }) {
  const [status, setStatus] = useState({ kind: "idle" });
  const [downloadUrl, setDownloadUrl] = useState(null);
  const canvasRef = useRef(null);

  const support = isExportSupported();

  const handleExport = async () => {
    setStatus({ kind: "rendering", frame: 0 });
    setDownloadUrl(null);
    const plan = framePlan({ fps: 30, durationSec: 22 });
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 1280;
    const ctx = canvas.getContext("2d");

    // Render N frames. v3.1 placeholder visuals; map-frame capture lands
    // in a follow-up.
    const frames = [];
    for (let i = 0; i < plan.totalFrames; i++) {
      const t = i / plan.totalFrames;
      drawPlaceholderFrame(ctx, canvas.width, canvas.height, config, t);
      const bm = await createImageBitmap(canvas);
      frames.push(bm);
      if (i % 10 === 0) setStatus({ kind: "rendering", frame: i, total: plan.totalFrames });
    }

    setStatus({ kind: "encoding" });
    try {
      const url = await encodeMp4(frames, {
        fps: plan.fps,
        width: canvas.width,
        height: canvas.height,
        audioBlob: narrationUrl ? await fetch(narrationUrl).then((r) => r.blob()) : null,
        onProgress: (n, total) => setStatus({ kind: "encoding", frame: n, total }),
      });
      setDownloadUrl(url);
      setStatus({ kind: "done" });
    } catch (err) {
      setStatus({ kind: "error", message: err.message || "Export failed" });
    } finally {
      frames.forEach((f) => f.close?.());
    }
  };

  return (
    <div className="export-panel">
      <span className="composer-label">Export</span>
      {!support.supported ? (
        <p className="composer-hint composer-error">
          This browser lacks WebCodecs ({support.missing.join(", ")}). Try Chrome 94+ or Edge 94+.
        </p>
      ) : (
        <>
          <button
            type="button"
            className="composer-preview"
            disabled={!config || status.kind === "rendering" || status.kind === "encoding"}
            onClick={handleExport}
          >
            {status.kind === "idle" && "Export 9:16 MP4"}
            {status.kind === "rendering" && `Rendering ${status.frame}/${status.total}…`}
            {status.kind === "encoding" && `Encoding ${status.frame || ""}…`}
            {status.kind === "done" && "Re-export"}
            {status.kind === "error" && "Try again"}
          </button>
          {status.kind === "error" && <p className="composer-hint composer-error">{status.message}</p>}
          {downloadUrl && (
            <a href={downloadUrl} download="memory-reel.mp4" className="export-download">
              ⬇ Download memory-reel.mp4
            </a>
          )}
        </>
      )}
      <canvas ref={canvasRef} className="export-canvas" aria-hidden="true" />
    </div>
  );
}

function drawPlaceholderFrame(ctx, w, h, config, t) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#1a2a3d");
  grad.addColorStop(1, "#8a4528");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(244, 237, 225, 0.85)";
  ctx.font = "bold 56px serif";
  ctx.textAlign = "center";
  ctx.fillText(config?.title || "Memory", w / 2, h / 2 - 40);
  ctx.font = "20px sans-serif";
  ctx.fillText(`${Math.round(t * 100)}%`, w / 2, h / 2 + 20);
}
