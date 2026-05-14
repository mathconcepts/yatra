import { useState, useMemo, useRef, useEffect } from "react";
import { PALETTE_IDS, getPalette, SUPPORTED_LANGUAGES } from "../../services/tonePalettes/index.js";
import { runDirectorPipeline } from "../../services/directorPipeline.js";
import { suggestPersonalNote } from "../../services/directorScript.js";
import { BASEMAP_LABELS } from "../../services/basemapStyles.js";
import { readUserSettings } from "../../services/userSettings.js";
import { voicesForLanguage } from "../../services/voiceCatalog.js";
import { BGM_TRACKS, defaultBgmForTone, getBgmTrack } from "../../services/bgmCatalog.js";
import { TRAVELER_PROFILES, applyTravelerProfile } from "../../services/travelerProfile.js";
import { loadBgm, defaultBgmStartOffsetS } from "../../services/bgmMixer.js";
import TeleprompterRecorder from "./TeleprompterRecorder.jsx";
import TurnstileWidget from "../turnstile/TurnstileWidget.jsx";

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

const DURATION_PRESETS_S = [15, 30, 60, 90];

const STEP_DEFINITIONS = [
  { id: "tone",      title: "Pick a tone",         help: "How should the film feel?" },
  { id: "route",     title: "Pick a location",     help: "Which journey are we directing?" },
  { id: "mode",      title: "Pick a mode",         help: "A trail journey, or a tour of places within this location?" },
  { id: "trail",     title: "Pick a trail",        help: "This location has multiple ways up. Choose one." },
  { id: "tour",      title: "Pick the places",     help: "Which spots should the film visit, and how to share the time?" },
  { id: "basemap",   title: "Pick a map look",     help: "What kind of map sits under the journey?" },
  { id: "language",  title: "Pick a language",     help: "Which language should the narrator speak?" },
  { id: "narration", title: "Pick a narration source", help: "AI voice, your voice, or your own TTS service?" },
  { id: "voice",     title: "Pick a voice",        help: "Who narrates the film?" },
  { id: "music",     title: "Pick background music", help: "What plays underneath the narration?" },
  { id: "profile",   title: "Who's walking?",      help: "Optional — a quick traveler profile shapes the narration." },
  { id: "duration",  title: "Pick a duration",     help: "How long should the film be?" },
  { id: "note",      title: "Tell us about it",    help: "Optional — a relative, a memory, what this means to you." },
  { id: "review",    title: "Ready to direct",     help: "We'll compose script, voice, mix, and cut." },
];

/**
 * Pure: compute the visible wizard steps for the current state.
 *
 * The Mode step only appears when the location has tours[].
 * Trail step appears in point-to-point mode (and only if the location
 * has 2+ trail variants).
 * Tour step appears only in tour mode.
 */
