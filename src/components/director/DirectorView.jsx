import { useState, useMemo, useRef, useEffect } from "react";
import { PALETTE_IDS, getPalette, SUPPORTED_LANGUAGES } from "../../services/tonePalettes/index.js";
import { runDirectorPipeline } from "../../services/directorPipeline.js";
import { suggestPersonalNote } from "../../services/directorScript.js";
import { BASEMAP_LABELS } from "../../services/basemapStyles.js";

const PERSONAL_NOTE_STORAGE_PREFIX = "yatra.director.personalNote";
const BASEMAP_OPTIONS = ["topo", "imagery", "relief"];

function readStoredNote(routeId) {
  if (typeof window === "undefined" || !routeId) return "";
  try { return window.localStorage.getItem(`${PERSONAL_NOTE_STORAGE_PREFIX}.${routeId}`) || ""; }
  catch { return ""; }
}
function writeStoredNote(routeId, value) {
  if (typeof window === "undefined" || !routeId) return;
  try { window.localStorage.setItem(`${PERSONAL_NOTE_STORAGE_PREFIX}.${routeId}`, value); }
  catch { /* private mode / quota — ignore */ }
}

/**
 * Compute one-tap autopilot defaults for the wizard. Pure so tests can
 * pin the recommendation. Picks devotional + device-locale language +
 * relief basemap (works for every Indian pilgrimage route in our set)
 * and an AI-suggested personal note shaped for the chosen tone.
 */
export function autopilotDefaults({ routeChoices = [], device = {} } = {}) {
  const first = routeChoices[0];
  const tone = "devotional";
  const language = (() => {
    const raw = (device.language || "en").toLowerCase().split("-")[0];
    return SUPPORTED_LANGUAGES.includes(raw) ? raw : "en";
  })();
  return {
    tone,
    language,
    basemap: "relief",
    routeId: first?.id || "",
    personalNote: first ? suggestPersonalNote({ config: first.cfg, tone }) : "",
  };
}

function defaultLanguage() {
  if (typeof navigator === "undefined") return "en";
  const raw = (navigator.language || "en").toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.includes(raw) ? raw : "en";
}

const STEPS = [
  { id: "tone",     title: "Pick a tone",         help: "How should the film feel?" },
  { id: "route",    title: "Pick a route",        help: "Which journey are we directing?" },
  { id: "basemap",  title: "Pick a map look",     help: "What kind of map sits under the journey?" },
  { id: "language", title: "Pick a language",     help: "Which language should the narrator speak?" },
  { id: "note",     title: "Tell us about it",    help: "Optional — a relative, a memory, what this means to you." },
  { id: "review",   title: "Ready to direct",     help: "We'll compose script, voice, mix, and cut." },
];

/**
 * AI Cinematographer — guided wizard.
 *
 * The user is walked step-by-step through tone → route → map → language
 * → personal note → review. At any step they can hit "✨ AI Autopilot"
 * to fill sensible defaults and jump to the final Direct CTA. Every
 * field is still editable after autopilot fires.
 *
 * Pipeline (script → TTS → mix → render → encode → postcard) ships
 * unchanged; only the entry UX is restructured.
 */
