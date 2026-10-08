import type { Cue, Track, TrackSection } from '../types';

/**
 * Show control (pure): sections with end actions, play modes and cue navigation.
 *
 * Play modes
 *  - play:        run the track; each section's end action applies at its end.
 *  - playSection: run the current section and stop at its end.
 *  - loopSection: loop the current section.
 *
 * Section end actions (in "play" mode)
 *  - continue: run on into whatever follows.
 *  - stop:     stop and rewind to the section start (ready to play it again).
 *  - hold:     stop on the section's last frame.
 *  - loop:     jump back to the section start and keep playing.
 */
export type PlayMode = 'play' | 'playSection' | 'loopSection';

export type TransportStep =
  | { kind: 'none' }
  | { kind: 'seek'; to: number }
  | { kind: 'pause'; at: number };

const EPS = 1e-6;

export function sortedSections(track: Track): TrackSection[] {
  return [...track.sections].filter((s) => s.endSec > s.startSec).sort((a, b) => a.startSec - b.startSec);
}

export function sortedCues(track: Track): Cue[] {
  return [...track.cues].sort((a, b) => a.timeSec - b.timeSec);
}

/** Section containing t (start inclusive, end exclusive); the later one wins on overlap. */
export function sectionAt(track: Track, t: number): TrackSection | null {
  let found: TrackSection | null = null;
  for (const s of sortedSections(track)) if (t >= s.startSec - EPS && t < s.endSec - EPS) found = s;
  return found;
}

/**
 * What the transport must do after moving from prev to t while playing. Boundaries
 * are checked for the section that contained prev, so a slow frame cannot skip one.
 */
export function transportStep(track: Track, prev: number, t: number, mode: PlayMode): TransportStep {
  const section = sectionAt(track, prev);
  if (section && t >= section.endSec - EPS && prev < section.endSec - EPS) {
    const len = section.endSec - section.startSec;
    const over = t - section.endSec;
    const action = mode === 'loopSection' ? 'loop' : mode === 'playSection' ? 'hold' : section.endAction;
    switch (action) {
      case 'loop':
        return { kind: 'seek', to: section.startSec + (len > EPS ? over % len : 0) };
      case 'stop':
        return { kind: 'pause', at: section.startSec };
      case 'hold':
        return { kind: 'pause', at: Math.max(section.startSec, section.endSec - 1e-3) };
      case 'continue':
        break;
    }
  }
  if (t >= track.durationSec) return { kind: 'pause', at: track.durationSec };
  return { kind: 'none' };
}

/** Next cue strictly after t (one frame of tolerance), or null. */
export function nextCue(track: Track, t: number, frameSec = 1 / 30): Cue | null {
  return sortedCues(track).find((c) => c.timeSec > t + frameSec / 2) ?? null;
}

/** Previous cue strictly before t (one frame of tolerance), or null. */
export function prevCue(track: Track, t: number, frameSec = 1 / 30): Cue | null {
  const before = sortedCues(track).filter((c) => c.timeSec < t - frameSec / 2);
  return before[before.length - 1] ?? null;
}

/** Cue sitting at t (within half a frame), or null. */
export function cueAt(track: Track, t: number, frameSec = 1 / 30): Cue | null {
  return sortedCues(track).find((c) => Math.abs(c.timeSec - t) <= frameSec / 2) ?? null;
}

/**
 * GO: standing on a cue while stopped → play from it. Otherwise jump to the next
 * cue and play. No cue ahead → just play.
 */
export function goTarget(track: Track, t: number, playing: boolean, frameSec = 1 / 30): { seek: number | null; play: true } {
  if (!playing && cueAt(track, t, frameSec)) return { seek: null, play: true };
  const next = nextCue(track, t, frameSec);
  return { seek: next ? next.timeSec : null, play: true };
}
