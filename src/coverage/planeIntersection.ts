import * as THREE from 'three';
import type { Vec3 } from '../types';

export function intersectRayPlane(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
): Vec3 | null {
  const denom = planeNormal.dot(direction);
  if (Math.abs(denom) < 1e-9) return null;
  const t = planePoint.clone().sub(origin).dot(planeNormal) / denom;
  if (t <= 0) return null;
  const p = origin.clone().add(direction.clone().multiplyScalar(t));
  return { x: p.x, y: p.y, z: p.z };
}
