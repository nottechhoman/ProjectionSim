import * as THREE from 'three';
import type { Vec3 } from '../../types';

export class FrustumHelper extends THREE.LineSegments {
  private footprintLoop: THREE.LineLoop | null = null;

  constructor() {
    super(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x4fc3f7 }));
    this.frustumCulled = false;
  }

  /**
   * @param footprintCorners When set (4 points), draws the image outline on the receiving surface.
   * @param showBeamRays When true, draws lines from the lens to footprint corners.
   */
  updateVisuals(
    cornerRays: { origin: THREE.Vector3; direction: THREE.Vector3 }[],
    projectorColor: string,
    options: {
      footprintCorners?: Vec3[] | null;
      footprintOutline?: Vec3[];
      showBeamRays?: boolean;
      shortFrustumLength?: number;
    } = {},
  ): void {
    const { footprintCorners, footprintOutline, showBeamRays = false, shortFrustumLength = 2 } = options;
    const color = new THREE.Color(projectorColor);
    const hasFootprint = footprintCorners && footprintCorners.length === 4;

    const points: THREE.Vector3[] = [];

    if (showBeamRays && hasFootprint) {
      const origin = cornerRays[0]?.origin ?? new THREE.Vector3();
      for (const corner of footprintCorners!) {
        points.push(origin.clone(), new THREE.Vector3(corner.x, corner.y, corner.z));
      }
    } else if (showBeamRays) {
      for (const ray of cornerRays) {
        points.push(
          ray.origin.clone(),
          ray.origin.clone().add(ray.direction.clone().multiplyScalar(shortFrustumLength)),
        );
      }
    }

    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry().setFromPoints(points);
    (this.material as THREE.LineBasicMaterial).color.copy(color);

    if (this.footprintLoop) {
      this.remove(this.footprintLoop);
      this.footprintLoop.geometry.dispose();
      (this.footprintLoop.material as THREE.Material).dispose();
      this.footprintLoop = null;
    }

    if (showBeamRays && hasFootprint) {
      const outlinePoints =
        footprintOutline && footprintOutline.length >= 3
          ? footprintOutline.map((c) => new THREE.Vector3(c.x, c.y, c.z))
          : footprintCorners!.map((c) => new THREE.Vector3(c.x, c.y, c.z));
      const loopGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
      const loopMat = new THREE.LineBasicMaterial({
        color: 0xffeb3b,
        transparent: true,
        opacity: 0.95,
        depthTest: true,
      });
      this.footprintLoop = new THREE.LineLoop(loopGeo, loopMat);
      this.footprintLoop.renderOrder = 1;
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
