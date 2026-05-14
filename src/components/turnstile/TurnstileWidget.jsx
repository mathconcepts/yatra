/**
 * Cloudflare Turnstile widget — invisible mode.
 *
 * Loads the Turnstile script tag idempotently (once per page), renders
 * an invisible challenge inside a host div, captures the token via the
 * `callback` option, and exposes it through props.
 *
 * Site key comes from VITE_TURNSTILE_SITE_KEY (build-time env). Site
 * keys are public by Cloudflare design; pasting one into the bundle is
 * the supported pattern.
 *
 * The widget is a no-op when the site key is unset (dev environments
 * without Turnstile provisioned). The parent component should treat
 * `null` token as "no Turnstile required" and let the Worker decide
 * whether to enforce.
 *
 * Token lifetime is ~5 minutes per Cloudflare's spec. We re-issue on
 * expiry via the `expired-callback`.
 */

import { useEffect, useRef, useState } from "react";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise = null;

function loadTurnstileScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.turnstile) return resolve(window.turnstile);
    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(window.turnstile));
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", () => resolve(window.turnstile));
    s.addEventListener("error", reject);
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export default function TurnstileWidget({ onToken, siteKey, action = "director" }) {
  const ref = useRef(null);
  const widgetIdRef = useRef(null);
  const [error, setError] = useState(null);

  // Resolve the site key from prop OR build-time env. Both optional.
  const key = siteKey || (() => {
    try { return import.meta.env?.VITE_TURNSTILE_SITE_KEY; } catch { return undefined; }
  })();

  useEffect(() => {
    if (!key) return; // no Turnstile required in this env
    let cancelled = false;

    loadTurnstileScript()
      .then((ts) => {
        if (cancelled || !ref.current || !ts) return;
        widgetIdRef.current = ts.render(ref.current, {
          sitekey: key,
          action,
          size: "invisible",
          callback: (token) => onToken?.(token),
          "expired-callback": () => onToken?.(null),
          "error-callback": (e) => setError(String(e)),
        });
        // Invisible widgets execute on render; explicit execute is
        // useful if the parent needs to re-trigger.
        try { ts.execute(widgetIdRef.current); } catch { /* idle */ }
      })
      .catch((err) => setError(err?.message || String(err)));

    return () => {
      cancelled = true;
      try {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      } catch { /* unmount race */ }
    };
  }, [key, action, onToken]);

  if (!key) return null;
  return (
    <>
      <div ref={ref} aria-hidden="true" />
      {error && <div role="alert" style={{ color: "#a44", fontSize: "0.8rem" }}>Turnstile: {error}</div>}
    </>
  );
}
