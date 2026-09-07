import * as THREE from 'three';
import type { ProjectorOptics } from '../../types';
import { unprojectRasterRay } from '../../optics/rays';

const CORNER_UV: [number, number][] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

export class FrustumHelper extends THREE.LineSegments {
  constructor() {
    super(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4fc3f7 }));
    this.frustumCulled = false;
  }

  updateFromProjector(
    optics: ProjectorOptics,
    worldMatrix: THREE.Matrix4,
    rayLength = 10,
  ): void {
    const points: THREE.Vector3[] = [];

    for (const [u, v] of CORNER_UV) {
      const { origin, direction } = unprojectRasterRay(optics, u, v, worldMatrix);
      points.push(origin.clone(), origin.clone().add(direction.multiplyScalar(rayLength)));
    }

    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry().setFromPoints(points);
  }

  dispose(): void {
    this.geometry.dispose();
    (this.material as THREE.Material).dispose();
  }
}
