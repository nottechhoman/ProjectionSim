import type { ProjectorConfig, Vec2 } from '../types';
import { DEFAULT_BLEND_GAMMA } from '../types';
import { blendWeightWithGamma } from './blendWeights';

export { autoBlendWeights, lightWeight } from './advancedBlend';

/** Manual-mode weight for a projector at content UV q (matches the shader). */
export function blendWeightWithGammaShim(q: Vec2, projector: ProjectorConfig): number {
  return blendWeightWithGamma(
    q.x,
    q.y,
    projector.blendEdges,
    projector.outerEdgeFade,
    projector.blendGamma ?? DEFAULT_BLEND_GAMMA,
  );
}
