/**
 * Media sync maths (pure). Videos follow the master clock: a large drift is fixed
 * with a seek, a small one by nudging playbackRate (±5%) so playback stays smooth.
 */

export const MAX_NUDGE = 0.05;
/** Drift (seconds) corrected over this horizon when nudging. */
export const NUDGE_HORIZON_SEC = 0.5;
/** Seek when the video is more than this many frames off. */
export const SEEK_THRESHOLD_FRAMES = 2;

export interface SyncDecision {
  /** Seek target in seconds, or null to keep playing. */
  seekTo: number | null;
  playbackRate: number;
  shouldPlay: boolean;
}

/**
 * @param current  video.currentTime
 * @param target   where the clock says the video should be
 * @param baseRate layer speed × transport rate
 */
export function syncDecision(
  current: number,
  target: number,
  playing: boolean,
  baseRate: number,
  fps: number,
): SyncDecision {
  const frame = 1 / Math.max(1, fps);
  const drift = current - target; // > 0: video is ahead
  if (!playing) {
    return { seekTo: Math.abs(drift) > frame * 0.5 ? target : null, playbackRate: baseRate, shouldPlay: false };
  }
  if (Math.abs(drift) > SEEK_THRESHOLD_FRAMES * frame) {
    return { seekTo: target, playbackRate: baseRate, shouldPlay: true };
  }
  const correction = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, -drift / NUDGE_HORIZON_SEC));
  return { seekTo: null, playbackRate: baseRate * (1 + correction), shouldPlay: true };
}

/** Clips whose layer starts within this window are preloaded (seeked, paused). */
export const PRELOAD_SEC = 2;
