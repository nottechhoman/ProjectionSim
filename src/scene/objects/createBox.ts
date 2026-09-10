import * as THREE from 'three';
import type { SceneObject } from '../../types';

export function createBox(obj: SceneObject): THREE.Mesh {
  const depth = obj.dimensions.depth ?? 1;
  const geo = new THREE.BoxGeometry(obj.dimensions.width, obj.dimensions.height, depth);
  const mat = new THREE.MeshStandardMaterial({ color: 0x666666 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z);
  mesh.quaternion.set(...obj.transform.quaternion);
  mesh.userData = {
    id: obj.id,
    receivesProjection: obj.receivesProjection,
    blocksProjection: obj.blocksProjection,
  };
  return mesh;
}
