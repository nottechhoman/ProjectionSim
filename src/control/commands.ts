import type { Cue, Track } from '../types';
import { sortedCues } from '../playback/showControl';

/** External control commands (MIDI, MSC, OSC) — one vocabulary for all inputs. */
export type ControlCommand =
  | { type: 'go' }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'togglePlay' }
  | { type: 'stop' }
  | { type: 'nextCue' }
  | { type: 'prevCue' }
  | { type: 'cue'; number: string }
  | { type: 'locate'; seconds: number };

export type ControlAction = Exclude<ControlCommand['type'], 'locate'>;

export const CONTROL_ACTION_LABEL: Record<ControlAction, string> = {
  go: 'GO',
  togglePlay: 'Play / pause',
  play: 'Play',
  pause: 'Pause',
  stop: 'Stop',
  nextCue: 'Next cue',
  prevCue: 'Previous cue',
  cue: 'Go to cue #',
};

/**
 * Find a cue by "number": an exact (trimmed, case-insensitive) name match first
 * ("3", "3.5", "Intro"), else "Cue N" by name, else the N-th cue in time order.
 */
export function findCue(track: Track, number: string): Cue | null {
  const want = number.trim().toLowerCase();
  if (!want) return null;
  const cues = sortedCues(track);
  const byName = cues.find((c) => c.name.trim().toLowerCase() === want) ?? cues.find((c) => c.name.trim().toLowerCase() === `cue ${want}`);
  if (byName) return byName;
  const n = Number(want);
  if (Number.isInteger(n) && n >= 1 && n <= cues.length) return cues[n - 1];
  return null;
}

/** Parse a JSON control message from the OSC bridge. */
export function parseControlMessage(text: string): ControlCommand | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  switch (d.type) {
    case 'go':
    case 'play':
    case 'pause':
    case 'togglePlay':
    case 'stop':
    case 'nextCue':
    case 'prevCue':
      return { type: d.type };
    case 'cue':
      return typeof d.number === 'string' || typeof d.number === 'number' ? { type: 'cue', number: String(d.number) } : null;
    case 'locate':
      return typeof d.seconds === 'number' && Number.isFinite(d.seconds) ? { type: 'locate', seconds: Math.max(0, d.seconds) } : null;
    default:
      return null;
  }
}
