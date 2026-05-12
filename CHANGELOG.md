# Changelog

All notable changes to this project will be documented in this file.

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
