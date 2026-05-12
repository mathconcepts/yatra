# Postcard polish pipeline

A build-time tool that runs an LLM over hand-written landmark postcards to tighten the prose to **≤ 60 words**, while:

- preserving every place name verbatim,
- preserving every numeric fact verbatim,
- introducing **no new proper nouns** of any kind,
- skipping religious / spiritual landmarks (those stay hand-curated).

The LLM is **never invoked at runtime**. Polish runs locally before a release, the polished text and a verification manifest are committed, and CI re-verifies the manifest on every push.

## When to run

After you:

- add or edit a landmark `blurb` in `src/config/*.js`, and
- you want the LLM's prose tightening on that landmark.

## How to run

```bash
# 1. Dry-run — shows what would be polished, no API calls
node scripts/polish-postcards.mjs --dry-run

# 2. Real run (needs an API key)
ANTHROPIC_API_KEY=sk-ant-... node scripts/polish-postcards.mjs

# 3. Inspect the diff
git diff polish-manifest.json

# 4. Verify the manifest before commit
node scripts/check-postcard-manifest.mjs
```

The driver:

1. Loads every `LocationConfig` in `src/config/index.js`.
2. For each landmark, skips if `landmark.type === "shrine"`, if `type === "destination"` with a `ritual`, if `landmark.polish === false`, or if the blurb is empty (the **religious carve-out** from the v3.0 plan).
3. For everything else, hashes the draft. If the manifest already has the same hash + same prompt version, **skipped** (idempotent — no re-spend).
4. Otherwise calls Claude (model pin: `claude-sonnet-4-7`, temp `0`) with the strict polish prompt.
5. Verifies the result: no new proper nouns vs. draft (via `extractProperNouns`); ≤ 60 words. If either fails → **REJECT**, draft is kept, manifest is unchanged.
6. On accept, writes the polished text + hashes + model + prompt version + timestamp to `polish-manifest.json`.

The current LocationConfig `blurb` text is **not** edited by the polish script. Polished text lives in the manifest under `entries[<configId.landmarkId>].polished`. Slice 7 will wire the runtime to read polished text from the manifest if present, draft otherwise — that way the source config is the single editable surface.

## What CI checks

`scripts/check-postcard-manifest.mjs` runs in CI and asserts:

- Every manifest entry's `polishedHash` still matches the polished text in the manifest (no manual edits).
- The current draft `blurb` in `src/config/*.js` still hashes to the same `draftHash`. If you edited the draft but didn't re-run polish, CI fails with `draft has changed since polish; re-run scripts/polish-postcards.mjs`.
- The polished text introduces no new proper nouns vs. the current draft (catches manifest drift).
- The polished text is ≤ 60 words.

Empty manifest passes trivially. This is the v3.0 starting state — every postcard ships hand-written; opt in to polish per-config when you want it.

## Religious carve-out

Per the v3.0 plan (`P3-revised` in the autoplan gate), religious / spiritual landmarks must stay hand-curated. The script skips them via `shouldPolish()`:

| Condition | Result |
|---|---|
| `landmark.type === "shrine"` | SKIP |
| `landmark.type === "destination"` with `landmark.ritual` present | SKIP |
| `landmark.polish === false` | SKIP |
| `landmark.blurb` empty | SKIP |
| anything else | POLISH |

If you want to allow polish on a `shrine` (you probably don't), the cleanest path is to copy that landmark's blurb to a non-shrine type. Don't change the carve-out itself without re-reading the autoplan gate.

## Cost

Three configs polished (Srirangam, Yadagiri, Konkan) = ~15 landmark blurbs × ~120 input tokens + ~80 output tokens. **Under $0.05 per full run.** Re-running on already-polished entries is free (idempotent hash check).

## Prompt versioning

`PROMPT_VERSION` in `scripts/lib/postcard-prompt.mjs`. Bumping the version invalidates every existing manifest entry (because `promptHash` includes it), so re-running polish refreshes all entries against the new prompt. Keep this string stable unless you've intentionally changed the system prompt.
