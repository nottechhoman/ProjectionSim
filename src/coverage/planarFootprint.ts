import * as THREE from 'three';
import type { ProjectorOptics, FootprintResult } from '../types';
import { unprojectRasterRay } from '../optics/rays';
import { intersectRayPlane } from './planeIntersection';

const CORNER_UV = [
  [0, 0], [1, 0], [1, 1], [0, 1],
] as const;

export function computePlanarFootprint(
  optics: ProjectorOptics,
  worldMatrix: THREE.Matrix4,
  screen: {
    center: THREE.Vector3;
    normal: THREE.Vector3;
    width: number;
    height: number;
  },
): FootprintResult {
  const corners = CORNER_UV.map(([u, v]) => {
    const ray = unprojectRasterRay(optics, u, v, worldMatrix);
    return intersectRayPlane(ray.origin, ray.direction, screen.center, screen.normal);
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  const centerRay = unprojectRasterRay(optics, 0.5, 0.5, worldMatrix);
  const centerHit = intersectRayPlane(
    centerRay.origin, centerRay.direction, screen.center, screen.normal,
  );

  const unclippedArea = polygonArea3D(corners);
  const clippedArea = unclippedArea; // M1: large screen — clip stub returns same

  const axialDistance = centerHit
    ? centerRay.origin.distanceTo(new THREE.Vector3(centerHit.x, centerHit.y, centerHit.z))
    : null;

  return {
    corners,
    unclippedArea,
    clippedArea,
    centerHit,
    axialDistance,
  };
}

function polygonArea3D(pts: { x: number; y: number; z: number }[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
