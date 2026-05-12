# Testing Yatra

> 100% test coverage is the key to great vibe coding. Tests let you move fast, trust your instincts, and ship with confidence — without them, vibe coding is just yolo coding. With tests, it's a superpower.

## Framework

- **[Vitest 4.x](https://vitest.dev)** — fast Vite-native test runner.
- **[jsdom](https://github.com/jsdom/jsdom)** — DOM in Node, for component tests without a browser.
- **[@testing-library/react](https://testing-library.com/react)** — render React components and query the DOM the way users see it.
- **[@testing-library/jest-dom](https://github.com/testing-library/jest-dom)** — DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, etc.) wired up in `test/setup.js`.

## How to run

```bash
npm test            # run once (CI mode)
npm run test:watch  # watch mode (re-run on save)
```

CI runs on every push and pull request via `.github/workflows/test.yml`.

## Layers

- **Unit** — pure functions and React components in isolation. Live next to the source under `test/` (or co-located `*.test.{js,jsx}` later as the project grows). Mock all network calls.
- **Integration** — components composed with their real children + mocked services. Most "does this feature work?" tests live here.
- **Smoke** — high-level "the app renders" sanity checks for top-level routes.
- **E2E** — deferred to v3.1+ (Playwright); v3.0 has no router-level flows.
- **Eval** — deferred to v3.1+ when build-time LLM polish ships.

## Conventions

- **File naming:** `*.test.{js,jsx,ts,tsx}` or `*.spec.{js,jsx,ts,tsx}` under `test/`.
- **Assertion style:** Use the jest-dom matchers (`toBeInTheDocument`, `toHaveClass`, `toHaveAttribute`) over generic `expect(...).toBe(...)` when asserting on rendered DOM. Read better, fail clearer.
- **Setup/teardown:** Global setup lives in `test/setup.js`. Per-file setup uses Vitest's `beforeEach`/`afterEach`.
- **What to test:** real behavior, not the framework. `expect(x).toBeDefined()` is a smell — assert what the code *does*.
- **Coverage expectations:**
  - When you add a new function → add a test.
  - When you fix a bug → add a regression test first.
  - When you add error handling → add a test that triggers the error.
  - When you add a conditional → cover BOTH branches.
  - Never commit code that makes existing tests fail.
