import type { BlendCurve, BlendSettings, Vec2 } from '../types';
import { DEFAULT_BLEND_SETTINGS } from '../types';

/**
 * v2 advanced edge blending — CPU mirror of the GLSL in multiProjection.frag.glsl.
 *
 * Auto mode is a geometry-aware partition of unity: every projector that actually
 * reaches a surface point gets an edge score from how far that point sits from the
 * edge of its (warped) image; weights are the scores normalized to sum to 1. Unlike
 * rectangular feathers this works for any overlap shape, curved surfaces, 3+
 * projectors and rotated/keystoned projectors, and never double-brightens.
 */

export const BLEND_CURVE_INT: Record<BlendCurve, number> = {
  linear: 0,
  smoothstep: 1,
  cosine: 2,
  power: 3,
};

export const MIN_AUTO_WIDTH = 0.05;
export const MAX_AUTO_WIDTH = 1;
export const MIN_AUTO_EXPONENT = 0.5;
export const MAX_AUTO_EXPONENT = 4;
export const MAX_BLACK_LEVEL = 0.1;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function normalizeBlendSettings(raw: Partial<BlendSettings> | null | undefined): BlendSettings {
  const d = DEFAULT_BLEND_SETTINGS;
  const r = raw ?? {};
  const num = (v: unknown, fb: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb;
  return {
    mode: r.mode === 'auto' ? 'auto' : 'manual',
    curve:
      r.curve === 'linear' || r.curve === 'cosine' || r.curve === 'power' || r.curve === 'smoothstep'
        ? r.curve
        : d.curve,
    width: num(r.width, d.width, MIN_AUTO_WIDTH, MAX_AUTO_WIDTH),
    exponent: num(r.exponent, d.exponent, MIN_AUTO_EXPONENT, MAX_AUTO_EXPONENT),
    gammaCorrect: r.gammaCorrect !== false,
    displayGamma: num(r.displayGamma, d.displayGamma, 1, 3),
    blackLevel: num(r.blackLevel, d.blackLevel, 0, MAX_BLACK_LEVEL),
    blackLevelCompensation: r.blackLevelCompensation === true,
  };
}

/** Ramp shape on t ∈ [0,1]. */
export function blendCurve(t: number, curve: BlendCurve): number {
  const x = clamp01(t);
  switch (curve) {
    case 'linear':
      return x;
    case 'smoothstep':
      return x * x * (3 - 2 * x);
    case 'cosine':
      return 0.5 - 0.5 * Math.cos(Math.PI * x);
    case 'power':
      return x * x;
    default:
      return x;
  }
}

/**
 * Edge score of a content-space image UV: 0 on the image border, 1 once the
 * point is `width` (fraction of half the image) away from every edge.
 */
export function edgeScore(q: Vec2, settings: Pick<BlendSettings, 'curve' | 'width'>): number {
  if (q.x < 0 || q.x > 1 || q.y < 0 || q.y > 1) return 0;
  const w = Math.max(MIN_AUTO_WIDTH, settings.width);
  const dx = Math.min(q.x, 1 - q.x) * 2;
  const dy = Math.min(q.y, 1 - q.y) * 2;
  return blendCurve(dx / w, settings.curve) * blendCurve(dy / w, settings.curve);
}

/**
 * Auto weights for the projectors reaching one surface point. `null` entries are
 * projectors that do not reach the point (outside frustum/warp or occluded).
 * Returned weights sum to 1 over the reaching projectors.
 */
export function autoBlendWeights(
  qs: readonly (Vec2 | null)[],
  settings: Pick<BlendSettings, 'curve' | 'width' | 'exponent'>,
): number[] {
  const p = Math.max(MIN_AUTO_EXPONENT, settings.exponent);
  const scores = qs.map((q) => (q ? Math.pow(edgeScore(q, settings), p) : 0));
  const reaching = qs.filter((q) => q !== null).length;
  const sum = scores.reduce((a, b) => a + b, 0);
  if (reaching === 0) return qs.map(() => 0);
  if (sum <= 1e-9) return qs.map((q) => (q ? 1 / reaching : 0));
  return scores.map((s) => s / sum);
}

/**
 * Convert a light-space weight into the light actually produced. With gamma
 * correction the mask is pre-compensated (signal = w^(1/γ)) so light = w; without
 * it the raw weight is sent as signal and the display gamma darkens the crossover.
 */
export function lightWeight(w: number, settings: Pick<BlendSettings, 'gammaCorrect' | 'displayGamma'>): number {
  const x = clamp01(w);
  return settings.gammaCorrect ? x : Math.pow(x, settings.displayGamma);
}

/** Signal-space mask value written into the projector feed / exported PNG. */
export function signalMask(w: number, settings: Pick<BlendSettings, 'gammaCorrect' | 'displayGamma'>): number {
  const x = clamp01(w);
  return settings.gammaCorrect ? Math.pow(x, 1 / settings.displayGamma) : x;
}

/**
 * Black floor (fraction of one projector's white) at a point hit by `count`
 * projectors. With compensation the floor is lifted to the deepest overlap.
 */
export function blackFloor(
  count: number,
  maxOverlap: number,
  settings: Pick<BlendSettings, 'blackLevel' | 'blackLevelCompensation'>,
): number {
  if (count <= 0) return 0;
  const target = settings.blackLevelCompensation ? Math.max(count, maxOverlap) : count;
  return target * settings.blackLevel;
}

/** Total light for unit content across projectors with the given light weights. */
export function compositeLight(
  contentLevels: readonly number[],
  lightWeights: readonly number[],
  maxOverlap: number,
  settings: Pick<BlendSettings, 'blackLevel' | 'blackLevelCompensation'>,
): number {
  const count = lightWeights.length;
  const bl = settings.blackLevel;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += (1 - bl) * contentLevels[i] * lightWeights[i];
  return sum + blackFloor(count, maxOverlap, settings);
}
