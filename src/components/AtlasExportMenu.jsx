import { useState } from "react";
import {
  SUPPORTED_ASPECTS,
  exportPng,
  exportMp4,
  validateAspect,
} from "../services/exportRouter";

/**
 * Atlas export menu (v3.4 Slice R). Surfaces:
 *   - Snapshot PNG (grabs the live MapLibre canvas — no re-render)
 *   - MP4 (9:16) / (1:1) / (16:9) — uses the offscreen ReelRenderer
 *
 * `mapRef` is a useRef pointing at the live maplibregl.Map (captured by
 * MapView's onMapReady). `config` is the active LocationConfig.
 */
export default function AtlasExportMenu({ mapRef, config }) {
  const [status, setStatus] = useState({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [downloadName, setDownloadName] = useState("yatra-export.png");

  const handlePng = async () => {
    const map = mapRef?.current;
    const canvas = map?.getCanvas?.();
    if (!canvas) { setStatus({ kind: "error", message: "Map not ready" }); return; }
    try {
      setStatus({ kind: "working", note: "Snapshot…" });
      const url = await exportPng(canvas);
      setDownloadUrl(url);
      setDownloadName(`${slug(config?.title || "yatra")}.png`);
      setStatus({ kind: "done" });
    } catch (e) {
      setStatus({ kind: "error", message: e.message || "PNG failed" });
    }
  };

  const handleMp4 = async (aspect) => {
    if (!validateAspect(aspect)) return;
    if (!config) { setStatus({ kind: "error", message: "No config" }); return; }
    try {
      setStatus({ kind: "working", note: `Rendering MP4 ${aspect}…` });
      const url = await exportMp4({
        config,
        aspect,
        onProgress: ({ stage, frame, total }) =>
          setStatus({ kind: "working", note: `${stage} ${frame}/${total}` }),
      });
      setDownloadUrl(url);
      setDownloadName(`${slug(config?.title || "yatra")}-${aspect.replace(":", "x")}.mp4`);
      setStatus({ kind: "done" });
    } catch (e) {
      setStatus({ kind: "error", message: e.message || "MP4 failed" });
    }
  };

  return (
    <div className={`atlas-export${open ? " open" : ""}`}>
      <button
        type="button"
        className="jm-surface-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        Export {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="atlas-export-menu" role="menu">
          <button type="button" onClick={handlePng}>Snapshot PNG</button>
          {SUPPORTED_ASPECTS.map((a) => (
            <button key={a} type="button" onClick={() => handleMp4(a)}>
              MP4 · {a}
            </button>
          ))}
          {status.kind === "working" && <p className="composer-hint">{status.note}</p>}
          {status.kind === "error" && <p className="composer-hint composer-error">{status.message}</p>}
          {status.kind === "done" && downloadUrl && (
            <a className="export-download" href={downloadUrl} download={downloadName}>
              ⬇ {downloadName}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "yatra";
}
