import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { eulerYXZToQuaternion } from '../utils/euler';
import { computeAlignedOverlap } from '../coverage/overlap';
import { deriveAutoBlendEdgesFromOverlap } from './autoBlend';
import { collectAlignedProjectorLayouts } from '../coverage/overlap';

describe('autoBlend from overlap', () => {
  const optics = {
    throwRatio: 1.5,
    resolution: { width: 1920, height: 1080 },
    aspectRatio: 16 / 9,
    lensShiftH: 0,
    lensShiftV: 0,
    nearLimit: 0.1,
    farLimit: 100,
  };

  const screenMatrix = new THREE.Matrix4();
  screenMatrix.compose(
    new THREE.Vector3(0, 1.5, 0),
    new THREE.Quaternion(...eulerYXZToQuaternion(0, 0, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  const screen = {
    center: new THREE.Vector3(0, 1.5, 0),
    normal: new THREE.Vector3(0, 0, 1),
    width: 20,
    height: 20,
    matrix: screenMatrix,
  };

  const makeProjector = (x: number, id: string) => ({
    id,
    name: id,
    enabled: true,
    color: '#fff',
    transform: {
      position: { x, y: 1.5, z: 6 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
    optics,
    testPattern: 'white' as const,
    brightness: 1,
    mediaSource: 'pattern' as const,
    mediaAssetId: null,
    mediaFit: 'contain' as const,
    blendEdges: { left: 0, right: 0, top: 0, bottom: 0 },
    blendGamma: 1,
    outerEdgeFade: false,
  });

  it('derives facing edges from a two-projector overlap', () => {
    const projectors = [makeProjector(-1.6, 'p1'), makeProjector(1.6, 'p2')];
    const overlap = computeAlignedOverlap(projectors, screen)!;
    const layouts = collectAlignedProjectorLayouts(projectors, screen);
    const patch = deriveAutoBlendEdgesFromOverlap(layouts, overlap.pairwise);

    expect(patch.p1.right).toBeCloseTo(0.2, 2);
    expect(patch.p2.left).toBeCloseTo(0.2, 2);
    expect(patch.p1.left).toBe(0);
    expect(patch.p2.right).toBe(0);
  });

  it('returns empty patch with fewer than 2 projectors', () => {
    const projectors = [makeProjector(0, 'p1')];
    const layouts = collectAlignedProjectorLayouts(projectors, screen);
    expect(deriveAutoBlendEdgesFromOverlap(layouts, [])).toEqual({});
    expect(deriveAutoBlendEdgesFromOverlap([], [])).toEqual({});
  });
});
