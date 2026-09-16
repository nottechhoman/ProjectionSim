import type { BlendEdges } from '../types';
import type { DeviceProfile } from '../ui/deviceProfile';
import { rasterPreviewResolution } from '../ui/deviceProfile';
import { blendWeightWithGamma } from '../blending/blendWeights';

export const RASTER_PREVIEW_INTERVAL_MS = 250;

export function rasterPreviewLongEdge(profile: DeviceProfile): number {
  return rasterPreviewResolution(profile);
}

export function rasterPreviewSize(
  aspectRatio: number,
  profile: DeviceProfile,
  maxTextureSize: number,
): { width: number; height: number } {
  const aspect = aspectRatio > 0 ? aspectRatio : 16 / 9;
  const longEdge = Math.max(1, Math.min(rasterPreviewLongEdge(profile), maxTextureSize));
  if (aspect >= 1) {
    return { width: longEdge, height: Math.max(1, Math.round(longEdge / aspect)) };
  }
  return { width: Math.max(1, Math.round(longEdge * aspect)), height: longEdge };
}

/** Preview output multiplier: shader `pow(rawBlendWeight, gamma) * brightness`. */
export function rasterPreviewRamp(
  u: number,
  v: number,
  edges: BlendEdges,
  outerEdgeFade: boolean,
  blendGamma: number,
  brightness: number,
): number {
  return blendWeightWithGamma(u, v, edges, outerEdgeFade, blendGamma) * brightness;
}
