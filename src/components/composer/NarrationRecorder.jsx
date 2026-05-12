import { useEffect, useRef, useState } from "react";

/**
 * Voice-narration recorder. Uses MediaRecorder; outputs a blob URL via
 * onRecorded(blobUrl). Caps at 60 seconds (composer narration is meant to
 * be a tagline, not a podcast).
 *
 * Graceful fallback: if getUserMedia is unavailable (or denied), shows a
 * message and disables the button. The composer remains functional.
 */
const MAX_SECONDS = 60;

export default function NarrationRecorder({ onRecorded }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recRef.current && recRef.current.state !== "inactive") {
      try { recRef.current.stop(); } catch { /* */ }
    }
  }, []);

  const start = async () => {
    setError(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone not supported in this browser.");
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission denied.");
      return;
    }
    const rec = new MediaRecorder(stream);
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
      const blobUrl = URL.createObjectURL(blob);
      setUrl(blobUrl);
      if (typeof onRecorded === "function") onRecorded(blobUrl);
    };
    rec.start();
    recRef.current = rec;
    setRecording(true);
    setElapsed(0);
    const t0 = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - t0) / 1000);
      setElapsed(secs);
      if (secs >= MAX_SECONDS) stop();
    }, 200);
  };

  const stop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recRef.current && recRef.current.state !== "inactive") {
      try { recRef.current.stop(); } catch { /* */ }
    }
    setRecording(false);
  };

  const reset = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    setElapsed(0);
    if (typeof onRecorded === "function") onRecorded(null);
  };

  return (
    <div className="narration-recorder">
      <span className="composer-label">Narration (optional)</span>
      <div className="narration-controls">
        {!recording && !url && (
          <button type="button" className="narration-button" onClick={start}>● Record</button>
        )}
        {recording && (
          <button type="button" className="narration-button narration-stop" onClick={stop}>
            ■ Stop ({elapsed}s / {MAX_SECONDS}s)
          </button>
        )}
        {url && !recording && (
          <>
            <audio src={url} controls className="narration-audio" />
            <button type="button" className="narration-button narration-reset" onClick={reset}>Re-record</button>
          </>
        )}
      </div>
      {error && <p className="composer-hint composer-error">{error}</p>}
    </div>
  );
}
