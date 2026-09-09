import * as THREE from 'three';
import type { ProjectorConfig, Vec3 } from '../types';
import { quaternionToEulerYXZ } from '../utils/euler';

/** Aim projector optical axis (-Z) from position toward target, optional roll in degrees. */
export function computeProjectorLookAtQuaternion(
  position: Vec3,
  target: Vec3,
  rollDeg = 0,
): [number, number, number, number] {
  const eye = new THREE.Vector3(position.x, position.y, position.z);
  const tgt = new THREE.Vector3(target.x, target.y, target.z);
  if (eye.distanceToSquared(tgt) < 1e-10) {
    return [0, 0, 0, 1];
  }

  const up = new THREE.Vector3(0, 1, 0);
  const forward = tgt.clone().sub(eye).normalize();
  if (Math.abs(forward.dot(up)) > 0.999) {
    up.set(0, 0, 1);
  }

  const m = new THREE.Matrix4().lookAt(eye, tgt, up);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);

  if (Math.abs(rollDeg) > 1e-6) {
    const rollQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, -1),
      THREE.MathUtils.degToRad(rollDeg),
    );
    q.multiply(rollQ);
  }

  return [q.x, q.y, q.z, q.w];
}

export function rollFromProjectorQuaternion(
  quaternion: [number, number, number, number],
): number {
  return quaternionToEulerYXZ(quaternion).roll;
}

export function defaultLookAtTarget(): Vec3 {
  return { x: 0, y: 1.5, z: 0 };
}

export function applyLookAtToProjector(projector: ProjectorConfig): ProjectorConfig {
  if (!projector.lookAtEnabled) return projector;
  const target = projector.lookAtTarget ?? defaultLookAtTarget();
  const roll = rollFromProjectorQuaternion(projector.transform.quaternion);
  return {
    ...projector,
    transform: {
      ...projector.transform,
      quaternion: computeProjectorLookAtQuaternion(projector.transform.position, target, roll),
    },
  };
}
