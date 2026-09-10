import * as THREE from 'three';
import type { ProjectorConfig } from '../types';
import { applyLookAtToProjector } from './lookAt';

/** World matrix for projector optics (applies look-at when enabled). */
export function getProjectorWorldMatrix(projector: ProjectorConfig): THREE.Matrix4 {
  const resolved = applyLookAtToProjector(projector);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(
    resolved.transform.position.x,
    resolved.transform.position.y,
    resolved.transform.position.z,
  );
  const quaternion = new THREE.Quaternion(...resolved.transform.quaternion);
  matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return matrix;
}
