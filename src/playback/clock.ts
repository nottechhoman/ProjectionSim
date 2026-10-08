/**
 * Master transport clock. The playhead is derived, never accumulated:
 *   playhead = anchorSec + (now - anchorWall) * rate   (while playing)
 * so frame drops or slow frames never make the show drift.
 */

export type Now = () => number;

export interface ClockState {
  playing: boolean;
  rate: number;
  anchorSec: number;
  anchorWallMs: number;
}

export function playheadAt(state: ClockState, nowMs: number): number {
  if (!state.playing) return state.anchorSec;
  // Before the anchor (pre-roll) the playhead holds still.
  return state.anchorSec + (Math.max(0, nowMs - state.anchorWallMs) / 1000) * state.rate;
}

export class TransportClock {
  private state: ClockState = { playing: false, rate: 1, anchorSec: 0, anchorWallMs: 0 };
  private readonly listeners = new Set<() => void>();
  /**
   * Pre-roll on play (ms): the playhead starts moving this long after play() so
   * videos (which take ~0.1 s to show their first frame) start in step with it.
   */
  prerollMs = 0;

  constructor(private readonly now: Now = () => performance.now()) {}

  get playing(): boolean {
    return this.state.playing;
  }

  get rate(): number {
    return this.state.rate;
  }

  /** Current playhead in seconds. */
  time(): number {
    return playheadAt(this.state, this.now());
  }

  /** Playhead at a given wall time (same timebase as performance.now()). */
  timeAtWall(wallMs: number): number {
    return playheadAt(this.state, wallMs);
  }

  snapshot(): ClockState {
    return { ...this.state };
  }

  play(): void {
    if (this.state.playing) return;
    this.state = { ...this.state, playing: true, anchorWallMs: this.now() + Math.max(0, this.prerollMs) };
    this.emit();
  }

  pause(): void {
    if (!this.state.playing) return;
    this.state = { ...this.state, playing: false, anchorSec: this.time() };
    this.emit();
  }

  seek(sec: number): void {
    this.state = { ...this.state, anchorSec: Math.max(0, sec), anchorWallMs: this.now() };
    this.emit();
  }

  setRate(rate: number): void {
    const r = Math.min(4, Math.max(0.1, rate));
    this.state = { ...this.state, anchorSec: this.time(), anchorWallMs: this.now(), rate: r };
    this.emit();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

/** The app's single transport. */
export const transport = new TransportClock();
