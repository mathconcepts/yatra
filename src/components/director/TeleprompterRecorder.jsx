import { useState, useRef, useEffect } from "react";
import {
  requestMic,
  recordScene,
  decodeScene,
  releaseMic,
} from "../../services/micRecording.js";

/**
 * Scene-by-scene teleprompter + recorder.
 *
 * Props:
 *   scenes      — Array<{ id, tStart, tEnd, narration, captionText }>
 *   sampleRate  — project sample rate (48000)
 *   onComplete  — (Float32Array[]) → void  one mono buffer per scene
 *   onCancel    — () → void
 *
 * Flow:
 *   1. Tap "Allow microphone" → requestMic
 *   2. For each scene: read the script, tap "Record" (timer counts up),
 *      tap "Stop" when done. Repeat until all scenes have a take.
 *   3. Tap "Done — use these recordings" → decodes every blob and hands
 *      back Float32Array[] (one per scene) aligned to scene durations.
 *
 * The user can re-record any scene before finishing.
 */
export default function TeleprompterRecorder({ scenes, sampleRate = 48000, onComplete, onCancel }) {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);                  // current scene index
  const [takes, setTakes] = useState([]);                   // Blob[] indexed by scene
  const [recordingFor, setRecordingFor] = useState(null);   // index being recorded right now
  const [elapsedS, setElapsedS] = useState(0);
  const [decoding, setDecoding] = useState(false);
  const controllerRef = useRef(null);
  const tickRef = useRef(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount.
      if (controllerRef.current) controllerRef.current.stop();
      if (stream) releaseMic(stream);
      if (tickRef.current) clearInterval(tickRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onAllowMic() {
    try {
      const s = await requestMic();
      setStream(s);
      setError("");
    } catch (err) {
      setError(err?.message || "Microphone permission denied.");
    }
  }

  function onRecord(idx) {
    if (!stream) return;
    if (controllerRef.current) controllerRef.current.stop();
    setRecordingFor(idx);
    setElapsedS(0);
    const start = Date.now();
    tickRef.current = setInterval(() => {
      setElapsedS((Date.now() - start) / 1000);
    }, 100);
    const { promise, controller } = recordScene({ stream });
    controllerRef.current = controller;
    promise.then((blob) => {
      setTakes((prev) => {
        const next = prev.slice();
        next[idx] = blob;
        return next;
      });
      setRecordingFor(null);
      controllerRef.current = null;
      clearInterval(tickRef.current);
      tickRef.current = null;
      // Auto-advance to the next scene that doesn't have a take yet.
      setActive((cur) => {
        for (let i = idx + 1; i < scenes.length; i++) {
          if (!takesAt(takes, i)) return i;
        }
        return cur;
      });
    }).catch((e) => {
      setError(e?.message || "Recording failed.");
      setRecordingFor(null);
    });
  }

  function onStop() {
    if (controllerRef.current) controllerRef.current.stop();
  }

  async function onDone() {
    setDecoding(true);
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const out = [];
      for (let i = 0; i < scenes.length; i++) {
        const dur = scenes[i].tEnd - scenes[i].tStart;
        out.push(await decodeScene({
          blob: takes[i] || null,
          audioContext: ctx,
          durationS: dur,
          sampleRate,
        }));
      }
      ctx.close?.();
      releaseMic(stream);
      onComplete(out);
    } catch (err) {
      setError(err?.message || "Could not decode recordings.");
      setDecoding(false);
    }
  }

  function takesAt(list, idx) { return list[idx]; }

  const completeCount = takes.filter(Boolean).length;
  const allRecorded = completeCount === scenes.length;
  const current = scenes[active];

  if (!stream) {
    return (
      <div style={{ padding: "1rem", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}>
        <h3 style={{ margin: "0 0 0.4rem", fontSize: "1.1rem" }}>Record your own narration</h3>
        <p style={{ opacity: 0.75, fontSize: "0.9rem", margin: "0 0 1rem" }}>
          We'll show you a short script for each scene. Tap Record, read it aloud, tap Stop. You can re-record any scene before finishing.
        </p>
        {error && <div role="alert" style={{ color: "#f4a3a3", margin: "0 0 0.6rem" }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={onAllowMic}
                  style={{ padding: "0.55rem 1rem", borderRadius: 6, border: "none", cursor: "pointer",
                           background: "#8a4528", color: "#f4e8d0", fontWeight: 600 }}>
            🎙 Allow microphone
          </button>
          <button type="button" onClick={onCancel}
                  style={{ padding: "0.55rem 1rem", borderRadius: 6, cursor: "pointer",
                           background: "transparent", color: "inherit", border: "1px solid rgba(255,255,255,0.2)" }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "1rem", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.6rem" }}>
        <h3 style={{ margin: 0, fontSize: "1.05rem" }}>
          Scene {active + 1} of {scenes.length}
          <span style={{ opacity: 0.55, fontSize: "0.8rem", marginLeft: 8 }}>
            ({completeCount} recorded)
          </span>
        </h3>
        <button type="button" onClick={onCancel}
                style={{ padding: "0.3rem 0.6rem", fontSize: "0.78rem", borderRadius: 4,
                         background: "transparent", border: "1px solid rgba(255,255,255,0.18)",
                         color: "inherit", cursor: "pointer" }}>
          Cancel
        </button>
      </div>

      {/* Scene tabs */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: "0.6rem" }}>
        {scenes.map((_s, i) => {
          const has = !!takes[i];
          const isActive = i === active;
          return (
            <button key={i} type="button" onClick={() => setActive(i)}
                    style={{
                      padding: "0.25rem 0.6rem", borderRadius: 4, fontSize: "0.78rem", cursor: "pointer",
                      background: isActive ? "#8a4528" : has ? "rgba(80,160,90,0.2)" : "transparent",
                      border: `1px solid ${isActive ? "#8a4528" : has ? "rgba(80,160,90,0.4)" : "rgba(255,255,255,0.15)"}`,
                      color: "inherit",
                    }}>
            {has ? "✓ " : ""}{i + 1}
          </button>
          );
        })}
      </div>

      {/* Teleprompter */}
      <div style={{
        padding: "1rem 1.2rem", borderRadius: 8, marginBottom: "0.8rem",
        background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.08)",
        minHeight: 100,
      }}>
        <div style={{ opacity: 0.55, fontSize: "0.78rem", marginBottom: 6 }}>
          Read aloud (about {((current.tEnd - current.tStart)).toFixed(1)}s)
        </div>
        <div style={{ fontSize: "1.15rem", lineHeight: 1.45, fontFamily: "Cormorant Garamond, serif" }}>
          {current.narration}
        </div>
        {current.captionText && current.captionText !== current.narration && (
          <div style={{ marginTop: 6, fontSize: "0.85rem", opacity: 0.6 }}>
            (caption: {current.captionText})
          </div>
        )}
      </div>

      {/* Record / Stop */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {recordingFor === active ? (
          <button type="button" onClick={onStop}
                  style={{ flex: 1, padding: "0.7rem 1rem", borderRadius: 6, border: "none", cursor: "pointer",
                           background: "#b04030", color: "#fff", fontWeight: 600 }}>
            ⏹ Stop ({elapsedS.toFixed(1)}s)
          </button>
        ) : (
          <button type="button" onClick={() => onRecord(active)}
                  style={{
                    flex: 1, padding: "0.7rem 1rem", borderRadius: 6, cursor: "pointer",
                    background: takes[active] ? "rgba(255,255,255,0.06)" : "#8a4528",
                    color: takes[active] ? "inherit" : "#f4e8d0",
                    fontWeight: 600,
                    border: takes[active] ? "1px solid rgba(255,255,255,0.18)" : "none",
                  }}>
            {takes[active] ? "↻ Re-record" : "● Record"}
          </button>
        )}
        {takes[active] && (
          <audio src={URL.createObjectURL(takes[active])} controls
                 style={{ height: 36 }} />
        )}
      </div>

      {error && <div role="alert" style={{ color: "#f4a3a3", marginTop: "0.6rem" }}>{error}</div>}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
        <div style={{ opacity: 0.6, fontSize: "0.8rem" }}>
          {allRecorded
            ? "All scenes recorded. Ready to mix."
            : `${scenes.length - completeCount} scene${scenes.length - completeCount === 1 ? "" : "s"} left.`}
        </div>
        <button type="button" onClick={onDone} disabled={completeCount === 0 || decoding}
                style={{ padding: "0.55rem 1rem", borderRadius: 6, border: "none", cursor: "pointer",
                         background: "#8a4528", color: "#f4e8d0", fontWeight: 600,
                         opacity: completeCount === 0 || decoding ? 0.5 : 1 }}>
          {decoding ? "Mixing…" : allRecorded ? "Done — use these takes" : "Use what's recorded so far"}
        </button>
      </div>
    </div>
  );
}
