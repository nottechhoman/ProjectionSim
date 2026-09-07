import * as THREE from 'three';
import type { Vec3 } from '../../types';

export class FrustumHelper extends THREE.LineSegments {
  private footprintLoop: THREE.LineLoop | null = null;

  constructor() {
    super(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4fc3f7 }));
    this.frustumCulled = false;
  }

  /** Short decorative frustum when sized beam is off. */
  updateShortFrustum(rayLength: number, cornerRays: {
    origin: THREE.Vector3;
    direction: THREE.Vector3;
  }[]): void {
    const points: THREE.Vector3[] = [];
    for (const ray of cornerRays) {
      points.push(
        ray.origin.clone(),
        ray.origin.clone().add(ray.direction.clone().multiplyScalar(rayLength)),
      );
    }
    this.setLineGeometry(points);
    this.clearFootprintLoop();
  }

  /** Sized beam: edge lines from lens to footprint corners plus image rectangle on the screen. */
  updateSizedBeam(origin: THREE.Vector3, footprintCorners: Vec3[]): void {
    const corners = footprintCorners.map((c) => new THREE.Vector3(c.x, c.y, c.z));
    const points: THREE.Vector3[] = [];

    for (const corner of corners) {
      points.push(origin.clone(), corner);
    }

    this.setLineGeometry(points);

    if (this.footprintLoop) {
      this.remove(this.footprintLoop);
      this.footprintLoop.geometry.dispose();
      (this.footprintLoop.material as THREE.Material).dispose();
      this.footprintLoop = null;
    }

    if (corners.length === 4) {
      const loopGeo = new THREE.BufferGeometry().setFromPoints(corners);
      const loopMat = new THREE.LineBasicMaterial({
        color: 0xffeb3b,
        transparent: true,
        opacity: 0.95,
      });
      this.footprintLoop = new THREE.LineLoop(loopGeo, loopMat);
      this.add(this.footprintLoop);
    }
  }

  private setLineGeometry(points: THREE.Vector3[]): void {
    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry().setFromPoints(points);
    (this.material as THREE.LineBasicMaterial).color.set(0x4fc3f7);
  }

  private clearFootprintLoop(): void {
    if (!this.footprintLoop) return;
    this.remove(this.footprintLoop);
    this.footprintLoop.geometry.dispose();
    (this.footprintLoop.material as THREE.Material).dispose();
    this.footprintLoop = null;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.material as THREE.Material).dispose();
    this.clearFootprintLoop();
  }
}
