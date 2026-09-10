import * as THREE from 'three';
import { effectiveBlocksProjection } from '../blocksProjectionPolicy';
import type { SceneObject } from '../../types';

export function createScreen(obj: SceneObject): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(obj.dimensions.width, obj.dimensions.height);
  const mat = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z);
  mesh.quaternion.set(...obj.transform.quaternion);
  mesh.userData = {
    id: obj.id,
    receivesProjection: obj.receivesProjection,
    blocksProjection: effectiveBlocksProjection(obj),
  };
  return mesh;
}
