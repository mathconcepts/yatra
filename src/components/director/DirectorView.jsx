import { useState, useMemo } from "react";
import { PALETTE_IDS, getPalette, SUPPORTED_LANGUAGES } from "../../services/tonePalettes/index.js";
import { generateScript } from "../../services/directorScript.js";

/**
 * AI Cinematographer surface (v0 scaffold).
 *
 * Step 1 of the design doc: tone picker, route picker (curated configs),
 * language picker, "Direct this journey" button. On click, calls
 * generateScript and renders the returned scenes as text. No TTS, no
 * audio mixing, no map render here yet — those land in later commits.
 *
 * The point of v0 is to prove the script generator + MOCK fixture path
 * end-to-end before any API key is provisioned.
 *
 * Per the design doc + autoplan review: route default is the user's
 * last journey if available, language defaults to device locale (mapped
 * to one of SUPPORTED_LANGUAGES), tone is the one decision the user
 * makes first.
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
  const [stage, setStage] = useState("idle"); // idle | composing | rendering | done | error
  const [scenes, setScenes] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const palette = getPalette(tone);
  const route = routeChoices.find((r) => r.id === routeId)?.cfg;

  async function onDirect() {
    if (!route) return;
    setStage("composing");
    setScenes(null);
    setErrorMsg("");
    try {
      const result = await generateScript({ config: route, tone, language });
      setScenes(result.scenes || []);
      setStage("done");
    } catch (err) {
      setErrorMsg(err?.message || String(err));
      setStage("error");
    }
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
        onClick={onDirect}
        disabled={!route || stage === "composing"}
        style={{ background: palette.color.primary }}
      >
        {stage === "composing" ? "Composing the script…" : "Direct this journey"}
      </button>

      {stage === "error" && (
        <div className="director-error" role="alert">
          <strong>Couldn't compose:</strong> {errorMsg}
        </div>
      )}

      {stage === "done" && scenes && (
        <section className="director-scenes" aria-label="Scenes">
          <h2>Scenes ({scenes.length})</h2>
          <ol>
            {scenes.map((s) => (
              <li key={s.id} className="director-scene">
                <span className="director-scene-t">
                  {s.tStart.toFixed(1)}–{s.tEnd.toFixed(1)}s
                </span>
                <span className="director-scene-narration">{s.narration}</span>
                <span className="director-scene-caption">{s.captionText}</span>
              </li>
            ))}
          </ol>
          <p className="director-note">
            v0 scaffold — TTS, audio mixing, color-graded map render, and MP4 mux land in later commits.
          </p>
        </section>
      )}
    </div>
  );
}

function labelForLang(lang) {
  return { en: "English", hi: "हिन्दी", te: "తెలుగు", ta: "தமிழ்" }[lang] || lang;
}
