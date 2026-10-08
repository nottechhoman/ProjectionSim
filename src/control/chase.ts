/**
 * MTC chase (pure). The transport follows incoming timecode: it locates when it
 * is more than a couple of frames away, runs while timecode keeps arriving and
 * stops when it goes quiet.
 */

export const CHASE_TOLERANCE_FRAMES = 2;
/** Timecode silent this long = the source stopped. */
export const CHASE_TIMEOUT_MS = 250;

export interface ChaseDecision {
  seekTo: number | null;
  play: boolean;
}

/**
 * @param showTime  transport playhead now
 * @param mtcTime   show time from the latest timecode (offset applied), already
 *                  advanced to "now" by the caller
 * @param fps       timecode frame rate
 */
export function chaseDecision(showTime: number, mtcTime: number, fps: number): ChaseDecision {
  const tol = CHASE_TOLERANCE_FRAMES / Math.max(1, fps);
  return { seekTo: Math.abs(showTime - mtcTime) > tol ? Math.max(0, mtcTime) : null, play: true };
}

export function chaseTimedOut(lastMtcWallMs: number | null, nowMs: number): boolean {
  return lastMtcWallMs === null || nowMs - lastMtcWallMs > CHASE_TIMEOUT_MS;
}
