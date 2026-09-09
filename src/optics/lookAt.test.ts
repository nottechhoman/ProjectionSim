import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  applyLookAtToProjector,
  computeProjectorLookAtQuaternion,
  rollFromProjectorQuaternion,
} from './lookAt';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';

function forwardFromQuat(q: [number, number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(0, 0, -1).applyQuaternion(
    new THREE.Quaternion(q[0], q[1], q[2], q[3]),
  );
}

const baseProjector = () => ({
  ...DEFAULT_PROJECTORS[0],
  transform: {
    position: { x: 0, y: 2, z: 4 },
    quaternion: [0, 0, 0, 1] as [number, number, number, number],
  },
  lookAtEnabled: true,
  lookAtTarget: { x: 0, y: 1.5, z: 0 },
});

describe('computeProjectorLookAtQuaternion', () => {
  it('aims -Z toward the target', () => {
    const pos = { x: 0, y: 2, z: 5 };
    const target = { x: 0, y: 1.5, z: 0 };
    const q = computeProjectorLookAtQuaternion(pos, target);
    const fwd = forwardFromQuat(q);
    const expected = new THREE.Vector3(target.x - pos.x, target.y - pos.y, target.z - pos.z).normalize();
    expect(fwd.angleTo(expected)).toBeLessThan(0.02);
  });

  it('applies roll around the optical axis without changing aim', () => {
    const pos = { x: 2, y: 2, z: 4 };
    const target = { x: 0, y: 1.5, z: 0 };
    const noRoll = computeProjectorLookAtQuaternion(pos, target, 0);
    const withRoll = computeProjectorLookAtQuaternion(pos, target, 15);
    expect(withRoll).not.toEqual(noRoll);
    const fwd = forwardFromQuat(withRoll);
    const expected = new THREE.Vector3(target.x - pos.x, target.y - pos.y, target.z - pos.z).normalize();
    expect(fwd.angleTo(expected)).toBeLessThan(0.02);
    expect(rollFromProjectorQuaternion(withRoll)).not.toBeCloseTo(rollFromProjectorQuaternion(noRoll), 0);
  });
});

describe('applyLookAtToProjector', () => {
  it('updates quaternion when look-at is enabled', () => {
    const projector = baseProjector();
    const next = applyLookAtToProjector(projector);
    expect(next.transform.quaternion).not.toEqual(projector.transform.quaternion);
    const fwd = forwardFromQuat(next.transform.quaternion);
    const expected = new THREE.Vector3(
      projector.lookAtTarget!.x - projector.transform.position.x,
      projector.lookAtTarget!.y - projector.transform.position.y,
      projector.lookAtTarget!.z - projector.transform.position.z,
    ).normalize();
    expect(fwd.angleTo(expected)).toBeLessThan(0.02);
  });

  it('leaves projector unchanged when look-at is disabled', () => {
    const projector = { ...baseProjector(), lookAtEnabled: false };
    const next = applyLookAtToProjector(projector);
    expect(next).toEqual(projector);
  });
});
