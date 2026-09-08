import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';
import { eulerYXZToQuaternion } from '../utils/euler';
import { computeCurvedOverlap } from './curvedOverlap';

describe('computeCurvedOverlap', () => {
  const screenMatrix = new THREE.Matrix4();
  screenMatrix.compose(
    new THREE.Vector3(0, 1.5, 0),
    new THREE.Quaternion(...eulerYXZToQuaternion(-90, 0, 0)),
    new THREE.Vector3(1, 1, 1),
  );

  const surface = {
    worldMatrix: screenMatrix,
    radius: 4,
    arcAngleDeg: 90,
    height: 3.375,
  };

  it('computes pairwise overlap for two projectors on a curved screen', () => {
    const projectors = [
      {
        ...DEFAULT_PROJECTORS[0],
        id: 'proj-1',
        transform: {
          position: { x: -0.5, y: 1.5, z: 6 },
          quaternion: eulerYXZToQuaternion(0, 0, 0),
        },
        blendEdges: { left: 0.12, right: 0, top: 0, bottom: 0 },
      },
      {
        ...DEFAULT_PROJECTORS[0],
        id: 'proj-2',
        name: 'Projector 2',
        color: '#ff7043',
        transform: {
          position: { x: 0.5, y: 1.5, z: 6 },
          quaternion: eulerYXZToQuaternion(0, 0, 0),
        },
        blendEdges: { left: 0, right: 0.12, top: 0, bottom: 0 },
      },
    ];

    const overlap = computeCurvedOverlap(projectors, surface);
    expect(overlap).not.toBeNull();
    expect(overlap!.pairwise.length).toBe(1);
    expect(overlap!.pairwise[0].areaM2).toBeGreaterThan(0);
    expect(overlap!.unionAreaM2).toBeGreaterThan(overlap!.pairwise[0].areaM2);
  });
});
