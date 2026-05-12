import { useState } from "react";
import { scaffoldFromText } from "../../services/aiScaffold";

/**
 * "Tell us the memory" — free-text input that scaffolds a route via
 * extract + geocode-verify. Bubbles results to parent via
 * onScaffold({waypoints, skipped}).
 */
export default function AiScaffoldInput({ onScaffold }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);

  const run = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setSummary(null);
    const result = await scaffoldFromText(text);
    setBusy(false);
    setSummary(result);
    if (typeof onScaffold === "function") onScaffold(result);
  };

  return (
    <div className="ai-scaffold">
      <label className="composer-field">
        <span className="composer-label">Describe the trip</span>
        <textarea
          className="ai-scaffold-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="We went to Manali for a week, then drove up to Rohtang Pass and Solang Valley."
          rows={3}
        />
      </label>
      <button
        type="button"
        className="composer-preview"
        onClick={run}
        disabled={busy || !text.trim()}
      >
        {busy ? "Verifying places…" : "Build scaffold"}
      </button>
      {summary && (
        <p className="composer-hint">
          Found {summary.waypoints.length} verified place{summary.waypoints.length === 1 ? "" : "s"}.
          {summary.skipped.length > 0 && ` Skipped: ${summary.skipped.join(", ")}.`}
        </p>
      )}
    </div>
  );
}
