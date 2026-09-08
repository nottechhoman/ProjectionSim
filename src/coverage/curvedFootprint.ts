import * as THREE from 'three';
import type { FootprintResult, ProjectorOptics, Vec3 } from '../types';
import { unprojectRasterRay } from '../optics/rays';

const CORNER_UV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

export interface CurvedScreenSurface {
  worldMatrix: THREE.Matrix4;
  radius: number;
  arcAngleDeg: number;
  height: number;
}

function intersectRayCylinderSegment(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  surface: CurvedScreenSurface,
): Vec3 | null {
  const inv = surface.worldMatrix.clone().invert();
  const localOrigin = origin.clone().applyMatrix4(inv);
  const localDir = direction.clone().transformDirection(inv).normalize();

  const r = surface.radius;
  const halfH = surface.height / 2;
  const arcRad = THREE.MathUtils.degToRad(surface.arcAngleDeg);
  const thetaMin = -arcRad / 2;
  const thetaMax = arcRad / 2;

  const ox = localOrigin.x;
  const oy = localOrigin.y;
  const oz = localOrigin.z;
  const dx = localDir.x;
  const dy = localDir.y;
  const dz = localDir.z;

  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - r * r;

  let bestT: number | null = null;
  let bestHit: THREE.Vector3 | undefined;

  const tryHit = (t: number) => {
    if (t <= 1e-6) return;
    const x = ox + t * dx;
    const y = oy + t * dy;
    const z = oz + t * dz;
    if (y < -halfH - 1e-5 || y > halfH + 1e-5) return;
    const theta = Math.atan2(z, x);
    if (theta < thetaMin - 1e-5 || theta > thetaMax + 1e-5) return;
    if (bestT === null || t < bestT) {
      bestT = t;
      bestHit = new THREE.Vector3(x, y, z);
    }
  };

  if (a > 1e-12) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      tryHit((-b - sqrtDisc) / (2 * a));
      tryHit((-b + sqrtDisc) / (2 * a));
    }
  }

  if (!bestHit) return null;
  bestHit.applyMatrix4(surface.worldMatrix);
  return { x: bestHit.x, y: bestHit.y, z: bestHit.z };
}

function buildCurvedOutline(cornersLocal: THREE.Vector3[], surface: CurvedScreenSurface): Vec3[] {
  if (cornersLocal.length !== 4) return cornersLocal.map((p) => ({ x: p.x, y: p.y, z: p.z }));

  const inv = surface.worldMatrix.clone().invert();
  const local = cornersLocal.map((c) => c.clone().applyMatrix4(inv));
  const r = surface.radius;

  const thetaOf = (p: THREE.Vector3) => Math.atan2(p.z, p.x);
  const interpTheta = (a: THREE.Vector3, b: THREE.Vector3, t: number) => {
    const ta = thetaOf(a);
    let tb = thetaOf(b);
    if (tb - ta > Math.PI) tb -= 2 * Math.PI;
    if (ta - tb > Math.PI) tb += 2 * Math.PI;
    const theta = ta + (tb - ta) * t;
    return theta;
  };

  const outlineLocal: THREE.Vector3[] = [];
  const segments = 8;

  // Bottom edge: corner 0 -> 1
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const theta = interpTheta(local[0], local[1], t);
    outlineLocal.push(new THREE.Vector3(r * Math.cos(theta), local[0].y, r * Math.sin(theta)));
  }
  // Right edge: corner 1 -> 2
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const theta = thetaOf(local[1]);
    const y = local[1].y + (local[2].y - local[1].y) * t;
    outlineLocal.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
  }
  // Top edge: corner 2 -> 3
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const theta = interpTheta(local[2], local[3], t);
    outlineLocal.push(new THREE.Vector3(r * Math.cos(theta), local[2].y, r * Math.sin(theta)));
  }
  // Left edge: corner 3 -> 0
  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const theta = thetaOf(local[3]);
    const y = local[3].y + (local[0].y - local[3].y) * t;
    outlineLocal.push(new THREE.Vector3(r * Math.cos(theta), y, r * Math.sin(theta)));
  }

  return outlineLocal.map((p) => {
    p.applyMatrix4(surface.worldMatrix);
    return { x: p.x, y: p.y, z: p.z };
  });
}

function approximateCurvedArea(corners: Vec3[], surface: CurvedScreenSurface): number {
  if (corners.length < 4) return 0;
  const inv = surface.worldMatrix.clone().invert();
  const local = corners.map((c) => new THREE.Vector3(c.x, c.y, c.z).applyMatrix4(inv));
  const thetas = local.map((p) => Math.atan2(p.z, p.x));
  const ys = local.map((p) => p.y);
  const arcSpan = Math.abs(Math.max(...thetas) - Math.min(...thetas));
  const heightSpan = Math.max(...ys) - Math.min(...ys);
  return surface.radius * arcSpan * heightSpan;
}

export function computeCurvedFootprint(
  optics: ProjectorOptics,
  projectorMatrix: THREE.Matrix4,
  surface: CurvedScreenSurface,
): FootprintResult {
  const corners = CORNER_UV.map(([u, v]) => {
    const ray = unprojectRasterRay(optics, u, v, projectorMatrix);
    return intersectRayCylinderSegment(ray.origin, ray.direction, surface);
  }).filter((c): c is Vec3 => c !== null);

  const centerRay = unprojectRasterRay(optics, 0.5, 0.5, projectorMatrix);
  const centerHit = intersectRayCylinderSegment(centerRay.origin, centerRay.direction, surface);

  const unclippedArea = approximateCurvedArea(corners, surface);
  const clippedArea = unclippedArea;

  const axialDistance = centerHit
    ? centerRay.origin.distanceTo(new THREE.Vector3(centerHit.x, centerHit.y, centerHit.z))
    : null;

  return {
    corners,
    beamOutline:
      corners.length === 4
        ? buildCurvedOutline(
            corners.map((c) => new THREE.Vector3(c.x, c.y, c.z)),
            surface,
          )
        : undefined,
    unclippedArea,
    clippedArea,
    centerHit,
    axialDistance,
  };
}
