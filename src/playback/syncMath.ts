/**
 * Media sync maths (pure). Videos follow the master clock: a large drift is fixed
 * with a seek, a smaller one by nudging playbackRate (at most ±5%).
 *
 * Measured in Chrome on an M1 Max with 8 × 1080p clips (see docs/v4-playback.md):
 *  - every playing <video> shows its frames a steady ~40–110 ms behind its own
 *    clock (presentation + start-up latency) — the same for clips started together;
 *  - any playbackRate ≠ 1 makes Chrome skip frames (≈4 per second at +1%);
 *  - a seek on long-GOP footage costs a decode from the last keyframe (0.2–0.8 s).
 * So drift is measured against a learned common latency, the rate is only nudged
 * (with hysteresis) when a video really falls out of step, and seeking is kept for
 * jumps bigger than what a seek itself costs.
 */

export const MAX_NUDGE = 0.05;
/** Drift (seconds) corrected over this horizon when nudging. */
export const NUDGE_HORIZON_SEC = 0.5;
/** Start nudging beyond this many frames of error … */
export const NUDGE_START_FRAMES = 1.5;
/** … and stop once back within this many. */
export const NUDGE_STOP_FRAMES = 0.5;
/** Seek when the video is more than this many frames off (and a seek is cheaper than the error). */
export const SEEK_THRESHOLD_FRAMES = 2;
/** While a video settles after a seek / start, only re-seek beyond this. */
export const SETTLE_SEEK_THRESHOLD_SEC = 0.25;
/** Clips whose layer starts within this window are preloaded (seeked, paused). */
export const PRELOAD_SEC = 2;
/** Common presentation latency is learned within [0, MAX_LATENCY_SEC]. */
export const MAX_LATENCY_SEC = 0.15;

export interface SyncDecision {
  /** Seek target in seconds, or null to keep playing. */
  seekTo: number | null;
  playbackRate: number;
  shouldPlay: boolean;
  /** Nudging state to pass back next frame (hysteresis). */
  correcting: boolean;
}

export interface SyncOptions {
  /** Measured seek latency for this video (seconds); seeks while playing land this far ahead. */
  seekLeadSec?: number;
  /** Just after a seek / start: tolerate more drift before seeking again. */
  settling?: boolean;
  /** Learned common presentation latency (seconds, video behind the clock). */
  latencySec?: number;
  /** Was this video being nudged last frame? */
  correcting?: boolean;
}

/**
 * @param current  media time of the frame on screen (or video.currentTime)
 * @param target   where the clock says the video should be
 * @param baseRate layer speed × transport rate
 */
export function syncDecision(
  current: number,
  target: number,
  playing: boolean,
  baseRate: number,
  fps: number,
  options: SyncOptions = {},
): SyncDecision {
  const frame = 1 / Math.max(1, fps);
  if (!playing) {
    const drift = current - target;
    return { seekTo: Math.abs(drift) > frame * 0.5 ? target : null, playbackRate: baseRate, shouldPlay: false, correcting: false };
  }
  const lead = options.seekLeadSec ?? 0;
  // Error relative to the common latency: > 0 the video is ahead of the pack.
  const error = current - target + (options.latencySec ?? 0);
  const seekAt = Math.max(SEEK_THRESHOLD_FRAMES * frame, 2 * lead * baseRate);
  const threshold = options.settling ? Math.max(SETTLE_SEEK_THRESHOLD_SEC, seekAt) : seekAt;
  if (Math.abs(error) > threshold) {
    return { seekTo: target + lead * baseRate, playbackRate: baseRate, shouldPlay: true, correcting: false };
  }
  const band = (options.correcting ? NUDGE_STOP_FRAMES : NUDGE_START_FRAMES) * frame;
  if (Math.abs(error) <= band) return { seekTo: null, playbackRate: baseRate, shouldPlay: true, correcting: false };
  const correction = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, -error / NUDGE_HORIZON_SEC));
  return { seekTo: null, playbackRate: baseRate * (1 + correction), shouldPlay: true, correcting: true };
}

/** Exponential moving average for measured seek latency (seconds). */
export function updateSeekLead(previous: number, measuredSec: number): number {
  const m = Math.min(1, Math.max(0, measuredSec));
  return previous * 0.6 + m * 0.4;
}

/**
 * Learn the common presentation latency from the playing videos' raw lag (clock −
 * frame time, seconds): slowly follow their median so one late video still stands
 * out, while the shared offset is not "corrected" (which would only cost frames).
 */
export function updateLatency(previous: number, lags: number[], alpha = 0.05): number {
  if (lags.length === 0) return previous;
  const sorted = [...lags].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const next = previous + alpha * (median - previous);
  return Math.min(MAX_LATENCY_SEC, Math.max(0, next));
}
