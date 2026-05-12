#!/usr/bin/env node
/**
 * Postcard polish driver. Run manually with ANTHROPIC_API_KEY set.
 *
 *   ANTHROPIC_API_KEY=sk-... node scripts/polish-postcards.mjs --dry-run
 *   ANTHROPIC_API_KEY=sk-... node scripts/polish-postcards.mjs
 *
 * Locked spec from the v3.0 plan (reviewer correction #6):
 *   - temp=0, model pin `claude-sonnet-4-7`
 *   - religious carve-out (shrine + destination-with-ritual SKIPPED)
 *   - eval gate: any new proper noun in polished → REJECT, draft kept
 *   - manifest records {draftHash, polishedHash, model, promptHash,
 *     promptVersion, temp, timestamp} so CI can verify hash drift
 *
 * The driver never reads or writes outside scripts/, polish-manifest.json,
 * and the LOCATIONS configs. No network calls beyond Anthropic. No
 * dependency on the React build — pure Node ESM + the LOCATIONS registry.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadLocations } from "./lib/load-locations.mjs";
import { diffNewProperNouns, wordCount } from "./lib/proper-noun-diff.mjs";
import { shouldPolish } from "./lib/should-polish.mjs";
import { SYSTEM_PROMPT, userPrompt, promptHashInput, PROMPT_VERSION } from "./lib/postcard-prompt.mjs";

const MODEL = "claude-sonnet-4-7";
const TEMP = 0;
const MAX_WORDS = 60;

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, "..", "polish-manifest.json");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const VERBOSE = args.has("--verbose") || args.has("-v");

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

async function loadManifest() {
  try {
    const raw = await readFile(MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { version: 1, entries: {} };
  }
}

async function writeManifest(m) {
  await writeFile(MANIFEST_PATH, JSON.stringify(m, null, 2) + "\n");
}

async function callClaude(draft) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set — cannot run polish");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      temperature: TEMP,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt(draft) }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.content?.[0]?.text?.trim();
  if (!text) throw new Error("Empty response from Anthropic");
  return text;
}

async function main() {
  const manifest = await loadManifest();
  const LOCATIONS = await loadLocations();
  const results = { polished: 0, skipped: 0, rejected: 0, unchanged: 0, errors: 0 };

  for (const [configId, config] of Object.entries(LOCATIONS)) {
    if (!Array.isArray(config.landmarks)) continue;
    for (const landmark of config.landmarks) {
      const key = `${configId}.${landmark.id}`;
      if (!shouldPolish(landmark)) {
        if (VERBOSE) console.log(`SKIP    ${key} (religious / opt-out / empty)`);
        results.skipped++;
        continue;
      }
      const draft = landmark.blurb;
      const draftHash = sha256(draft);
      const existing = manifest.entries[key];
      if (existing && existing.draftHash === draftHash && existing.promptVersion === PROMPT_VERSION) {
        if (VERBOSE) console.log(`CACHED  ${key} (draft + prompt unchanged)`);
        results.unchanged++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`WOULD POLISH ${key} (${wordCount(draft)} words)`);
        results.polished++;
        continue;
      }

      try {
        const polished = await callClaude(draft);
        const added = diffNewProperNouns(draft, polished);
        if (added.length > 0) {
          console.log(`REJECT  ${key} — new proper nouns: ${added.join(", ")}`);
          results.rejected++;
          continue;
        }
        if (wordCount(polished) > MAX_WORDS) {
          console.log(`REJECT  ${key} — polished exceeds ${MAX_WORDS} words (${wordCount(polished)})`);
          results.rejected++;
          continue;
        }
        const polishedHash = sha256(polished);
        const promptHash = sha256(promptHashInput(draft));
        manifest.entries[key] = {
          draftHash,
          polishedHash,
          polished,
          model: MODEL,
          temp: TEMP,
          promptVersion: PROMPT_VERSION,
          promptHash,
          timestamp: new Date().toISOString(),
        };
        console.log(`OK      ${key} (${wordCount(polished)} words)`);
        results.polished++;
      } catch (err) {
        console.error(`ERROR   ${key}: ${err.message}`);
        results.errors++;
      }
    }
  }

  if (!DRY_RUN) await writeManifest(manifest);
  console.log("\nSummary:", results);
  if (results.errors > 0 || results.rejected > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
