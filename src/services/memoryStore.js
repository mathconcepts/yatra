/**
 * Memory store — localStorage CRUD for user-saved memories (v3.2 Slice J).
 *
 * Each saved memory is a LocationConfig-shaped object with two extras:
 *   - savedId: short opaque id (timestamp + random)
 *   - savedAt: ISO timestamp
 *
 * Photo blob URLs (`landmark.photoUrl`) do NOT survive a page reload —
 * they're stripped before save. The same is true for narration URLs.
 * Persisting the actual binary data would need IndexedDB; tracked in
 * TODOS as a v3.3 polish item.
 *
 * Pure helpers (`sanitizeForStorage`, `parseStored`) are exported for
 * unit tests so we don't need to touch localStorage to exercise them.
 */

const STORAGE_KEY = "yatra.memories.v1";
const SCHEMA_VERSION = 1;
const MAX_MEMORIES = 50; // localStorage quota guard

export function makeSavedId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `mem-${Date.now()}-${rand}`;
}

/**
 * Pure: strip blob-URL fields that won't survive a reload.
 */
export function sanitizeForStorage(config) {
  if (!config || typeof config !== "object") return null;
  const landmarks = (config.landmarks || []).map((l) => {
    const { photoUrl, ...rest } = l;
    return rest;
  });
  return {
    ...config,
    landmarks,
    narrationUrl: null,
  };
}

/**
 * Pure: parse + validate a stored JSON payload. Returns array or [].
 */
export function parseStored(raw) {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const obj = JSON.parse(raw);
    if (!obj || obj.version !== SCHEMA_VERSION || !Array.isArray(obj.memories)) return [];
    return obj.memories.filter((m) => m && m.savedId && m.config);
  } catch {
    return [];
  }
}

function readAll() {
  if (typeof localStorage === "undefined") return [];
  try {
    return parseStored(localStorage.getItem(STORAGE_KEY));
  } catch { return []; }
}

function writeAll(memories) {
  if (typeof localStorage === "undefined") return false;
  try {
    const trimmed = memories.slice(-MAX_MEMORIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, memories: trimmed }));
    return true;
  } catch {
    // Quota exceeded; trim half and retry once.
    try {
      const half = memories.slice(-Math.max(1, Math.floor(MAX_MEMORIES / 2)));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, memories: half }));
      return true;
    } catch { return false; }
  }
}

export function listMemories() {
  return readAll();
}

export function saveMemory(config) {
  const sanitized = sanitizeForStorage(config);
  if (!sanitized) return null;
  const savedId = makeSavedId();
  const savedAt = new Date().toISOString();
  const entry = { savedId, savedAt, config: sanitized };
  const all = readAll();
  all.push(entry);
  if (!writeAll(all)) return null;
  return entry;
}

export function deleteMemory(savedId) {
  const all = readAll().filter((m) => m.savedId !== savedId);
  return writeAll(all);
}

export function findMemory(savedId) {
  return readAll().find((m) => m.savedId === savedId) || null;
}

export function clearMemories() {
  return writeAll([]);
}
