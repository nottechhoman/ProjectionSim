import type { AlignedProjectorLayout } from '../coverage/overlap';
import type { BlendEdges, PairwiseOverlap } from '../types';
import { DEFAULT_BLEND_EDGES } from '../types';

const MAX_EDGE_FRACTION = 0.5;

export type AutoBlendPatch = Record<string, BlendEdges>;

function emptyPatch(): AutoBlendPatch {
  return {};
}

/** Derive per-projector inward-facing feather from pairwise overlap on a flat target. */
export function deriveAutoBlendEdgesFromOverlap(
  layouts: AlignedProjectorLayout[],
  pairwise: PairwiseOverlap[],
): AutoBlendPatch {
  if (layouts.length < 2 || pairwise.length === 0) {
    return emptyPatch();
  }

  const layoutById = new Map(layouts.map((l) => [l.id, l]));
  const edges: AutoBlendPatch = {};

  const ensure = (id: string): BlendEdges => {
    if (!edges[id]) {
      edges[id] = { ...DEFAULT_BLEND_EDGES };
    }
    return edges[id];
  };

  for (const pair of pairwise) {
    if ((pair.overlapWidthM ?? 0) <= 0) continue;

    const layoutA = layoutById.get(pair.projectorAId);
    const layoutB = layoutById.get(pair.projectorBId);
    if (!layoutA || !layoutB) continue;

    const centerA = (layoutA.rect.minX + layoutA.rect.maxX) * 0.5;
    const centerB = (layoutB.rect.minX + layoutB.rect.maxX) * 0.5;
    const aIsLeft = centerA < centerB;

    const leftId = aIsLeft ? pair.projectorAId : pair.projectorBId;
    const rightId = aIsLeft ? pair.projectorBId : pair.projectorAId;
    const fracOnLeftRight = (aIsLeft ? pair.percentOfA : pair.percentOfB) / 100;
    const fracOnRightLeft = (aIsLeft ? pair.percentOfB : pair.percentOfA) / 100;

    const leftEdges = ensure(leftId);
    const rightEdges = ensure(rightId);
    leftEdges.right = Math.min(
      MAX_EDGE_FRACTION,
      Math.max(leftEdges.right, fracOnLeftRight),
    );
    rightEdges.left = Math.min(
      MAX_EDGE_FRACTION,
      Math.max(rightEdges.left, fracOnRightLeft),
    );
  }

  return edges;
}