export function buildSteps({ locationHasTours, mode, locationHasMultipleTrails, narrationSource }) {
  return STEP_DEFINITIONS.filter((s) => {
    if (s.id === "mode") return locationHasTours;
    if (s.id === "trail") return mode === "point-to-point" && locationHasMultipleTrails;
    if (s.id === "tour")  return mode === "tour";
    // Voice picker only applies when AI is doing the narration. If
    // the user picked "Record your own", their voice IS the voice —
    // skip the Google TTS voice list.
    if (s.id === "voice") return narrationSource !== "record";
    return true;
  });
}

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
export default function DirectorView({ locations = {}, initialLocationId, atlasConfig, onCancel }) {
  const routeChoices = useMemo(
    () => Object.entries(locations).map(([id, cfg]) => ({ id, title: cfg.title, cfg })),
    [locations],
  );
  // Prefer the location the user already picked on the Atlas surface; fall
  // back to the first location only if nothing was passed in.
  const initialId = initialLocationId && locations[initialLocationId]
    ? initialLocationId
    : (routeChoices[0]?.id || "");

  const [step, setStep] = useState(0);
  const [tone, setTone] = useState("devotional");
  const [language, setLanguage] = useState(defaultLanguage);
  const [routeId, setRouteId] = useState(initialId);
  const [basemap, setBasemap] = useState("relief");
  const [personalNote, setPersonalNote] = useState(() => readStoredNote(initialId));
  const [trailId, setTrailId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  // Tour mode state (Yatra v1.8)
  const [mode, setMode] = useState("point-to-point");      // "point-to-point" | "tour"
  const [tourId, setTourId] = useState("");                // selected tour id
  const [coverage, setCoverage] = useState("equal");       // "equal" | "single:<poiId>" | "custom"
  const [poiSelection, setPoiSelection] = useState(null);  // Set<poiId> | null = all
  const [customRatios, setCustomRatios] = useState({});    // {poiId: 0..1}
  const [totalDurationS, setTotalDurationS] = useState(30);
  const [bgmId, setBgmId] = useState(() => defaultBgmForTone("devotional"));
  const [bgmFile, setBgmFile] = useState(null);            // user-uploaded local mp3
  const [bgmStartOffsetS, setBgmStartOffsetS] = useState(0);
  const [profileId, setProfileId] = useState("skip");
  // Narration source: "ai" (Google TTS via Worker / BYOK) | "record" (mic teleprompter)
  const [narrationSource, setNarrationSource] = useState("ai");
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [recordedScenes, setRecordedScenes] = useState(null); // Float32Array[] | null
  const [scriptForRecording, setScriptForRecording] = useState(null); // generated script preview

  const [stage, setStage] = useState("idle"); // idle | running | done | error
  const [progressMsg, setProgressMsg] = useState("");
  const [progressDetail, setProgressDetail] = useState("");
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [turnstileToken, setTurnstileToken] = useState(null);
  const abortRef = useRef(null);

  const palette = getPalette(tone);
  const route = routeChoices.find((r) => r.id === routeId)?.cfg;
  const trails = route?.routes || [];
  const tours = route?.tours || [];
  const locationHasTours = tours.length > 0;
  const locationHasMultipleTrails = trails.length > 1;
  const selectedTrail = trails.find((t) => t.id === trailId) || trails[0] || null;
  const selectedTour = tours.find((t) => t.id === tourId) || tours[0] || null;
  const tourPois = selectedTour
    ? selectedTour.pois.map((id) => (route?.landmarks || []).find((l) => l.id === id)).filter(Boolean)
    : [];
  const activePoiIds = poiSelection || new Set(tourPois.map((p) => p.id));
  const activePois = tourPois.filter((p) => activePoiIds.has(p.id));
  const effectiveCoverage = coverage === "custom"
    ? customRatios
    : coverage;
  const voiceOptions = voicesForLanguage(language);
  const effectiveVoiceId = voiceId || palette.voice?.voiceIdByLang?.[language] || "";

  const STEPS = useMemo(
    () => buildSteps({ locationHasTours, mode, locationHasMultipleTrails, narrationSource }),
    [locationHasTours, mode, locationHasMultipleTrails, narrationSource],
  );

  // Reset trail when the location changes; pre-select the first trail
  // so the wizard never advances with no trail picked.
  useEffect(() => {
    if (trails.length > 0 && !trails.find((t) => t.id === trailId)) {
      setTrailId(trails[0].id);
    }
  }, [trails, trailId]);
  // Reset tour selection when location changes; clamp mode back to
  // point-to-point when the new location has no tours.
  useEffect(() => {
    if (!locationHasTours && mode === "tour") setMode("point-to-point");
    if (tours.length > 0 && !tours.find((t) => t.id === tourId)) {
      setTourId(tours[0].id);
    }
  }, [tours, tourId, locationHasTours, mode]);
  // Clamp the step index when STEPS shrinks (e.g. user toggled mode
  // and we removed the trail or tour step from the list).
  useEffect(() => {
    if (step >= STEPS.length) setStep(Math.max(0, STEPS.length - 1));
  }, [STEPS.length, step]);
  // Reset voice when language changes; the previous voice may not exist
  // in the new language catalog.
  useEffect(() => { setVoiceId(""); }, [language]);
  // When tone changes, suggest a tone-matched BGM but let manual picks stick.
  useEffect(() => {
    const suggested = defaultBgmForTone(tone);
    setBgmId((current) => (current === "silence" || !current) ? suggested : current);
  }, [tone]);

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
    // Trail + voice resolve via useEffect once route + language settle.
    setTrailId("");
    setVoiceId("");
    setStep(STEPS.length - 1); // jump to Review
  }

  function onSuggestNote() {
    if (!route) return;
    setPersonalNote(suggestPersonalNote({ config: route, tone }));
  }

  function canAdvance() {
    const id = STEPS[step].id;
    if (id === "route") return !!routeId;
    if (id === "trail") return trails.length === 0 || !!(trailId || trails[0]?.id);
    if (id === "tour")  return activePois.length >= 1;
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
      let bgmBuffer = null;
      try {
        if (typeof OfflineAudioContext !== "undefined") {
          createAudioBuffer = (n, len, sr) => new OfflineAudioContext(n, len, sr).createBuffer(n, len, sr);
        }
      } catch { /* not available */ }
      // Load BGM. Priority: user-uploaded file > catalog track URL.
      if (typeof AudioContext !== "undefined") {
        const ctx = new AudioContext();
        try {
          if (bgmFile) {
            const ab = await bgmFile.arrayBuffer();
            bgmBuffer = await ctx.decodeAudioData(ab);
          } else {
            const track = getBgmTrack(bgmId);
            if (track?.url) {
              bgmBuffer = await loadBgm({ url: track.url, audioContext: ctx });
            }
          }
        } catch { /* BGM unavailable — proceed without */ }
        ctx.close?.();
      }

      const out = await runDirectorPipeline({
        config: route,
        palette,
        language,
        personalContext: applyTravelerProfile(personalNote, profileId),
        basemap,
        routeVariantId: selectedTrail?.id || null,
        mode,
        tourId: mode === "tour" ? (selectedTour?.id || null) : null,
        coverageWeights: effectiveCoverage,
        poiSubset: mode === "tour" ? activePoiIds : null,
        totalDurationS,
        voiceOverride: effectiveVoiceId,
        bgmBuffer,
        bgmStartOffsetS,
        prerecordedTracks: narrationSource === "record" ? recordedScenes : null,
        turnstileToken,
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

  /** Generate the script preview, then open the teleprompter recorder. */
  async function openRecorder() {
    if (!route) return;
    setRecorderOpen(true);
    try {
      const { generateScript } = await import("../../services/directorScript.js");
      const script = await generateScript({
        config: route, tone, language,
        personalContext: applyTravelerProfile(personalNote, profileId),
        routeVariantId: selectedTrail?.id || null,
        mode,
        tourId: mode === "tour" ? selectedTour?.id || null : null,
        coverageWeights: effectiveCoverage,
        poiSubset: mode === "tour" ? activePoiIds : null,
        totalDurationS,
      });
      setScriptForRecording(script);
    } catch (err) {
      setRecorderOpen(false);
      setErrorMsg(err?.message || "Could not prepare the script for recording.");
    }
  }

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

      {/* Invisible Turnstile widget. No-op when site key is unset. */}
      <TurnstileWidget onToken={setTurnstileToken} action="director" />

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
            {route?.landmarks?.length > 0 && (
              <div style={{ marginTop: "0.75rem", fontSize: "0.85rem", opacity: 0.8 }}>
                <strong style={{ display: "block", marginBottom: "0.4rem", opacity: 0.7 }}>
                  Places we'll narrate along the way:
                </strong>
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {route.landmarks.slice(0, 6).map((lm) => (
                    <li key={lm.id || lm.name}>
                      <strong>{lm.name}</strong>
                      {lm.blurb && <span style={{ opacity: 0.75 }}> — {lm.blurb.slice(0, 110)}{lm.blurb.length > 110 ? "…" : ""}</span>}
                    </li>
                  ))}
                  {route.landmarks.length > 6 && (
                    <li style={{ opacity: 0.6 }}>and {route.landmarks.length - 6} more</li>
                  )}
                </ul>
              </div>
            )}
          </section>
        )}

        {currentStep.id === "mode" && (
          <section className="director-row" aria-label="Mode">
            <div role="radiogroup" style={{ display: "grid", gap: 10 }}>
              {[
                {
                  id: "point-to-point",
                  title: "Trail journey",
                  blurb: trails.length > 1
                    ? `Walk one of the ${trails.length} known trails end-to-end (origin → destination), narrated along the way.`
                    : "Walk the route end-to-end (origin → destination), narrated along the way.",
                },
                {
                  id: "tour",
                  title: "Tour of places",
                  blurb: `Pick from ${tours.length} curated tour${tours.length === 1 ? "" : "s"} of landmarks within ${route?.title || "this location"}. Each spot gets its own scene; you choose how to share the time.`,
                },
              ].map((opt) => {
                const active = opt.id === mode;
                return (
                  <button key={opt.id} type="button" role="radio" aria-checked={active}
                          onClick={() => setMode(opt.id)}
                          style={{
                            textAlign: "left", padding: "0.85rem 1rem", borderRadius: 8, cursor: "pointer",
                            border: active ? `2px solid ${palette.color.primary}` : "1px solid rgba(255,255,255,0.15)",
                            background: active ? palette.color.parchment : "transparent",
                            color: active ? palette.color.ink : "inherit",
                          }}>
                    <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: 4 }}>{opt.title}</div>
                    <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>{opt.blurb}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {currentStep.id === "tour" && (
          <section className="director-row" aria-label="Tour">
            {tours.length > 0 && (
              <div style={{ display: "grid", gap: 6, marginBottom: "1rem" }}>
                <div style={{ opacity: 0.7, fontSize: "0.83rem" }}>Which tour:</div>
                <select value={tourId || selectedTour?.id || ""}
                        onChange={(e) => {
                          setTourId(e.target.value);
                          setCoverage("equal");
                          setPoiSelection(null);
                          setCustomRatios({});
                        }}
                        style={{ width: "100%", padding: "0.55rem", fontSize: "0.95rem" }}>
                  {tours.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}{t.subtitle ? ` — ${t.subtitle}` : ""}</option>
                  ))}
                </select>
              </div>
            )}

            {tourPois.length > 1 && (
              <div style={{ display: "grid", gap: 6, marginBottom: "1rem" }}>
                <div style={{ opacity: 0.7, fontSize: "0.83rem" }}>
                  Which places to include ({activePois.length} of {tourPois.length}):
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {tourPois.map((p) => {
                    const on = activePoiIds.has(p.id);
                    return (
                      <button key={p.id} type="button"
                              onClick={() => {
                                const next = new Set(activePoiIds);
                                if (on) next.delete(p.id); else next.add(p.id);
                                if (next.size === 0) return; // never empty
                                setPoiSelection(next);
                                // If user toggled away the singled POI, fall back to equal
                                if (coverage.startsWith("single:") && !next.has(coverage.slice("single:".length))) {
                                  setCoverage("equal");
                                }
                              }}
                              style={{
                                padding: "0.4rem 0.7rem", borderRadius: 999, fontSize: "0.82rem", cursor: "pointer",
                                border: on ? `1.5px solid ${palette.color.primary}` : "1px solid rgba(255,255,255,0.18)",
                                background: on ? palette.color.parchment : "transparent",
                                color: on ? palette.color.ink : "inherit",
                              }}>
                        {on ? "✓ " : ""}{p.name}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" style={chipStyle()} onClick={() => setPoiSelection(new Set(tourPois.map((p) => p.id)))}>All</button>
                  <button type="button" style={chipStyle()} onClick={() => setPoiSelection(new Set(tourPois.slice(0, 2).map((p) => p.id)))}>First two</button>
                  <button type="button" style={chipStyle()} onClick={() => setPoiSelection(new Set([tourPois[0]?.id].filter(Boolean)))}>One</button>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ opacity: 0.7, fontSize: "0.83rem", marginBottom: "0.2rem" }}>
                How to share the time across {activePois.length} place{activePois.length === 1 ? "" : "s"}:
              </div>
              <button type="button" onClick={() => setCoverage("equal")}
                      style={coverageBtnStyle(coverage === "equal", palette)}>
                <strong>Equal time</strong>
                <div style={{ opacity: 0.75, fontSize: "0.82rem", marginTop: 4 }}>
                  Every spot gets the same slice ({activePois.length > 0 ? `~${(totalDurationS / activePois.length).toFixed(1)}s` : ""} each).
                </div>
              </button>
              {activePois.length > 1 && activePois.map((p) => (
                <button key={p.id} type="button" onClick={() => setCoverage(`single:${p.id}`)}
                        style={coverageBtnStyle(coverage === `single:${p.id}`, palette)}>
                  <strong>Focus on {p.name}</strong>
                  <div style={{ opacity: 0.75, fontSize: "0.82rem", marginTop: 4 }}>
                    {p.name} gets 80%; the others share the remaining 20%.
                  </div>
                </button>
              ))}
              {activePois.length > 1 && (
                <button type="button" onClick={() => {
                  setCoverage("custom");
                  // Seed equal weights so sliders start sensibly
                  const equal = 1 / activePois.length;
                  const seed = {};
                  for (const p of activePois) seed[p.id] = Math.round(equal * 100) / 100;
                  setCustomRatios(seed);
                }} style={coverageBtnStyle(coverage === "custom", palette)}>
                  <strong>Custom mix</strong>
                  <div style={{ opacity: 0.75, fontSize: "0.82rem", marginTop: 4 }}>
                    Slide percentages per place. We'll normalize to 100%.
                  </div>
                </button>
              )}
            </div>

            {coverage === "custom" && activePois.length > 1 && (
              <div style={{ marginTop: "0.8rem", display: "grid", gap: 8 }}>
                {activePois.map((p) => {
                  const v = Number(customRatios[p.id] ?? 0);
                  return (
                    <label key={p.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, fontSize: "0.85rem" }}>
                      <span>{p.name}</span>
                      <span style={{ opacity: 0.7 }}>{Math.round(v * 100)}%</span>
                      <input type="range" min="0.05" max="1" step="0.05" value={v}
                             onChange={(e) => setCustomRatios((r) => ({ ...r, [p.id]: Number(e.target.value) }))}
                             style={{ gridColumn: "1 / -1" }} />
                    </label>
                  );
                })}
                <div style={{ opacity: 0.6, fontSize: "0.78rem" }}>
                  Total weights normalize to 100% — only relative size matters.
                </div>
              </div>
            )}

            {activePois.length > 0 && (
              <div style={{ marginTop: "0.9rem", fontSize: "0.82rem", opacity: 0.7 }}>
                <strong>Scene order:</strong> {activePois.map((p) => p.name).join(" → ")}
              </div>
            )}
          </section>
        )}

        {currentStep.id === "narration" && (
          <section className="director-row" aria-label="Narration source">
            <div role="radiogroup" style={{ display: "grid", gap: 8 }}>
              <button type="button" role="radio" aria-checked={narrationSource === "ai"}
                      onClick={() => { setNarrationSource("ai"); setRecordedScenes(null); }}
                      style={coverageBtnStyle(narrationSource === "ai", palette)}>
                <strong>AI voice</strong>
                <div style={{ opacity: 0.75, fontSize: "0.82rem", marginTop: 4 }}>
                  Google TTS (via the Worker, or your BYOK key in Settings). Pick the voice in the next step. Silent in dev mode without a Worker.
                </div>
              </button>
              <button type="button" role="radio" aria-checked={narrationSource === "record"}
                      onClick={() => { setNarrationSource("record"); }}
                      style={coverageBtnStyle(narrationSource === "record", palette)}>
                <strong>🎙 Record your own (with teleprompter)</strong>
                <div style={{ opacity: 0.75, fontSize: "0.82rem", marginTop: 4 }}>
                  We'll generate a script and show it scene by scene. You record your voice; we mix it into the MP4. No network needed.
                </div>
              </button>
            </div>
            {narrationSource === "record" && (
              <div style={{ marginTop: "0.8rem" }}>
                {!recordedScenes && (
                  <button type="button" onClick={openRecorder}
                          style={{ padding: "0.6rem 1rem", borderRadius: 6, border: "none", cursor: "pointer",
                                   background: "#8a4528", color: "#f4e8d0", fontWeight: 600 }}>
                    {recorderOpen ? "Generating script…" : "Open recorder →"}
                  </button>
                )}
                {recordedScenes && (
                  <div style={{ padding: "0.6rem 0.8rem", borderRadius: 6, background: "rgba(80,160,90,0.15)",
                                border: "1px solid rgba(80,160,90,0.4)", fontSize: "0.85rem" }}>
                    ✓ Recorded {recordedScenes.length} scene{recordedScenes.length === 1 ? "" : "s"}.
                    <button type="button" onClick={() => { setRecordedScenes(null); openRecorder(); }}
                            style={{ marginLeft: 12, padding: "0.2rem 0.6rem", borderRadius: 4,
                                     background: "transparent", border: "1px solid rgba(255,255,255,0.2)",
                                     color: "inherit", cursor: "pointer", fontSize: "0.78rem" }}>
                      Re-record
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {currentStep.id === "music" && (
          <section className="director-row" aria-label="Background music">
            <div role="radiogroup" style={{ display: "grid", gap: 8 }}>
              {BGM_TRACKS.map((t) => {
                const active = !bgmFile && t.id === bgmId;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={active}
                          onClick={() => { setBgmId(t.id); setBgmFile(null); setBgmStartOffsetS(defaultBgmStartOffsetS(t.durationS)); }}
                          style={coverageBtnStyle(active, palette)}>
                    <strong>{t.name}</strong>
                    <div style={{ opacity: 0.75, fontSize: "0.82rem", marginTop: 4 }}>{t.blurb}</div>
                  </button>
                );
              })}
              {/* Local upload */}
              <label style={{ ...coverageBtnStyle(!!bgmFile, palette), display: "block", cursor: "pointer" }}>
                <strong>📁 Upload your own (mp3 / m4a / wav)</strong>
                <div style={{ opacity: 0.75, fontSize: "0.82rem", marginTop: 4 }}>
                  {bgmFile
                    ? `Loaded: ${bgmFile.name} (${(bgmFile.size / 1024 / 1024).toFixed(1)} MB)`
                    : "Pick any audio file from this device. Stays local — never uploaded anywhere."}
                </div>
                <input type="file" accept="audio/*" style={{ display: "none" }}
                       onChange={(e) => {
                         const f = e.target.files?.[0];
                         if (!f) return;
                         setBgmFile(f);
                         setBgmId("custom-upload");
                         setBgmStartOffsetS(0);
                       }} />
              </label>
            </div>

            {/* Start offset slider — for any non-silence track */}
            {((bgmFile) || (getBgmTrack(bgmId)?.url)) && (
              <div style={{ marginTop: "0.8rem", display: "grid", gap: 6 }}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: "0.85rem" }}>
                  <span>Start the clip at:</span>
                  <span style={{ opacity: 0.7 }}>{bgmStartOffsetS.toFixed(1)}s in</span>
                </label>
                <input type="range" min="0" max="60" step="0.5" value={bgmStartOffsetS}
                       onChange={(e) => setBgmStartOffsetS(Number(e.target.value))} />
                <div style={{ opacity: 0.55, fontSize: "0.78rem" }}>
                  AI defaults to 5s in (skips most intros). Drag to override.
                </div>
              </div>
            )}

            <p style={{ margin: "0.6rem 0 0", fontSize: "0.78rem", opacity: 0.6 }}>
              Music ducks under the narration automatically (-12 dB).
              Catalog tracks are CC0. If a catalog track isn't installed yet, the film renders narrator-only — upload your own to be safe.
            </p>
          </section>
        )}

        {currentStep.id === "profile" && (
          <section className="director-row" aria-label="Traveler profile">
            <div role="radiogroup" style={{ display: "grid", gap: 8 }}>
              {TRAVELER_PROFILES.map((p) => {
                const active = p.id === profileId;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={active}
                          onClick={() => setProfileId(p.id)}
                          style={coverageBtnStyle(active, palette)}>
                    <strong>{p.label}</strong>
                    <div style={{ opacity: 0.75, fontSize: "0.82rem", marginTop: 4 }}>{p.blurb}</div>
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "0.6rem 0 0", fontSize: "0.78rem", opacity: 0.6 }}>
              The profile becomes a small hint inside the narration prompt. No personal details are sent beyond what you type in the next step.
            </p>
          </section>
        )}

        {currentStep.id === "duration" && (
          <section className="director-row" aria-label="Duration">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {DURATION_PRESETS_S.map((sec) => {
                const active = sec === totalDurationS;
                return (
                  <button key={sec} type="button" onClick={() => setTotalDurationS(sec)}
                          style={{
                            padding: "0.7rem 0.4rem", borderRadius: 6, cursor: "pointer",
                            border: active ? `2px solid ${palette.color.primary}` : "1px solid rgba(255,255,255,0.15)",
                            background: active ? palette.color.parchment : "transparent",
                            color: active ? palette.color.ink : "inherit",
                            fontWeight: 600, fontSize: "0.95rem",
                          }}>
                    {sec}s
                  </button>
                );
              })}
            </div>
            <p style={{ margin: "0.6rem 0 0", fontSize: "0.8rem", opacity: 0.65 }}>
              Shorter films pace tighter; longer films let the narrator linger. Default 30s
              fits Reels and stories; 60-90s suits longer-form Johnny-Harris-style edits.
            </p>
          </section>
        )}

        {currentStep.id === "trail" && (
          <section className="director-row" aria-label="Trail">
            {trails.length === 0 && (
              <p style={{ opacity: 0.6, fontStyle: "italic" }}>
                This location has only one path — no trail choice needed. Hit Next.
              </p>
            )}
            {trails.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                {trails.map((t) => {
                  const active = t.id === (trailId || trails[0].id);
                  return (
                    <button key={t.id} type="button" onClick={() => setTrailId(t.id)}
                            style={{
                              display: "block", textAlign: "left", padding: "0.7rem 0.9rem", borderRadius: 6,
                              cursor: "pointer",
                              border: active ? `2px solid ${palette.color.primary}` : "1px solid rgba(255,255,255,0.15)",
                              background: active ? palette.color.parchment : "transparent",
                              color: active ? palette.color.ink : "inherit",
                            }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <strong style={{ fontSize: "1rem" }}>{t.name}</strong>
                        <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{t.difficulty || ""}</span>
                      </div>
                      <div style={{ fontSize: "0.82rem", marginTop: "0.25rem", opacity: 0.75 }}>
                        {t.stats?.distanceKm ? `${t.stats.distanceKm} km` : ""}
                        {t.stats?.steps ? ` · ${t.stats.steps.toLocaleString()} steps` : ""}
                        {t.stats?.durationHr ? ` · ~${t.stats.durationHr} hr` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
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

        {currentStep.id === "voice" && (
          <section className="director-row" aria-label="Voice">
            {voiceOptions.length === 0 && (
              <p style={{ opacity: 0.65, fontStyle: "italic" }}>
                No voice options published for this language yet — we'll use the palette default.
              </p>
            )}
            {voiceOptions.length > 0 && (
              <div role="radiogroup" style={{ display: "grid", gap: 8 }}>
                {voiceOptions.map((v) => {
                  const active = v.id === effectiveVoiceId;
                  return (
                    <button key={v.id} type="button" role="radio" aria-checked={active}
                            onClick={() => setVoiceId(v.id)}
                            style={{
                              textAlign: "left", padding: "0.6rem 0.8rem", borderRadius: 6, cursor: "pointer",
                              border: active ? `2px solid ${palette.color.primary}` : "1px solid rgba(255,255,255,0.15)",
                              background: active ? palette.color.parchment : "transparent",
                              color: active ? palette.color.ink : "inherit",
                              fontSize: "0.9rem",
                            }}>
                      {v.label}
                    </button>
                  );
                })}
                <p style={{ margin: "0.4rem 0 0", fontSize: "0.78rem", opacity: 0.6 }}>
                  Picked from Google Cloud TTS · pitch and tempo stay on the {palette.displayName.toLowerCase()} palette.
                </p>
              </div>
            )}
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
              <dt style={{ opacity: 0.6 }}>Mode</dt><dd style={{ margin: 0 }}>
                {mode === "tour"
                  ? `Tour — ${selectedTour?.name || ""}`
                  : "Trail journey"}
              </dd>
              {mode === "point-to-point" && (
                <>
                  <dt style={{ opacity: 0.6 }}>Trail</dt><dd style={{ margin: 0 }}>{selectedTrail?.name || "—"}</dd>
                </>
              )}
              {mode === "tour" && (
                <>
                  <dt style={{ opacity: 0.6 }}>Stops</dt>
                  <dd style={{ margin: 0, fontSize: "0.85rem" }}>
                    {tourPois.map((p) => p.name).join(" → ") || "—"}
                  </dd>
                  <dt style={{ opacity: 0.6 }}>Timing</dt>
                  <dd style={{ margin: 0, fontSize: "0.85rem" }}>
                    {coverage === "equal"
                      ? "Equal time"
                      : coverage?.startsWith("single:")
                        ? `Focus: ${tourPois.find((p) => p.id === coverage.slice("single:".length))?.name || "—"}`
                        : "Custom"}
                  </dd>
                </>
              )}
              <dt style={{ opacity: 0.6 }}>Map</dt><dd style={{ margin: 0, textTransform: "capitalize" }}>{basemap}</dd>
              <dt style={{ opacity: 0.6 }}>Language</dt><dd style={{ margin: 0 }}>{labelForLang(language)}</dd>
              <dt style={{ opacity: 0.6 }}>Voice</dt><dd style={{ margin: 0, fontSize: "0.85rem" }}>{effectiveVoiceId || "—"}</dd>
              <dt style={{ opacity: 0.6 }}>Music</dt><dd style={{ margin: 0 }}>{getBgmTrack(bgmId)?.name || "—"}</dd>
              <dt style={{ opacity: 0.6 }}>Profile</dt><dd style={{ margin: 0 }}>
                {TRAVELER_PROFILES.find((p) => p.id === profileId)?.label || "—"}
              </dd>
              <dt style={{ opacity: 0.6 }}>Duration</dt><dd style={{ margin: 0 }}>{totalDurationS}s</dd>
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
            {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
              <button type="button" className="director-download" style={{ cursor: "pointer", border: "none" }}
                      onClick={async () => {
                        try {
                          const res = await fetch(result.mp4Url);
                          const blob = await res.blob();
                          const file = new File([blob], `${route.id}-${tone}.mp4`, { type: "video/mp4" });
                          if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
                            await navigator.share({ title: route.title, text: "Made with Yatra", url: location.href });
                          } else {
                            await navigator.share({ title: route.title, text: "Made with Yatra", files: [file] });
                          }
                        } catch { /* user cancelled / unsupported */ }
                      }}>
                ↗ Share
              </button>
            )}
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

      {recorderOpen && scriptForRecording && (
        <div role="dialog" aria-modal="true"
             style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)",
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }}>
          <div style={{ background: "#1a1d24", borderRadius: 10, maxWidth: 640, width: "100%",
                        maxHeight: "92vh", overflowY: "auto", padding: "1rem 1.2rem" }}>
            <TeleprompterRecorder
              scenes={scriptForRecording.scenes}
              sampleRate={48000}
              onComplete={(tracks) => {
                setRecordedScenes(tracks);
                setRecorderOpen(false);
                setScriptForRecording(null);
              }}
              onCancel={() => { setRecorderOpen(false); setScriptForRecording(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function labelForLang(lang) {
  return { en: "English", hi: "हिन्दी", te: "తెలుగు", ta: "தமிழ்" }[lang] || lang;
}

function chipStyle() {
  return {
    padding: "0.25rem 0.65rem", borderRadius: 999, fontSize: "0.75rem", cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: "inherit",
  };
}

function coverageBtnStyle(active, palette) {
  return {
    textAlign: "left", padding: "0.65rem 0.85rem", borderRadius: 6, cursor: "pointer",
    border: active ? `2px solid ${palette.color.primary}` : "1px solid rgba(255,255,255,0.15)",
    background: active ? palette.color.parchment : "transparent",
    color: active ? palette.color.ink : "inherit",
    width: "100%", display: "block",
  };
}
