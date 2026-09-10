import * as THREE from 'three';
import { createLedWallMaterial } from '../../projection/LedWallMaterial';
import type { SceneObject } from '../../types';

export function createLedWall(obj: SceneObject): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(obj.dimensions.width, obj.dimensions.height);
  const mat = createLedWallMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z);
  mesh.quaternion.set(...obj.transform.quaternion);
  mesh.userData = {
    id: obj.id,
    isLedWall: true,
    receivesProjection: false,
    blocksProjection: obj.blocksProjection,
  };
  return mesh;
}
