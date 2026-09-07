import * as THREE from 'three';
import type { ProjectorOptics } from '../types';

export function buildProjectorCamera(
  optics: ProjectorOptics,
  worldMatrix: THREE.Matrix4,
): THREE.PerspectiveCamera {
  const fovY = (2 * Math.atan(1 / (2 * optics.throwRatio * optics.aspectRatio)) * 180) / Math.PI;
  const cam = new THREE.PerspectiveCamera(fovY, optics.aspectRatio, optics.nearLimit, optics.farLimit);
  cam.matrixAutoUpdate = false;
  cam.matrixWorld.copy(worldMatrix);
  cam.matrix.copy(worldMatrix);
  cam.matrix.decompose(cam.position, cam.quaternion, cam.scale);
  cam.updateMatrixWorld(true);
  cam.setViewOffset(
    optics.resolution.width,
    optics.resolution.height,
    -optics.lensShiftH * optics.resolution.width,
    -optics.lensShiftV * optics.resolution.height,
    optics.resolution.width,
    optics.resolution.height,
  );
  cam.updateProjectionMatrix();
  return cam;
}

export function getProjectorViewProjectionMatrix(
  optics: ProjectorOptics,
  worldMatrix: THREE.Matrix4,
): THREE.Matrix4 {
  const cam = buildProjectorCamera(optics, worldMatrix);
  return new THREE.Matrix4().multiplyMatrices(
    cam.projectionMatrix,
    cam.matrixWorldInverse,
  );
}
