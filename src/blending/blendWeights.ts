import type { BlendEdges } from '../types';
import { DEFAULT_BLEND_GAMMA, MAX_BLEND_GAMMA, MIN_BLEND_GAMMA } from '../types';

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Projector raster UV weight from per-edge feather (0–0.5 fraction of image). */
export function rawBlendWeight(
  u: number,
  v: number,
  edges: BlendEdges,
  outerEdgeFade: boolean,
): number {
  let w = 1;
  if (edges.left > 0) w *= smoothstep(0, edges.left, u);
  if (edges.right > 0) w *= smoothstep(0, edges.right, 1 - u);
  if (edges.bottom > 0) w *= smoothstep(0, edges.bottom, v);
  if (edges.top > 0) w *= smoothstep(0, edges.top, 1 - v);

  if (outerEdgeFade) {
    const outer = 0.04;
    w *= smoothstep(0, outer, u) * smoothstep(0, outer, 1 - u);
    w *= smoothstep(0, outer, v) * smoothstep(0, outer, 1 - v);
  }

  return w;
}

export function clampBlendGamma(gamma: number): number {
  return Math.min(MAX_BLEND_GAMMA, Math.max(MIN_BLEND_GAMMA, gamma));
}

/** Ramp weight with optional gamma (matches shader; 1.0 is identity). */
export function blendWeightWithGamma(
  u: number,
  v: number,
  edges: BlendEdges,
  outerEdgeFade: boolean,
  blendGamma = DEFAULT_BLEND_GAMMA,
): number {
  const raw = rawBlendWeight(u, v, edges, outerEdgeFade);
  const g = clampBlendGamma(blendGamma);
  return Math.pow(raw, g);
}

/** Physical additive brightness for unit content and per-projector weights. */
export function additiveBlendBrightness(weights: number[], contentLevel = 1): number {
  return weights.reduce((sum, w) => sum + contentLevel * w, 0);
}

export function normalizeBlendWeights(weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  return weights.map((w) => w / sum);
}

/** Combined linear-light color from per-projector samples and normalized weights. */
export function blendLinearColors(
  colors: number[][],
  weights: number[],
): [number, number, number] {
  const normalized = normalizeBlendWeights(weights);
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < colors.length; i++) {
    r += colors[i][0] * normalized[i];
    g += colors[i][1] * normalized[i];
    b += colors[i][2] * normalized[i];
  }
  return [r, g, b];
}
