#!/usr/bin/env node
/**
 * CI verifier for polish-manifest.json. Runs without an API key.
 *
 * For each manifest entry, asserts:
 *   - `polished` text hash matches `polishedHash` (catches manual edits)
 *   - `polished` introduces no proper nouns vs. the corresponding draft
 *     in the live LocationConfig (catches manifest drift if someone
 *     edits the draft but forgets to re-run polish)
 *
 * Empty manifest → passes trivially. This is the v3.0 starting state.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadLocations } from "./lib/load-locations.mjs";
import { diffNewProperNouns, wordCount } from "./lib/proper-noun-diff.mjs";

const MAX_WORDS = 60;
const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = join(__dirname, "..", "polish-manifest.json");

function sha256(s) {
  return createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
}

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch {
    console.log("polish-manifest.json missing — treated as empty. PASS.");
    return;
  }
  const entries = manifest.entries || {};
  const keys = Object.keys(entries);
  if (keys.length === 0) {
    console.log("polish-manifest.json has no entries. PASS.");
    return;
  }

  const LOCATIONS = await loadLocations();
  const failures = [];

  for (const key of keys) {
    const e = entries[key];
    const [configId, landmarkId] = key.split(".");
    const config = LOCATIONS[configId];
    const landmark = config?.landmarks?.find((l) => l.id === landmarkId);

    if (!landmark) {
      failures.push(`${key}: landmark not found in current LOCATIONS registry`);
      continue;
    }

    if (sha256(e.polished) !== e.polishedHash) {
      failures.push(`${key}: polishedHash mismatch — polished text has been edited`);
      continue;
    }

    if (sha256(landmark.blurb) !== e.draftHash) {
      failures.push(`${key}: draft has changed since polish; re-run scripts/polish-postcards.mjs`);
      continue;
    }

    const added = diffNewProperNouns(landmark.blurb, e.polished);
    if (added.length > 0) {
      failures.push(`${key}: polished introduces new proper nouns: ${added.join(", ")}`);
      continue;
    }

    if (wordCount(e.polished) > MAX_WORDS) {
      failures.push(`${key}: polished exceeds ${MAX_WORDS}-word target (${wordCount(e.polished)})`);
    }
  }

  if (failures.length > 0) {
    console.error(`polish-manifest check FAILED with ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`polish-manifest check PASSED (${keys.length} entries verified).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
