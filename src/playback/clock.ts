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
  return state.anchorSec + ((nowMs - state.anchorWallMs) / 1000) * state.rate;
}

export class TransportClock {
  private state: ClockState = { playing: false, rate: 1, anchorSec: 0, anchorWallMs: 0 };
  private readonly listeners = new Set<() => void>();

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

  snapshot(): ClockState {
    return { ...this.state };
  }

  play(): void {
    if (this.state.playing) return;
    this.state = { ...this.state, playing: true, anchorWallMs: this.now() };
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
