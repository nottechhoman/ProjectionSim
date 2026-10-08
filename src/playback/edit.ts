import type { Layer } from '../types';
import { snapToFrame } from './timecode';

/** Timeline clip edits (pure). Times snap to the show's frame grid. */

export const MIN_CLIP_SEC = 0.1;

export function moveClip(_layer: Layer, startSec: number, fps: number): Pick<Layer, 'startSec'> {
  return { startSec: Math.max(0, snapToFrame(startSec, fps)) };
}

/**
 * Drag the clip's left edge to newStart: the end stays put and the media in-point
 * follows (a video keeps its frames aligned with the timeline).
 */
export function trimClipStart(layer: Layer, newStart: number, fps: number): Pick<Layer, 'startSec' | 'durationSec' | 'inSec'> {
  const end = layer.startSec + layer.durationSec;
  let start = Math.max(0, snapToFrame(newStart, fps));
  start = Math.min(start, end - MIN_CLIP_SEC);
  const delta = start - layer.startSec;
  const inSec = layer.media.kind === 'video' ? Math.max(0, layer.inSec + delta * layer.speed) : layer.inSec;
  // A left trim cannot reveal media before the clip's first frame.
  if (layer.media.kind === 'video' && layer.inSec + delta * layer.speed < 0) {
    const s = layer.startSec - layer.inSec / layer.speed;
    return { startSec: s, durationSec: end - s, inSec: 0 };
  }
  return { startSec: start, durationSec: end - start, inSec };
}

export function trimClipEnd(layer: Layer, newEnd: number, fps: number): Pick<Layer, 'durationSec'> {
  const end = Math.max(layer.startSec + MIN_CLIP_SEC, snapToFrame(newEnd, fps));
  return { durationSec: end - layer.startSec };
}
