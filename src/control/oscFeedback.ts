import type { Show, Track } from '../types';
import { activeTrack } from '../mapping/model';
import { sectionAt, sortedCues, sortedSections } from '../playback/showControl';
import { formatTimecode } from '../playback/timecode';

/**
 * v10 OSC feedback (pure): what the transport looks like from outside, the change
 * detector that turns two states into OSC messages, and the time throttle.
 *
 * The app evaluates feedbackState() from the master clock + show on every tick and
 * hands it to OscFeedback.update(); nothing here touches the transport.
 */

export type TransportState = 'playing' | 'paused' | 'stopped';

export interface Indexed {
  /** 1-based (same numbering as /show/cue N); 0 = none. */
  index: number;
  name: string;
}

export interface FeedbackState {
  state: TransportState;
  cue: Indexed;
  section: Indexed;
  track: Indexed;
}

export interface OscOutMessage {
  address: string;
  args: (string | number)[];
  /** One OSC type tag per argument. */
  types: string;
}

const NONE: Indexed = { index: 0, name: '' };

/** Stopped = not playing with the playhead at the start (what Stop leaves behind). */
export function transportStateOf(playing: boolean, t: number): TransportState {
  if (playing) return 'playing';
  return t <= 1e-6 ? 'stopped' : 'paused';
}

/** The cue the playhead is on or has passed last (half a frame of tolerance). */
export function currentCue(track: Track, t: number, frameSec = 1 / 30): Indexed {
  const cues = sortedCues(track);
  let found = -1;
  cues.forEach((c, i) => {
    if (c.timeSec <= t + frameSec / 2) found = i;
  });
  return found < 0 ? NONE : { index: found + 1, name: cues[found].name };
}

export function currentSection(track: Track, t: number): Indexed {
  const s = sectionAt(track, t);
  if (!s) return NONE;
  return { index: sortedSections(track).findIndex((x) => x.id === s.id) + 1, name: s.name };
}

export function feedbackState(show: Show, playing: boolean, t: number): FeedbackState {
  const track = activeTrack(show);
  const index = show.tracks.findIndex((x) => x.id === track.id);
  return {
    state: transportStateOf(playing, t),
    cue: currentCue(track, t, 1 / show.fps),
    section: currentSection(track, t),
    track: { index: index + 1, name: track.name },
  };
}

const sameIndexed = (a: Indexed, b: Indexed) => a.index === b.index && a.name === b.name;

/** Messages for what changed from prev to next; prev null = send everything. */
export function diffFeedback(prev: FeedbackState | null, next: FeedbackState): OscOutMessage[] {
  const out: OscOutMessage[] = [];
  if (!prev || prev.track.index !== next.track.index || prev.track.name !== next.track.name) {
    out.push({ address: '/show/track', args: [next.track.index, next.track.name], types: 'is' });
  }
  if (!prev || prev.state !== next.state) out.push({ address: '/show/state', args: [next.state], types: 's' });
  if (!prev || !sameIndexed(prev.cue, next.cue)) out.push({ address: '/show/cue', args: [next.cue.index, next.cue.name], types: 'is' });
  if (!prev || !sameIndexed(prev.section, next.section)) {
    out.push({ address: '/show/section', args: [next.section.index, next.section.name], types: 'is' });
  }
  return out;
}

export function timeMessages(t: number, fps: number): OscOutMessage[] {
  return [
    { address: '/show/time', args: [Math.max(0, t)], types: 'f' },
    { address: '/show/timecode', args: [formatTimecode(t, fps)], types: 's' },
  ];
}

export function goAckMessage(cueIndex: number): OscOutMessage {
  return { address: '/show/go/ack', args: [cueIndex], types: 'i' };
}

export const DEFAULT_TIME_RATE_HZ = 10;
export const MAX_TIME_RATE_HZ = 60;

export function clampRateHz(hz: number): number {
  if (!Number.isFinite(hz)) return DEFAULT_TIME_RATE_HZ;
  return Math.min(MAX_TIME_RATE_HZ, Math.max(1, hz));
}

export interface FeedbackInput {
  show: Show;
  playing: boolean;
  t: number;
  /** Wall clock in ms (performance.now()). */
  nowMs: number;
}

/**
 * Change detector + throttle. update() sends what changed since the last call and,
 * while playing, /show/time + /show/timecode at most rateHz times a second.
 */
export class OscFeedback {
  private prev: FeedbackState | null = null;
  private lastTimeMs = -Infinity;

  constructor(
    private readonly send: (m: OscOutMessage) => void,
    public rateHz = DEFAULT_TIME_RATE_HZ,
  ) {}

  /** Forget what was sent: the next update sends the full state again. */
  reset(): void {
    this.prev = null;
    this.lastTimeMs = -Infinity;
  }

  update({ show, playing, t, nowMs }: FeedbackInput): void {
    const next = feedbackState(show, playing, t);
    for (const m of diffFeedback(this.prev, next)) this.send(m);
    this.prev = next;
    if (!playing) return;
    const interval = 1000 / clampRateHz(this.rateHz);
    // Small tolerance so a 60 Hz tick does not skip slots of a 10 Hz rate.
    if (nowMs - this.lastTimeMs >= interval - 1) {
      this.lastTimeMs = nowMs;
      for (const m of timeMessages(t, show.fps)) this.send(m);
    }
  }

  go(cueIndex: number): void {
    this.send(goAckMessage(cueIndex));
  }
}
