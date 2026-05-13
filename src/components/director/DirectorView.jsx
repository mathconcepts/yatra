import { useState, useMemo, useRef } from "react";
import { PALETTE_IDS, getPalette, SUPPORTED_LANGUAGES } from "../../services/tonePalettes/index.js";
import { runDirectorPipeline } from "../../services/directorPipeline.js";

/**
 * AI Cinematographer surface.
 *
 * Pipeline wired in v1.6.7: tone + route + language → directorPipeline →
 * MP4 (silent for now) + postcard. The "Direct this journey" button runs
 * the full script → TTS (silent default) → mix → render → encode →
 * postcard chain and surfaces download links.
 *
 * Audio in the MP4 is deferred to v1.6.8 (small encodeMp4 surface
 * change to accept AudioBuffer directly). Today: silent video + cover
 * postcard ready to share.
 */

function defaultLanguage() {
  if (typeof navigator === "undefined") return "en";
  const raw = (navigator.language || "en").toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(raw) ? raw : "en";
}

export default function DirectorView({ locations = {}, onCancel }) {
  const routeChoices = useMemo(
    () => Object.entries(locations).map(([id, cfg]) => ({ id, title: cfg.title, cfg })),
    [locations],
  );
  const [tone, setTone] = useState("devotional");
  const [language, setLanguage] = useState(defaultLanguage);
  const [routeId, setRouteId] = useState(routeChoices[0]?.id || "");
  const [stage, setStage] = useState("idle"); // idle | running | done | error
  const [progressMsg, setProgressMsg] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef(null);

  const palette = getPalette(tone);
  const route = routeChoices.find((r) => r.id === routeId)?.cfg;

  const STAGE_LABELS = {
    script: "Composing the script",
    tts: "Recording the voice",
    audio: "Mixing the score",
    render: "Color-grading the map",
    encode: "Cutting the film",
    postcard: "Printing the postcard",
    done: "Done",
  };

  async function onDirect() {
    if (!route) return;
    setStage("running");
    setResult(null);
    setErrorMsg("");
    setProgressMsg(STAGE_LABELS.script);
    setProgressDetail("");
    abortRef.current = new AbortController();

    try {
      // Lazy-load the heavy renderer + encoder so first paint of the
      // Director screen stays fast.
      const [{ createOffscreenReelRenderer }, { encodeMp4 }] = await Promise.all([
        import("../../services/reelRenderer.js"),
        import("../../services/mp4Export.js"),
      ]);

      // Provide an OfflineAudioContext-backed createBuffer when the host
      // supports it. The pipeline doesn't crash without it; the audio
      // mixer's output just isn't materialized.
      let createAudioBuffer;
      try {
        if (typeof OfflineAudioContext !== "undefined") {
          createAudioBuffer = (n, len, sr) => new OfflineAudioContext(n, len, sr).createBuffer(n, len, sr);
        }
      } catch { /* not available — proceed without */ }

      const out = await runDirectorPipeline({
        config: route,
        palette,
        language,
        signal: abortRef.current.signal,
        makeRenderer: createOffscreenReelRenderer,
        encodeMp4Impl: encodeMp4,
        createAudioBuffer,
        onProgress: ({ stage: s, frame, total, message }) => {
          if (message) setProgressMsg(message);
          else if (STAGE_LABELS[s]) setProgressMsg(STAGE_LABELS[s]);
          if (typeof frame === "number" && typeof total === "number") {
            setProgressDetail(`${frame} / ${total}`);
          } else {
            setProgressDetail("");
          }
        },
      });
      setResult(out);
      setStage("done");
    } catch (err) {
      setErrorMsg(err?.message || String(err));
      setStage("error");
    } finally {
      abortRef.current = null;
    }
  }

  function onCancelRun() {
    abortRef.current?.abort();
  }

  return (
    <div className="director-root">
      <header className="director-header">
        <h1 className="director-title">Director</h1>
        <button type="button" className="composer-cancel" onClick={onCancel} aria-label="Close director">×</button>
      </header>

      <section className="director-tone-grid" aria-label="Tone">
        {PALETTE_IDS.map((id) => {
          const p = getPalette(id);
          const active = id === tone;
          return (
            <button
              key={id}
              type="button"
              className={active ? "director-tone active" : "director-tone"}
              onClick={() => setTone(id)}
              style={{
                borderColor: active ? p.color.primary : "transparent",
                background: active ? p.color.parchment : "transparent",
                color: active ? p.color.ink : "inherit",
              }}
            >
              <span className="director-tone-name">{p.displayName}</span>
            </button>
          );
        })}
      </section>

      <section className="director-row" aria-label="Route">
        <label className="composer-label">Route</label>
        <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
          {routeChoices.map((r) => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select>
      </section>

      <section className="director-row" aria-label="Language">
        <label className="composer-label">Language</label>
        <div className="director-lang-chips" role="radiogroup">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={language === lang}
              className={language === lang ? "director-lang active" : "director-lang"}
              onClick={() => setLanguage(lang)}
            >
              {labelForLang(lang)}
            </button>
          ))}
        </div>
      </section>

      <button
        type="button"
        className="director-cta"
        onClick={stage === "running" ? onCancelRun : onDirect}
        disabled={!route}
        style={{ background: palette.color.primary }}
      >
        {stage === "running" ? `${progressMsg || "Working"}${progressDetail ? ` · ${progressDetail}` : ""} (cancel)` : "Direct this journey"}
      </button>

      {stage === "error" && (
        <div className="director-error" role="alert">
          <strong>Couldn't direct:</strong> {errorMsg}
        </div>
      )}

      {stage === "done" && result && (
        <section className="director-result" aria-label="Result">
          <div className="director-downloads">
            <a className="director-download" href={result.mp4Url} download={`${route.id}-${tone}-${language}.mp4`}>
              ⬇ MP4 ({result.frameCount} frames · {result.durationS.toFixed(0)}s)
            </a>
            <a className="director-download" href={result.postcardUrl} download={`${route.id}-${tone}-${language}-postcard.png`}>
              ⬇ Postcard PNG
            </a>
          </div>
          <p className="director-note">
            v1.6.7 ships silent MP4 + postcard cover. Audio mixer ran in <code>{result.mode}</code> mode; embedding into MP4 lands in v1.6.8 after TTS quality validation.
          </p>
          <details className="director-scenes-toggle">
            <summary>Scenes ({result.scenes.length})</summary>
            <ol className="director-scenes">
              {result.scenes.map((s) => (
                <li key={s.id} className="director-scene">
                  <span className="director-scene-t">{s.tStart.toFixed(1)}–{s.tEnd.toFixed(1)}s</span>
                  <span className="director-scene-narration">{s.narration}</span>
                  <span className="director-scene-caption">{s.captionText}</span>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </div>
  );
}

function labelForLang(lang) {
  return { en: "English", hi: "हिन्दी", te: "తెలుగు", ta: "தமிழ்" }[lang] || lang;
}
