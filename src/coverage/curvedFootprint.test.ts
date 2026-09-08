import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeCurvedFootprint } from './curvedFootprint';
import { eulerYXZToQuaternion } from '../utils/euler';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';

describe('computeCurvedFootprint', () => {
  it('finds four corner hits on a curved screen facing the projector', () => {
    const screenMatrix = new THREE.Matrix4();
    const screenPos = new THREE.Vector3(0, 1.5, 0);
    const screenQuat = new THREE.Quaternion(...eulerYXZToQuaternion(-90, 0, 0));
    screenMatrix.compose(screenPos, screenQuat, new THREE.Vector3(1, 1, 1));

    const projector = DEFAULT_PROJECTORS[0];
    const projMatrix = new THREE.Matrix4();
    const projPos = new THREE.Vector3(0, 1.5, 6);
    const projQuat = new THREE.Quaternion(...projector.transform.quaternion);
    projMatrix.compose(projPos, projQuat, new THREE.Vector3(1, 1, 1));

    const footprint = computeCurvedFootprint(projector.optics, projMatrix, {
      worldMatrix: screenMatrix,
      radius: 4,
      arcAngleDeg: 90,
      height: 3.375,
    });

    expect(footprint.corners).toHaveLength(4);
    expect(footprint.axialDistance).not.toBeNull();
    expect(footprint.beamOutline?.length).toBeGreaterThan(4);
    expect(footprint.unclippedArea).toBeGreaterThan(0);
  });
});
