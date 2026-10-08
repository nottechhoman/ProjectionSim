import type { ProjectSnapshot } from './projectSchema';
import { parseProjectJson, serializeProject } from './projectSerializer';

const AUTOSAVE_KEY = 'projectionlab-v4-autosave-v1';
/** The previous version's autosave on the same site, brought over once. */
const LEGACY_AUTOSAVE_KEY = 'projectionlab-advanced-autosave-v1';
const LEGACY_IMPORTED_KEY = 'projectionlab-v4-imported-previous';

/** A v4 autosave nobody has worked in yet (the default scene, no media, one layer). */
function isUntouched(s: ProjectSnapshot): boolean {
  const layers = s.show.tracks.reduce((n, t) => n + t.layers.length, 0);
  return s.name === 'Default Scene' && s.mediaAssets.length === 0 && layers <= 1 && s.show.tracks.length === 1;
}

/** Set when the autosave just opened came from the previous version. */
export let restoredFromPreviousVersion = false;

export function writeAutosave(snapshot: ProjectSnapshot): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(snapshot));
  } catch {
    // Storage full or unavailable — ignore
  }
}

/**
 * The v4 autosave — except the first time v4 runs where the previous version was
 * used: if the v4 autosave is missing or untouched, the previous version's project
 * (with its media, see assetStore) is opened instead, once.
 */
export function readAutosave(): ProjectSnapshot | null {
  let current: ProjectSnapshot | null = null;
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    current = raw ? parseProjectJson(raw) : null;
  } catch {
    current = null;
  }
  try {
    const legacy = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
    if (legacy && !localStorage.getItem(LEGACY_IMPORTED_KEY)) {
      localStorage.setItem(LEGACY_IMPORTED_KEY, new Date().toISOString());
      if (!current || isUntouched(current)) {
        restoredFromPreviousVersion = true;
        return parseProjectJson(legacy);
      }
    }
  } catch {
    // unreadable previous autosave: keep the v4 one
  }
  return current;
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
