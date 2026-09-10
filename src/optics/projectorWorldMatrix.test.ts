import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';
import { getProjectorWorldMatrix } from './projectorWorldMatrix';

describe('getProjectorWorldMatrix', () => {
  it('applies look-at orientation when enabled', () => {
    const projector = structuredClone(DEFAULT_PROJECTORS[0]);
    const matrix = getProjectorWorldMatrix(projector);
    const forward = new THREE.Vector3(0, 0, -1).transformDirection(matrix).normalize();
    const toTarget = new THREE.Vector3(0, 1.5, 0).sub(
      new THREE.Vector3().setFromMatrixPosition(matrix),
    ).normalize();
    expect(forward.dot(toTarget)).toBeGreaterThan(0.99);
  });
});
