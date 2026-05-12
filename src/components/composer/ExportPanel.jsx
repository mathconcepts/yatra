import { useState } from "react";
import { isExportSupported, framePlan, encodeMp4 } from "../../services/mp4Export";
import { createOffscreenReelRenderer } from "../../services/reelRenderer";

/**
 * Export panel — drives the offscreen ReelRenderer to capture real
 * MapLibre frames, hands them + the optional narration blob to the
 * mp4Export pipeline, and surfaces an inline <video> preview before the
 * user downloads the file.
 *
 * Slice H wires the live renderer (replacing v1.2.0's placeholder
 * gradient). Slice I wires AAC audio mux. Inline preview is the user-
 * chosen UX polish at /autoplan-v3.1-completion time.
 */
export default function ExportPanel({ config, narrationUrl }) {
  const [status, setStatus] = useState({ kind: "idle" });
  const [downloadUrl, setDownloadUrl] = useState(null);

  const support = isExportSupported();

  const handleExport = async () => {
    if (!config) return;
    setStatus({ kind: "preparing" });
    setDownloadUrl(null);

    const plan = framePlan({ fps: 24, durationSec: 16 });

    let renderer = null;
    let frames = [];
    try {
      setStatus({ kind: "preparing", note: "Spinning up the map…" });
      renderer = await createOffscreenReelRenderer(config);

      setStatus({ kind: "rendering", frame: 0, total: plan.totalFrames });
      for (let i = 0; i < plan.totalFrames; i++) {
        const t = i / plan.totalFrames;
        const bm = await renderer.captureFrame(t);
        frames.push(bm);
        if (i % 4 === 0) setStatus({ kind: "rendering", frame: i + 1, total: plan.totalFrames });
      }

      setStatus({ kind: "encoding", frame: 0, total: plan.totalFrames });
      const audioBlob = narrationUrl ? await fetch(narrationUrl).then((r) => r.blob()) : null;
      const url = await encodeMp4(frames, {
        fps: plan.fps,
        width: 720,
        height: 1280,
        audioBlob,
        onProgress: (n, total) => setStatus({ kind: "encoding", frame: n, total }),
      });
      setDownloadUrl(url);
      setStatus({ kind: "done" });
    } catch (err) {
      setStatus({ kind: "error", message: err.message || "Export failed" });
    } finally {
      frames.forEach((f) => f.close?.());
      if (renderer) renderer.destroy();
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
            disabled={!config || status.kind === "preparing" || status.kind === "rendering" || status.kind === "encoding"}
            onClick={handleExport}
          >
            {status.kind === "idle" && "Export 9:16 MP4"}
            {status.kind === "preparing" && (status.note || "Preparing…")}
            {status.kind === "rendering" && `Rendering frame ${status.frame}/${status.total}…`}
            {status.kind === "encoding" && `Encoding ${status.frame}/${status.total}…`}
            {status.kind === "done" && "Re-export"}
            {status.kind === "error" && "Try again"}
          </button>
          {status.kind === "error" && <p className="composer-hint composer-error">{status.message}</p>}
          {downloadUrl && (
            <div className="export-preview">
              <video
                src={downloadUrl}
                controls
                playsInline
                className="export-preview-video"
                aria-label="Exported memory reel preview"
              />
              <a href={downloadUrl} download="memory-reel.mp4" className="export-download">
                ⬇ Download memory-reel.mp4
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