export default function DirectorView({ locations = {}, onCancel }) {
  const routeChoices = useMemo(
    () => Object.entries(locations).map(([id, cfg]) => ({ id, title: cfg.title, cfg })),
    [locations],
  );

  const [step, setStep] = useState(0);
  const [tone, setTone] = useState("devotional");
  const [language, setLanguage] = useState(defaultLanguage);
  const [routeId, setRouteId] = useState(routeChoices[0]?.id || "");
  const [basemap, setBasemap] = useState("relief");
  const [personalNote, setPersonalNote] = useState(() => readStoredNote(routeChoices[0]?.id || ""));

  const [stage, setStage] = useState("idle"); // idle | running | done | error
  const [progressMsg, setProgressMsg] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef(null);

  const palette = getPalette(tone);
  const route = routeChoices.find((r) => r.id === routeId)?.cfg;

  useEffect(() => { setPersonalNote(readStoredNote(routeId)); }, [routeId]);
  useEffect(() => { writeStoredNote(routeId, personalNote); }, [routeId, personalNote]);

  function onAutopilot() {
    const d = autopilotDefaults({
      routeChoices,
      device: { language: typeof navigator !== "undefined" ? navigator.language : "en" },
    });
    setTone(d.tone);
    setLanguage(d.language);
    setBasemap(d.basemap);
    if (d.routeId) setRouteId(d.routeId);
    setPersonalNote(d.personalNote);
    setStep(STEPS.length - 1); // jump to Review
  }

  function onSuggestNote() {
    if (!route) return;
    setPersonalNote(suggestPersonalNote({ config: route, tone }));
  }

  function canAdvance() {
    if (STEPS[step].id === "route") return !!routeId;
    return true; // every other step has a default
  }

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
      const [{ createOffscreenReelRenderer }, { encodeMp4 }] = await Promise.all([
        import("../../services/reelRenderer.js"),
        import("../../services/mp4Export.js"),
      ]);

      let createAudioBuffer;
      try {
        if (typeof OfflineAudioContext !== "undefined") {
          createAudioBuffer = (n, len, sr) => new OfflineAudioContext(n, len, sr).createBuffer(n, len, sr);
        }
      } catch { /* not available */ }

      const out = await runDirectorPipeline({
        config: route,
        palette,
        language,
        personalContext: personalNote,
        basemap,
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

  function onCancelRun() { abortRef.current?.abort(); }

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="director-root">
      <header className="director-header">
        <div>
          <h1 className="director-title">Director</h1>
          <p style={{ opacity: 0.7, margin: "0.2rem 0 0", fontSize: "0.9rem" }}>
            Step {step + 1} of {STEPS.length} · {currentStep.title}
          </p>
        </div>
        <button type="button" className="composer-cancel" onClick={onCancel} aria-label="Close director">×</button>
      </header>

      {/* Progress dots */}
      <div role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={STEPS.length}
           style={{ display: "flex", gap: 6, margin: "0.75rem 0 1rem" }}>
        {STEPS.map((s, i) => (
          <div key={s.id}
               aria-label={s.title}
               style={{
                 flex: 1, height: 4, borderRadius: 2,
                 background: i <= step ? palette.color.primary : "rgba(255,255,255,0.12)",
                 transition: "background 0.2s",
               }} />
        ))}
      </div>

      <p style={{ opacity: 0.75, margin: "0 0 1rem", fontSize: "0.95rem" }}>{currentStep.help}</p>

      {/* Autopilot — shown only on step 0 so we don't tempt mid-flow skips */}
      {step === 0 && stage === "idle" && (
        <div style={{ marginBottom: "1.2rem", padding: "0.75rem", borderRadius: 6,
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <button type="button" onClick={onAutopilot}
                  style={{
                    width: "100%", padding: "0.7rem 1rem", borderRadius: 6,
                    background: palette.color.primary, color: palette.color.parchment,
                    border: "none", cursor: "pointer", fontSize: "1rem", fontWeight: 600,
                  }}>
            ✨ AI Autopilot — direct it for me
          </button>
          <p style={{ margin: "0.5rem 0 0", opacity: 0.6, fontSize: "0.85rem" }}>
            We'll pick a tone, your device language, a map look, and a starter note. You can still edit anything before pressing Direct.
          </p>
        </div>
      )}

      {/* Step body */}
      <div style={{ minHeight: 180 }}>
        {currentStep.id === "tone" && (
          <section className="director-tone-grid" aria-label="Tone">
            {PALETTE_IDS.map((id) => {
              const p = getPalette(id);
              const active = id === tone;
              return (
                <button key={id} type="button"
                        className={active ? "director-tone active" : "director-tone"}
                        onClick={() => setTone(id)}
                        style={{
                          borderColor: active ? p.color.primary : "transparent",
                          background: active ? p.color.parchment : "transparent",
                          color: active ? p.color.ink : "inherit",
                        }}>
                  <span className="director-tone-name">{p.displayName}</span>
                </button>
              );
            })}
          </section>
        )}

        {currentStep.id === "route" && (
          <section className="director-row" aria-label="Route">
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)}
                    style={{ width: "100%", padding: "0.6rem", fontSize: "1rem" }}>
              {routeChoices.map((r) => (
                <option key={r.id} value={r.id}>{r.title}</option>
              ))}
            </select>
          </section>
        )}

        {currentStep.id === "basemap" && (
          <section className="director-row" aria-label="Map look">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {BASEMAP_OPTIONS.map((bm) => {
                const active = bm === basemap;
                return (
                  <button key={bm} type="button" onClick={() => setBasemap(bm)}
                          style={{
                            padding: "0.7rem 0.5rem", borderRadius: 6, cursor: "pointer",
                            border: active ? `2px solid ${palette.color.primary}` : "1px solid rgba(255,255,255,0.15)",
                            background: active ? palette.color.parchment : "transparent",
                            color: active ? palette.color.ink : "inherit",
                            fontSize: "0.85rem", textAlign: "left",
                          }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, textTransform: "capitalize" }}>{bm}</div>
                    <div style={{ opacity: 0.7, fontSize: "0.78rem" }}>{BASEMAP_LABELS[bm]}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {currentStep.id === "language" && (
          <section className="director-row" aria-label="Language">
            <div className="director-lang-chips" role="radiogroup">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button key={lang} type="button" role="radio"
                        aria-checked={language === lang}
                        className={language === lang ? "director-lang active" : "director-lang"}
                        onClick={() => setLanguage(lang)}>
                  {labelForLang(lang)}
                </button>
              ))}
            </div>
          </section>
        )}

        {currentStep.id === "note" && (
          <section className="director-row" aria-label="Personal note">
            <textarea id="director-personal-note" className="director-personal-note"
                      rows={4} maxLength={500}
                      placeholder="A relative who walked it. A first trip. What this journey means to you."
                      value={personalNote}
                      onChange={(e) => setPersonalNote(e.target.value)}
                      style={{
                        width: "100%", padding: "0.6rem 0.75rem", borderRadius: 6,
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        color: "inherit", fontFamily: "inherit", fontSize: "0.95rem",
                        resize: "vertical",
                      }} />
            <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button type="button" onClick={onSuggestNote}
                      style={{
                        padding: "0.35rem 0.8rem", background: "transparent",
                        border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4,
                        color: "inherit", cursor: "pointer", fontSize: "0.85rem",
                      }}>
                ✨ AI suggest
              </button>
              <span style={{ opacity: 0.5, fontSize: "0.8rem" }}>{personalNote.length} / 500</span>
            </div>
          </section>
        )}

        {currentStep.id === "review" && (
          <section aria-label="Review">
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "0.4rem 1rem", margin: 0 }}>
              <dt style={{ opacity: 0.6 }}>Tone</dt><dd style={{ margin: 0 }}>{palette.displayName}</dd>
              <dt style={{ opacity: 0.6 }}>Route</dt><dd style={{ margin: 0 }}>{route?.title || "—"}</dd>
              <dt style={{ opacity: 0.6 }}>Map</dt><dd style={{ margin: 0, textTransform: "capitalize" }}>{basemap}</dd>
              <dt style={{ opacity: 0.6 }}>Language</dt><dd style={{ margin: 0 }}>{labelForLang(language)}</dd>
              <dt style={{ opacity: 0.6 }}>Note</dt><dd style={{ margin: 0, opacity: personalNote ? 1 : 0.5 }}>
                {personalNote || "(no personal note)"}
              </dd>
            </dl>
          </section>
        )}
      </div>

      {/* Nav: Back / Next or Direct */}
      {stage === "idle" && (
        <div style={{ display: "flex", gap: 8, marginTop: "1.2rem" }}>
          <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))}
                  disabled={step === 0}
                  style={{
                    padding: "0.6rem 1rem", borderRadius: 6, cursor: step === 0 ? "default" : "pointer",
                    background: "transparent", color: "inherit",
                    border: "1px solid rgba(255,255,255,0.2)",
                    opacity: step === 0 ? 0.4 : 1,
                  }}>
            ← Back
          </button>
          {!isLast && (
            <button type="button" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                    disabled={!canAdvance()}
                    style={{
                      flex: 1, padding: "0.6rem 1rem", borderRadius: 6,
                      cursor: canAdvance() ? "pointer" : "default",
                      background: palette.color.primary, color: palette.color.parchment,
                      border: "none", fontWeight: 600,
                      opacity: canAdvance() ? 1 : 0.5,
                    }}>
              Next →
            </button>
          )}
          {isLast && (
            <button type="button" className="director-cta" onClick={onDirect}
                    disabled={!route}
                    style={{ flex: 1, background: palette.color.primary }}>
              Direct this journey
            </button>
          )}
        </div>
      )}

      {/* Running */}
      {stage === "running" && (
        <button type="button" className="director-cta" onClick={onCancelRun}
                style={{ marginTop: "1rem", background: palette.color.primary }}>
          {`${progressMsg || "Working"}${progressDetail ? ` · ${progressDetail}` : ""} (cancel)`}
        </button>
      )}

      {stage === "error" && (
        <div className="director-error" role="alert" style={{ marginTop: "1rem" }}>
          <strong>Couldn't direct:</strong> {errorMsg}
          <button type="button" onClick={() => setStage("idle")}
                  style={{
                    marginLeft: "0.6rem", padding: "0.25rem 0.6rem", borderRadius: 4,
                    background: "transparent", border: "1px solid rgba(255,255,255,0.3)",
                    color: "inherit", cursor: "pointer", fontSize: "0.8rem",
                  }}>
            Try again
          </button>
        </div>
      )}

      {stage === "done" && result && (
        <section className="director-result" aria-label="Result" style={{ marginTop: "1rem" }}>
          <div className="director-downloads">
            <a className="director-download" href={result.mp4Url} download={`${route.id}-${tone}-${language}.mp4`}>
              ⬇ MP4 ({result.frameCount} frames · {result.durationS.toFixed(0)}s)
            </a>
            <a className="director-download" href={result.postcardUrl} download={`${route.id}-${tone}-${language}-postcard.png`}>
              ⬇ Postcard PNG
            </a>
          </div>
          <p className="director-note">
            Audio mixer ran in <code>{result.mode}</code> mode. {result.audioBuffer
              ? "Embedded into the MP4."
              : "MP4 is silent (OfflineAudioContext unavailable in this environment)."}
          </p>
          <button type="button" onClick={() => { setStage("idle"); setResult(null); setStep(0); }}
                  style={{
                    marginTop: "0.5rem", padding: "0.4rem 0.8rem", borderRadius: 4,
                    background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
                    color: "inherit", cursor: "pointer", fontSize: "0.85rem",
                  }}>
            Direct another
          </button>
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
