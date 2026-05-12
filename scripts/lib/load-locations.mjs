// Filesystem-based loader for LocationConfigs, usable from Node CLI.
//
// `src/config/index.js` uses Vite-resolved extensionless imports
// ("./tirupati-tirumala"); Node ESM strict mode rejects those. This loader
// globs the config directory and imports each file with an explicit `.js`
// extension so the polish script + manifest verifier run without Vite.

import { readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, "..", "..", "src", "config");
const SKIP = new Set(["index.js", "schema.js"]);

export async function loadLocations() {
  const files = await readdir(CONFIG_DIR);
  const locations = {};
  for (const file of files) {
    if (SKIP.has(file)) continue;
    if (!file.endsWith(".js")) continue;
    const mod = await import(pathToFileURL(join(CONFIG_DIR, file)).href);
    const config = mod.default;
    if (config?.id) locations[config.id] = config;
  }
  return locations;
}
