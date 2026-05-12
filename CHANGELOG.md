# Changelog

All notable changes to this project will be documented in this file.

## [1.0.4] - 2026-05-12

### Added
- `ReelPlayer` component — single vertical 9:16 reel with MapLibre 3D terrain, auto-playing marker traversal of the active route, Cormorant Garamond title overlay, and a postcard caption that follows the nearest landmark.
- `ReelFeed` component — swipe-paginated container for the Reels surface. Touch swipe (≥60 px), keyboard `ArrowUp`/`ArrowDown`/`PageUp`/`PageDown`, on-screen up/down arrows, position indicator, and an "Atlas" back button. `Escape` returns to the Atlas surface.
- `clampIndex()` pure helper exported from `ReelFeed` for direct unit testing.
- Tests: 10 new — `clampIndex` coverage, `ReelFeed` keyboard navigation, edge bounds, Atlas-back wiring, empty-state rendering.

### Changed
- `SurfaceRouter` now lazy-loads `ReelFeed` instead of the Slice 1 placeholder. The Reels chunk is verified separate from the desktop bundle (`ReelFeed-*.js`, 3.65 kB / 1.46 kB gzipped).
- The Reels surface is no longer a stub: on portrait viewports the user lands directly in a vertical reel of the current journey, with the marker animating along the route every 20 seconds.

### Removed
- `ReelsPlaceholder.jsx` — replaced by `ReelFeed`. The Slice 1 stub is no longer needed.

## [1.0.3] - 2026-05-12

### Added
- `SurfaceRouter` component routes between the existing landscape Atlas and the new vertical Reels surface based on viewport aspect ratio (`portrait || min-dim < 768` → Reels). User choice persists in URL (`?surface=reels|atlas`) and `localStorage`. Resize listener is debounced 250ms.
- `pickSurface(w, h, urlOverride, stored)` exported as a pure function for direct testing.
- `ReelsPlaceholder` component as the v3.0 Slice 1 stub for the Reels surface. Slice 2 replaces it with the real `ReelFeed` + `ReelPlayer`.
- "Reels mode" floating button on the Atlas surface to opt in manually.
- `LocationConfig.mode` (foot / road / rail / mixed) and `LocationConfig.cameraPlan` as optional schema fields for future v3.0 surfaces. Existing configs are unaffected.
- Tests: 14 new (pure-function decision matrix for `pickSurface`, atlas-render integration, P9 regression on the Tirupati config).

### Changed
- `App.jsx` now wraps the existing Atlas view in `SurfaceRouter`. Desktop users see the same Tirupati journey they always have.
- The Reels bundle is code-split out of the desktop entry chunk via dynamic `import()` — `ReelsPlaceholder-*.js` ships as its own asset and only loads when the Reels surface is requested.

## [1.0.2] - 2026-05-12

### Added
- Test framework: Vitest + jsdom + `@testing-library/react` + `@testing-library/jest-dom` matchers.
- `npm test` (single run) and `npm run test:watch` (watch mode) scripts.
- `test/` directory with global setup (`test/setup.js`) and a smoke test that proves the runner + jsdom + matchers all work end-to-end.
- `.github/workflows/test.yml` — CI runs the test suite on every push and pull request.
- `TESTING.md` — testing philosophy, conventions, and coverage expectations.
- `## Testing` section in `CLAUDE.md` so AI assistants follow project test conventions.

### Changed
- `vite.config.js` — added a Vitest config block (jsdom environment, globals, setup file, `test/**` include pattern). Dev/build behaviour unchanged.

## [1.0.1] - 2026-05-12

### Added
- `CLAUDE.md` — project guidance for AI coding tools, listing available gstack skills and skill-routing rules.
- `.claude/hooks/check-gstack.sh` + `.claude/settings.json` — team-mode enforcement hook that blocks skill usage when gstack is not installed globally. Each developer is prompted to install gstack the first time they run an AI session in this repo.

### Changed
- Project now requires the [gstack](https://github.com/garrytan/gstack) skill set for AI-assisted work. Contributor onboarding documented in `CLAUDE.md`.

## [1.0.0] - prior

- Initial release. Tirumala–Tirupati journey atlas with MapLibre 3D terrain, real-time weather, and editorial postcards.
