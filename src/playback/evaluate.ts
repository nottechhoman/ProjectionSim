import type { Layer, LayerPlayMode, Track } from '../types';

/**
 * Pure timeline evaluation: which layers are live at time t, how opaque they are
 * after fades, and which media time each should show.
 */

export interface LiveLayer {
  layer: Layer;
  /** Index in the track (0 = bottom). */
  index: number;
  /** Layer opacity × fade envelope (0–1). */
  opacity: number;
  /** Seconds into the media file, or null for stills / patterns / unknown length. */
  mediaTimeSec: number | null;
  /** Seconds since the layer started (timeline time, before speed). */
  localSec: number;
}

/** Media duration in seconds for an asset, if known (videos once metadata loads). */
export type MediaDurationLookup = (assetId: string) => number | null | undefined;

const EPS = 1e-6;

export function layerEndSec(layer: Pick<Layer, 'startSec' | 'durationSec'>): number {
  return layer.startSec + layer.durationSec;
}

/** Fade envelope (0–1) at localSec into a layer of the given duration. */
export function fadeEnvelope(localSec: number, durationSec: number, fadeInSec: number, fadeOutSec: number): number {
  let k = 1;
  if (fadeInSec > EPS && localSec < fadeInSec) k = Math.min(k, Math.max(0, localSec / fadeInSec));
  const remaining = durationSec - localSec;
  if (fadeOutSec > EPS && remaining < fadeOutSec) k = Math.min(k, Math.max(0, remaining / fadeOutSec));
  return k;
}

/**
 * Media time for `elapsed` seconds of playback (already × speed) of a clip that
 * runs from inSec for clipLen seconds. null = the clip has finished (once).
 */
export function wrapMediaTime(
  elapsed: number,
  inSec: number,
  clipLen: number,
  playMode: LayerPlayMode,
  frameSec = 1 / 30,
): number | null {
  if (!(clipLen > EPS)) return inSec;
  const e = Math.max(0, elapsed);
  switch (playMode) {
    case 'loop':
      return inSec + (e % clipLen);
    case 'once':
      return e < clipLen ? inSec + e : null;
    case 'holdLast':
      return inSec + Math.min(e, Math.max(0, clipLen - frameSec));
    case 'pingPong': {
      const m = e % (2 * clipLen);
      return inSec + (m < clipLen ? m : 2 * clipLen - m);
    }
  }
}

export function clipLength(layer: Pick<Layer, 'inSec' | 'outSec'>, mediaDurationSec: number | null | undefined): number | null {
  const end = layer.outSec ?? mediaDurationSec ?? null;
  if (end === null || !Number.isFinite(end)) return null;
  return Math.max(0, end - layer.inSec);
}

/**
 * Media time of a video layer at timeline time t (null outside the layer, or after
 * a play-once clip ends). Same rule as evaluate().
 */
export function layerMediaTimeAt(layer: Layer, t: number, mediaDurationSec: number | null, fps = 30): number | null {
  const local = t - layer.startSec;
  if (local < -EPS || local >= layer.durationSec - EPS) return null;
  const elapsed = Math.max(0, local) * layer.speed;
  const len = clipLength(layer, mediaDurationSec);
  if (len === null) return layer.inSec + elapsed;
  return wrapMediaTime(elapsed, layer.inSec, len, layer.playMode, 1 / fps);
}

/** Live layers at time t, bottom to top. */
export function evaluate(track: Track, t: number, mediaDuration: MediaDurationLookup = () => null, fps = 30): LiveLayer[] {
  const out: LiveLayer[] = [];
  track.layers.forEach((layer, index) => {
    if (!layer.enabled) return;
    const localSec = t - layer.startSec;
    if (localSec < -EPS || localSec >= layer.durationSec - EPS) return;
    const local = Math.max(0, localSec);
    let mediaTimeSec: number | null = null;
    if (layer.media.kind === 'video') {
      const duration = layer.media.assetId ? (mediaDuration(layer.media.assetId) ?? null) : null;
      mediaTimeSec = layerMediaTimeAt(layer, t, duration, fps);
      if (mediaTimeSec === null) return; // played once and finished
    }
    const opacity = layer.opacity * fadeEnvelope(local, layer.durationSec, layer.fadeInSec, layer.fadeOutSec);
    out.push({ layer, index, opacity, mediaTimeSec, localSec: local });
  });
  return out;
}
