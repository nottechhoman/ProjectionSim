import type { ProjectSnapshot } from './projectSchema';
import { parseProjectJson, serializeProject } from './projectSerializer';

const AUTOSAVE_KEY = 'projectionlab-autosave-v1';

export function writeAutosave(snapshot: ProjectSnapshot): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(snapshot));
  } catch {
    // Storage full or unavailable — ignore
  }
}

export function readAutosave(): ProjectSnapshot | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return parseProjectJson(raw);
  } catch {
    return null;
  }
}

export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
