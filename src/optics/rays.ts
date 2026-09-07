import * as THREE from 'three';
import type { ProjectorOptics } from '../types';
import { buildProjectorCamera } from './projectionMatrix';

export function unprojectRasterRay(
  optics: ProjectorOptics,
  u: number,
  v: number,
  worldMatrix: THREE.Matrix4,
) {
  const cam = buildProjectorCamera(optics, worldMatrix);
  const ndc = new THREE.Vector3(u * 2 - 1, 1 - v * 2, 0.5);
  ndc.unproject(cam);
  const origin = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
  const direction = ndc.sub(origin).normalize();
  return { origin, direction };
}
