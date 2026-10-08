import type { Keyframe, KeyframeEase, KeyframeProp, Layer, LayerKeyframes, LayerRect } from '../types';

/** Layer keyframes (pure): sampling, editing helpers and the animated layer state. */

export const KEYFRAME_PROPS: KeyframeProp[] = ['opacity', 'x', 'y', 'scale', 'rotationDeg'];
export const KEYFRAME_LABEL: Record<KeyframeProp, string> = {
  opacity: 'Opacity',
  x: 'X',
  y: 'Y',
  scale: 'Scale',
  rotationDeg: 'Rotation',
};

export function ease(kind: KeyframeEase, a: number): number {
  const x = Math.min(1, Math.max(0, a));
  if (kind === 'linear') return x;
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Value at local time t: held before the first / after the last key, interpolated between. */
export function sampleKeyframes(keys: Keyframe[] | undefined, t: number, fallback: number): number {
  if (!keys || keys.length === 0) return fallback;
  const k = [...keys].sort((a, b) => a.timeSec - b.timeSec);
  if (t <= k[0].timeSec) return k[0].value;
  const last = k[k.length - 1];
  if (t >= last.timeSec) return last.value;
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i];
    const b = k[i + 1];
    if (t >= a.timeSec && t <= b.timeSec) {
      const span = b.timeSec - a.timeSec;
      const u = span > 1e-9 ? (t - a.timeSec) / span : 1;
      return a.value + (b.value - a.value) * ease(a.ease, u);
    }
  }
  return last.value;
}

/** Un-animated value of a property. */
export function baseValue(layer: Pick<Layer, 'opacity' | 'rect'>, prop: KeyframeProp): number {
  switch (prop) {
    case 'opacity':
      return layer.opacity;
    case 'x':
      return layer.rect.x;
    case 'y':
      return layer.rect.y;
    case 'scale':
      return 1;
    case 'rotationDeg':
      return layer.rect.rotationDeg;
  }
}

export function valueAt(layer: Pick<Layer, 'opacity' | 'rect' | 'keyframes'>, prop: KeyframeProp, localSec: number): number {
  return sampleKeyframes(layer.keyframes?.[prop], localSec, baseValue(layer, prop));
}

export interface AnimatedState {
  opacity: number;
  rect: LayerRect;
}

/** Opacity and rect after keyframes at localSec (scale grows the rect about its centre). */
export function animateLayer(layer: Pick<Layer, 'opacity' | 'rect' | 'keyframes'>, localSec: number): AnimatedState {
  if (!layer.keyframes) return { opacity: layer.opacity, rect: layer.rect };
  const x = valueAt(layer, 'x', localSec);
  const y = valueAt(layer, 'y', localSec);
  const scale = Math.max(0, valueAt(layer, 'scale', localSec));
  const rotationDeg = valueAt(layer, 'rotationDeg', localSec);
  const w = layer.rect.width * scale;
  const h = layer.rect.height * scale;
  return {
    opacity: Math.min(1, Math.max(0, valueAt(layer, 'opacity', localSec))),
    rect: {
      x: x + (layer.rect.width - w) / 2,
      y: y + (layer.rect.height - h) / 2,
      width: Math.max(1e-4, w),
      height: Math.max(1e-4, h),
      rotationDeg,
    },
  };
}

/** Insert or replace (within half a frame) a key. */
export function upsertKeyframe(keys: Keyframe[] | undefined, key: Keyframe, frameSec = 1 / 30): Keyframe[] {
  const list = (keys ?? []).filter((k) => Math.abs(k.timeSec - key.timeSec) > frameSec / 2 && k.id !== key.id);
  return [...list, key].sort((a, b) => a.timeSec - b.timeSec);
}

export function keyAt(keys: Keyframe[] | undefined, t: number, frameSec = 1 / 30): Keyframe | null {
  return keys?.find((k) => Math.abs(k.timeSec - t) <= frameSec / 2) ?? null;
}

export function withPropKeys(keyframes: LayerKeyframes | undefined, prop: KeyframeProp, keys: Keyframe[]): LayerKeyframes | undefined {
  const next: LayerKeyframes = { ...(keyframes ?? {}) };
  if (keys.length > 0) next[prop] = keys;
  else delete next[prop];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function normalizeKeyframes(raw: unknown): LayerKeyframes | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: LayerKeyframes = {};
  for (const prop of KEYFRAME_PROPS) {
    const list = (raw as Record<string, unknown>)[prop];
    if (!Array.isArray(list)) continue;
    const keys = list
      .filter((k): k is Record<string, unknown> => !!k && typeof k === 'object')
      .filter((k) => typeof k.timeSec === 'number' && Number.isFinite(k.timeSec) && typeof k.value === 'number' && Number.isFinite(k.value))
      .map((k, i) => ({
        id: typeof k.id === 'string' ? k.id : `key-${prop}-${i}`,
        timeSec: Math.max(0, k.timeSec as number),
        value: k.value as number,
        ease: (k.ease === 'easeInOut' ? 'easeInOut' : 'linear') as KeyframeEase,
      }))
      .sort((a, b) => a.timeSec - b.timeSec);
    if (keys.length > 0) out[prop] = keys;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
