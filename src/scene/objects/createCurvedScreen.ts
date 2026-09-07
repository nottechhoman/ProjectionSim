import * as THREE from 'three';
import type { SceneObject } from '../../types';
import { createCurvedScreenGeometry } from '../ModelLoader';

export function createCurvedScreen(obj: SceneObject): THREE.Mesh {
  const curved = obj.curved ?? { radius: 4, arcAngleDeg: 90, height: 3.375 };
  const geo = createCurvedScreenGeometry(curved);
  const mat = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });
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
