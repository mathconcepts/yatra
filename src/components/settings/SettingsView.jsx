import { useState, useEffect, useRef } from "react";
import {
  readUserSettings,
  writeUserSettings,
  clearUserSettings,
} from "../../services/userSettings.js";
import { callAnthropicDirect } from "../../services/anthropicDirectClient.js";
import { getSystemPrompt } from "../../services/directorPrompts.js";

/**
 * Settings surface — BYOK key entry and custom Worker URL override.
 *
 * Three fields, each with masked input, "Show", "Test", and "Save".
 * - Anthropic key:  validated by a real /v1/messages call (1-token).
 * - Google TTS key: validated by a real /v1/text:synthesize call.
 * - Worker URL:     no upstream validation; a type-to-confirm modal
 *                   on save protects against accidental exfiltration.
 *
 * All values live in localStorage (yatra.settings.byok.v1) on this
 * browser only. "Forget all keys" clears the entire entry.
 */

const FIELD_DEFS = [
  {
    key: "anthropicKey",
    label: "Anthropic API key",
    placeholder: "sk-ant-...",
    help: "Used for script generation. The browser calls api.anthropic.com directly — this key never touches our Worker.",
  },
  {
    key: "googleTtsKey",
    label: "Google Cloud TTS API key",
    placeholder: "AIza...",
    help: "Used for narration audio. Forwarded to our Worker as X-Yatra-User-TTS-Key; Worker uses it once per call and never logs or stores it.",
  },
  {
    key: "workerUrl",
    label: "Custom Worker URL",
    placeholder: "https://yatra-director.<your>.workers.dev",
    help: "Self-hosted escape hatch: route ALL Director calls (including any keys above) to your own Worker instead of ours. Leave blank to use the default.",
  },
];

