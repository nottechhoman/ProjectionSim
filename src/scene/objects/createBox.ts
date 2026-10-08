import * as THREE from 'three';
import type { SceneObject } from '../../types';

/**
 * Lay the six box faces out in a 3×2 UV atlas (instead of each face covering the
 * whole 0–1 square) so a box can carry one screen texture without faces
 * overwriting each other. Face order follows BoxGeometry: +X, −X, +Y, −Y, +Z, −Z.
 */
export function applyBoxUvAtlas(geo: THREE.BufferGeometry, pad = 0.01): void {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const groups = geo.groups;
  const index = geo.getIndex();
  groups.forEach((group, face) => {
    const col = face % 3;
    const row = Math.floor(face / 3);
    const seen = new Set<number>();
    for (let k = group.start; k < group.start + group.count; k++) {
      const i = index ? index.getX(k) : k;
      if (seen.has(i)) continue;
      seen.add(i);
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (col + pad + u * (1 - 2 * pad)) / 3, (row + pad + v * (1 - 2 * pad)) / 2);
    }
  });
  uv.needsUpdate = true;
}

export function createBox(obj: SceneObject): THREE.Mesh {
  const depth = obj.dimensions.depth ?? 1;
  const geo = new THREE.BoxGeometry(obj.dimensions.width, obj.dimensions.height, depth);
  applyBoxUvAtlas(geo);
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
