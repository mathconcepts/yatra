/**
 * The "Auto camera" pill is the visible expression of the mood-cadence
 * override state. Two modes plus a momentary "just-resumed" flash:
 *   - auto    — accent-filled pill, label "Auto camera"
 *   - manual  — outlined grey pill with a 5 s countdown bar that
 *               drains via pure CSS animation
 *
 * Tap any time to flip state immediately (force-resume from manual, or
 * pin to manual indefinitely if tapped while auto — Slice 4 keeps the
 * pin behaviour minimal; the proper "lock my camera moves" toggle
 * lives in the v3.1 composer per the design spec).
 *
 * Locked spec from /plan-design-review:
 *   touch-target ≥ 44pt × 44pt, persistent in the top-right safe area.
 */
export default function AutoCameraPill({ mode, manualKey, onToggle }) {
  const label = mode === "manual" ? "Manual" : "Auto camera";
  return (
    <button
      type="button"
      className={`auto-pill auto-pill-${mode}`}
      onClick={onToggle}
      aria-label={
        mode === "manual"
          ? "Manual camera control. Tap to resume auto."
          : "Auto camera enabled. Tap to take manual control."
      }
      aria-pressed={mode === "auto"}
    >
      <span className="auto-pill-dot" aria-hidden="true" />
      <span className="auto-pill-label">{label}</span>
      {mode === "manual" && (
        <span
          key={manualKey}
          className="auto-pill-countdown"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
