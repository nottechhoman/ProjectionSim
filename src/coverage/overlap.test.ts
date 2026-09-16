import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { eulerYXZToQuaternion } from '../utils/euler';
import { computeAlignedOverlap, multiCoverageArea, rectArea, rectIntersection, unionArea } from './overlap';

describe('Acceptance Test 4: Overlap (Milestone 3)', () => {
  it('computes pairwise overlap without double-counting triple regions', () => {
    const throwRatio = 1.5;
    const aspect = 16 / 9;

    const optics = {
      throwRatio,
      resolution: { width: 1920, height: 1080 },
      aspectRatio: aspect,
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
    const center = new THREE.Vector3(0, 1.5, 0);
    const normal = new THREE.Vector3(0, 0, 1);

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

    const left = makeProjector(-1.6, 'p1');
    const right = makeProjector(1.6, 'p2');
    const screen = { center, normal, width: 20, height: 20, matrix: screenMatrix };

    const result = computeAlignedOverlap([left, right], screen);
    expect(result).not.toBeNull();

    const pair = result!.pairwise[0];
    expect(pair.overlapWidthM).toBeCloseTo(0.8, 2);
    expect(pair.percentOfA).toBeCloseTo(20, 1);
    expect(pair.percentOfB).toBeCloseTo(20, 1);
    expect(pair.areaM2).toBeCloseTo(1.8, 2);
    expect(pair.overlapPixelsA).toBe(384);
    expect(pair.overlapPixelsB).toBe(384);
    expect(result!.horizontalOverlapM).toBeCloseTo(0.8, 2);
    expect(result!.combinedWidthM).toBeCloseTo(7.2, 2);
    expect(result!.unionAreaM2).toBeCloseTo(16.2, 2);

    const tripleRects = [
      { minX: 0, maxX: 6, minY: 0, maxY: 2.25 },
      { minX: 2, maxX: 8, minY: 0, maxY: 2.25 },
      { minX: 4, maxX: 10, minY: 0, maxY: 2.25 },
    ];
    const pairSum = tripleRects.reduce((sum, _, i) => {
      if (i === 0) return sum;
      const inter = rectIntersection(tripleRects[i - 1], tripleRects[i]);
      return sum + (inter ? rectArea(inter) : 0);
    }, 0);
    const multi = multiCoverageArea(tripleRects);
    expect(multi).toBeCloseTo(13.5, 1);
    expect(pairSum).toBeGreaterThan(multi);
    expect(unionArea(tripleRects)).toBeCloseTo(22.5, 1);
  });
});
