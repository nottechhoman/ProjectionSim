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
  private footprintLoop: THREE.LineLoop | null = null;

  constructor() {
    super(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4fc3f7 }));
    this.frustumCulled = false;
  }

  updateFromProjector(
    optics: ProjectorOptics,
    worldMatrix: THREE.Matrix4,
    rayLength = 10,
    showSizedFootprint = false,
  ): void {
    const points: THREE.Vector3[] = [];
    const corners: THREE.Vector3[] = [];

    for (const [u, v] of CORNER_UV) {
      const { origin, direction } = unprojectRasterRay(optics, u, v, worldMatrix);
      const end = origin.clone().add(direction.clone().multiplyScalar(rayLength));
      points.push(origin.clone(), end);
      corners.push(end);
    }

    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry().setFromPoints(points);

    if (this.footprintLoop) {
      this.remove(this.footprintLoop);
      this.footprintLoop.geometry.dispose();
      (this.footprintLoop.material as THREE.Material).dispose();
      this.footprintLoop = null;
    }

    if (showSizedFootprint && corners.length === 4) {
      const loopGeo = new THREE.BufferGeometry().setFromPoints([
        corners[0],
        corners[1],
        corners[2],
        corners[3],
      ]);
      const loopMat = new THREE.LineBasicMaterial({
        color: (this.material as THREE.LineBasicMaterial).color,
        transparent: true,
        opacity: 0.85,
      });
      this.footprintLoop = new THREE.LineLoop(loopGeo, loopMat);
      this.add(this.footprintLoop);
    }
  }

  dispose(): void {
    this.geometry.dispose();
    (this.material as THREE.Material).dispose();
    if (this.footprintLoop) {
      this.footprintLoop.geometry.dispose();
      (this.footprintLoop.material as THREE.Material).dispose();
    }
  }
}
