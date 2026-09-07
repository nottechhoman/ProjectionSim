import * as THREE from 'three';
import type { SceneObject } from '../../types';

export function createFloor(obj: SceneObject): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(obj.dimensions.width, obj.dimensions.height);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide });
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