export default function SettingsView({ onCancel }) {
  const [values, setValues] = useState(() => readUserSettings());
  const [visible, setVisible] = useState({}); // {fieldKey: true} when "Show" is on
  const [testState, setTestState] = useState({}); // {fieldKey: {status, message}}
  const [confirmModal, setConfirmModal] = useState(null); // {fieldKey, value, hostname, typed}

  // Pending text for each field (not yet saved). We separate from `values`
  // so the "Save" affordance maps cleanly to localStorage writes.
  const [pending, setPending] = useState(() => ({ ...readUserSettings() }));
  const fieldRefs = useRef({});

  useEffect(() => {
    setPending({ ...values });
  }, [values]);

  function onChange(key, val) {
    setPending((p) => ({ ...p, [key]: val }));
    setTestState((t) => ({ ...t, [key]: null })); // invalidate prior test result
  }

  async function onTest(key) {
    const val = pending[key];
    if (!val) {
      setTestState((t) => ({ ...t, [key]: { status: "error", message: "Field is empty." } }));
      return;
    }
    setTestState((t) => ({ ...t, [key]: { status: "testing", message: "Validating…" } }));
    try {
      const message = await testKey(key, val);
      setTestState((t) => ({ ...t, [key]: { status: "ok", message } }));
    } catch (err) {
      setTestState((t) => ({ ...t, [key]: { status: "error", message: mapValidationError(err) } }));
    }
  }

  function onSave(key) {
    const val = pending[key];
    // Worker URL save requires type-to-confirm when the value is non-empty
    // and differs from current (the eng-review trust gate).
    if (key === "workerUrl" && val && val !== values.workerUrl) {
      let hostname = "";
      try { hostname = new URL(val).hostname; } catch { hostname = ""; }
      if (!hostname) {
        setTestState((t) => ({ ...t, [key]: { status: "error", message: "Invalid URL." } }));
        return;
      }
      setConfirmModal({ fieldKey: key, value: val, hostname, typed: "" });
      return;
    }
    writeUserSettings({ [key]: val || "" });
    setValues(readUserSettings());
  }

  function onForget(key) {
    writeUserSettings({ [key]: "" });
    setValues(readUserSettings());
    setTestState((t) => ({ ...t, [key]: null }));
  }

  function onForgetAll() {
    clearUserSettings();
    setValues({});
    setTestState({});
  }

  function onConfirmWorkerUrl() {
    if (!confirmModal) return;
    if (confirmModal.typed !== confirmModal.hostname) return;
    writeUserSettings({ workerUrl: confirmModal.value });
    setValues(readUserSettings());
    setConfirmModal(null);
  }

  return (
    <div className="director-root" style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem" }}>
      <header className="director-header">
        <h1 className="director-title">Settings</h1>
        <button type="button" className="composer-cancel" onClick={onCancel} aria-label="Close settings">×</button>
      </header>

      <p style={{ opacity: 0.7, fontSize: "0.9rem", margin: "0 0 1.2rem" }}>
        Bring your own keys (BYOK). Stored in this browser's localStorage only —
        nothing leaves your device until a Director run uses them. Clearing
        browser data forgets them.
      </p>

      {FIELD_DEFS.map((def) => {
        const v = pending[def.key] ?? "";
        const ts = testState[def.key];
        const isVisible = !!visible[def.key];
        const isSaved = !!values[def.key];
        return (
          <section key={def.key} aria-label={def.label}
                   style={{ marginBottom: "1.4rem", padding: "0.8rem",
                            background: "rgba(255,255,255,0.04)",
                            borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)" }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: "0.3rem" }}>
              {def.label}
              {isSaved && <span style={{ marginLeft: "0.5rem", opacity: 0.6, fontSize: "0.8rem" }}>(saved)</span>}
            </label>
            <p style={{ opacity: 0.65, fontSize: "0.83rem", margin: "0 0 0.5rem" }}>{def.help}</p>
            <input
              ref={(el) => { fieldRefs.current[def.key] = el; }}
              type={isVisible ? "text" : "password"}
              value={v}
              placeholder={def.placeholder}
              onChange={(e) => onChange(def.key, e.target.value)}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: "100%", padding: "0.55rem 0.75rem", borderRadius: 4,
                background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.15)",
                color: "inherit", fontFamily: "monospace", fontSize: "0.9rem",
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: "0.5rem", flexWrap: "wrap" }}>
              <button type="button" onClick={() => setVisible((vis) => ({ ...vis, [def.key]: !isVisible }))}
                      style={btnStyle()}>
                {isVisible ? "Hide" : "Show"}
              </button>
              {def.key !== "workerUrl" && (
                <button type="button" onClick={() => onTest(def.key)}
                        disabled={!v || ts?.status === "testing"}
                        style={btnStyle()}>
                  Test
                </button>
              )}
              <button type="button" onClick={() => onSave(def.key)}
                      disabled={v === (values[def.key] ?? "")}
                      style={btnStyle({ primary: true })}>
                Save
              </button>
              {isSaved && (
                <button type="button" onClick={() => onForget(def.key)} style={btnStyle({ danger: true })}>
                  Forget
                </button>
              )}
            </div>
            {ts && (
              <div role="status" style={{
                marginTop: "0.5rem", padding: "0.4rem 0.6rem", borderRadius: 4,
                fontSize: "0.85rem",
                background: ts.status === "ok" ? "rgba(50,150,80,0.2)" :
                            ts.status === "error" ? "rgba(180,60,60,0.2)" :
                            "rgba(255,255,255,0.06)",
                color: ts.status === "ok" ? "#9fdba8" :
                       ts.status === "error" ? "#f4a3a3" : "inherit",
              }}>
                {ts.status === "ok" && "✓ "}
                {ts.status === "error" && "✗ "}
                {ts.message}
              </div>
            )}
          </section>
        );
      })}

      <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <button type="button" onClick={onForgetAll} style={btnStyle({ danger: true })}>
          Forget all keys
        </button>
      </div>

      {confirmModal && (
        <div role="dialog" aria-modal="true"
             style={{
               position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
               display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
             }}>
          <div style={{ background: "#1a1d24", padding: "1.5rem", borderRadius: 8,
                        maxWidth: 480, width: "92%" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Confirm custom Worker URL</h2>
            <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>
              You're routing <strong>all Director calls</strong> (including any
              Google TTS key you've saved and any Turnstile token) to:
            </p>
            <p style={{ fontFamily: "monospace", fontSize: "0.95rem",
                        background: "rgba(255,255,255,0.06)", padding: "0.5rem", borderRadius: 4 }}>
              {confirmModal.value}
            </p>
            <p style={{ fontSize: "0.9rem", opacity: 0.85 }}>
              Type <strong>{confirmModal.hostname}</strong> to confirm:
            </p>
            <input
              type="text"
              value={confirmModal.typed}
              onChange={(e) => setConfirmModal((m) => ({ ...m, typed: e.target.value }))}
              autoFocus
              style={{
                width: "100%", padding: "0.55rem", borderRadius: 4,
                background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.15)",
                color: "inherit", fontFamily: "monospace", fontSize: "0.95rem",
              }}
            />
            <div style={{ marginTop: "1rem", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setConfirmModal(null)} style={btnStyle()}>
                Cancel
              </button>
              <button type="button" onClick={onConfirmWorkerUrl}
                      disabled={confirmModal.typed !== confirmModal.hostname}
                      style={btnStyle({ primary: true })}>
                Use this Worker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function btnStyle({ primary = false, danger = false } = {}) {
  return {
    padding: "0.4rem 0.85rem",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: "0.85rem",
    border: "1px solid rgba(255,255,255,0.18)",
    background: primary ? "#8a4528" : danger ? "rgba(180,60,60,0.2)" : "transparent",
    color: "inherit",
  };
}

/**
 * Test a single field against its provider. Returns success message on
 * 2xx; throws Error with `code` matching mapValidationError() on failure.
 */
async function testKey(key, value) {
  if (key === "anthropicKey") {
    await callAnthropicDirect({
      apiKey: value,
      systemPrompt: getSystemPrompt("devotional"),
      body: {
        routeId: "_validate", routeTitle: "_validate",
        tone: "devotional", language: "en",
        peakMoments: [{ t: 0, kind: "origin", label: "x" }],
      },
      maxTokens: 8,
      timeoutMs: 10000,
    });
    return "Anthropic key works.";
  }
  if (key === "googleTtsKey") {
    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(value)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: { text: "ok" },
        voice: { languageCode: "en-IN", name: "en-IN-Wavenet-A" },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });
    if (res.status === 401 || res.status === 403) {
      const err = new Error("Google rejected the key");
      err.code = "auth";
      throw err;
    }
    if (res.status === 429) {
      const err = new Error("Google rate-limited the test call");
      err.code = "rate";
      throw err;
    }
    if (!res.ok) {
      const err = new Error(`Google TTS ${res.status}`);
      err.code = "parse";
      throw err;
    }
    return "Google TTS key works.";
  }
  throw new Error("Unknown field");
}

function mapValidationError(err) {
  const code = err?.code;
  if (code === "auth") return "Key rejected by provider — revoked, wrong format, or restricted.";
  if (code === "rate") return "Provider rate-limited the test. Try again in a moment.";
  if (code === "timeout") return "No response in 10 seconds. Check your network.";
  if (code === "cors") return "Provider blocked the browser request. Your network or provider config may not allow direct browser access.";
  if (code === "parse") return `Provider returned an unexpected response. ${err.message || ""}`;
  return err?.message || "Validation failed.";
}
