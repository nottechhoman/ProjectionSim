import * as THREE from 'three';
import { effectiveBlocksProjection } from '../scene/blocksProjectionPolicy';
import type { SceneObject } from '../types';

/** Scale-aware endpoint tolerance for self-occlusion at the sample point (meters). */
export const OCCLUSION_ENDPOINT_ABS_TOLERANCE = 1e-3;

/** Relative endpoint tolerance as a fraction of ray length. */
export const OCCLUSION_ENDPOINT_REL_TOLERANCE = 1e-4;

export interface CurvedSurfaceParams {
  worldMatrix: THREE.Matrix4;
  radius: number;
  arcAngleDeg: number;
  height: number;
}

export interface BlockerDescriptor {
  id: string;
  kind: 'box' | 'plane' | 'curved';
  worldMatrix: THREE.Matrix4;
  halfExtents?: THREE.Vector3;
  plane?: {
    point: THREE.Vector3;
    normal: THREE.Vector3;
    /** Optional in-plane half extents (right/up axes from world matrix). */
    bounds?: { halfWidth: number; halfHeight: number };
  };
  curved?: CurvedSurfaceParams;
}

export function buildWorldMatrixFromTransform(transform: {
  position: { x: number; y: number; z: number };
  quaternion: [number, number, number, number];
}): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  matrix.compose(
    new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z),
    new THREE.Quaternion(...transform.quaternion),
    new THREE.Vector3(1, 1, 1),
  );
  return matrix;
}

export function listBlockerDescriptors(sceneObjects: SceneObject[]): BlockerDescriptor[] {
  const blockers: BlockerDescriptor[] = [];
  for (const obj of sceneObjects) {
    if (!effectiveBlocksProjection(obj)) continue;
    const worldMatrix = buildWorldMatrixFromTransform(obj.transform);

    if (obj.type === 'box') {
      const depth = obj.dimensions.depth ?? 1;
      blockers.push({
        id: obj.id,
        kind: 'box',
        worldMatrix,
        halfExtents: new THREE.Vector3(
          obj.dimensions.width / 2,
          obj.dimensions.height / 2,
          depth / 2,
        ),
      });
      continue;
    }

    if (obj.type === 'floor') {
      const normal = new THREE.Vector3(0, 1, 0).transformDirection(worldMatrix).normalize();
      const point = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
      blockers.push({ id: obj.id, kind: 'plane', worldMatrix, plane: { point, normal } });
      continue;
    }

    if (obj.type === 'screen' || obj.type === 'ledWall') {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(worldMatrix).normalize();
      const point = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
      blockers.push({
        id: obj.id,
        kind: 'plane',
        worldMatrix,
        plane: {
          point,
          normal,
          bounds: {
            halfWidth: obj.dimensions.width / 2,
            halfHeight: obj.dimensions.height / 2,
          },
        },
      });
      continue;
    }

    if (obj.type === 'curvedScreen' && obj.curved) {
      blockers.push({
        id: obj.id,
        kind: 'curved',
        worldMatrix,
        curved: {
          worldMatrix,
          radius: obj.curved.radius,
          arcAngleDeg: obj.curved.arcAngleDeg,
          height: obj.curved.height,
        },
      });
    }
  }
  return blockers;
}

export function intersectRayCylinderSegment(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  surface: CurvedSurfaceParams,
): number | null {
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

  const tryHit = (t: number) => {
    if (t <= 1e-6) return;
    const x = ox + t * dx;
    const y = oy + t * dy;
    const z = oz + t * dz;
    if (y < -halfH - 1e-5 || y > halfH + 1e-5) return;
    const theta = Math.atan2(z, x);
    if (theta < thetaMin - 1e-5 || theta > thetaMax + 1e-5) return;
    if (bestT === null || t < bestT) bestT = t;
  };

  if (a > 1e-12) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      tryHit((-b - sqrtDisc) / (2 * a));
      tryHit((-b + sqrtDisc) / (2 * a));
    }
  }

  return bestT;
}

function intersectRayPlane(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  worldMatrix?: THREE.Matrix4,
  bounds?: { halfWidth: number; halfHeight: number },
): number | null {
  const denom = normal.dot(direction);
  if (Math.abs(denom) < 1e-12) return null;
  const t = point.clone().sub(origin).dot(normal) / denom;
  if (t <= 1e-6) return null;

  if (bounds && worldMatrix) {
    const hit = origin.clone().add(direction.clone().multiplyScalar(t));
    const right = new THREE.Vector3(1, 0, 0).transformDirection(worldMatrix);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(worldMatrix);
    const local = hit.clone().sub(point);
    const lx = local.dot(right);
    const ly = local.dot(up);
    if (Math.abs(lx) > bounds.halfWidth + 1e-5 || Math.abs(ly) > bounds.halfHeight + 1e-5) {
      return null;
    }
  }

  return t;
}

function intersectRayBox(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  worldMatrix: THREE.Matrix4,
  halfExtents: THREE.Vector3,
): number | null {
  const inv = worldMatrix.clone().invert();
  const localOrigin = origin.clone().applyMatrix4(inv);
  const localDir = direction.clone().transformDirection(inv).normalize();
  const box = new THREE.Box3(halfExtents.clone().multiplyScalar(-1), halfExtents.clone());
  const hit = new THREE.Ray(localOrigin, localDir).intersectBox(box, new THREE.Vector3());
  if (!hit) return null;
  return localOrigin.distanceTo(hit);
}

export function intersectBlocker(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  blocker: BlockerDescriptor,
): number | null {
  if (blocker.kind === 'box' && blocker.halfExtents) {
    return intersectRayBox(origin, direction, blocker.worldMatrix, blocker.halfExtents);
  }
  if (blocker.kind === 'plane' && blocker.plane) {
    return intersectRayPlane(
      origin,
      direction,
      blocker.plane.point,
      blocker.plane.normal,
      blocker.worldMatrix,
      blocker.plane.bounds,
    );
  }
  if (blocker.kind === 'curved' && blocker.curved) {
    return intersectRayCylinderSegment(origin, direction, blocker.curved);
  }
  return null;
}

export function isOccludedAlongSegment(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  blockers: BlockerDescriptor[],
  receiverId: string,
): boolean {
  const segment = target.clone().sub(origin);
  const maxDist = segment.length();
  if (maxDist < 1e-9) return false;

  const direction = segment.multiplyScalar(1 / maxDist);
  const endpointTol = Math.max(
    OCCLUSION_ENDPOINT_ABS_TOLERANCE,
    maxDist * OCCLUSION_ENDPOINT_REL_TOLERANCE,
  );

  for (const blocker of blockers) {
    const t = intersectBlocker(origin, direction, blocker);
    if (t == null || t <= 1e-6) continue;
    if (blocker.id === receiverId && t >= maxDist - endpointTol) continue;
    if (t < maxDist - endpointTol) return true;
  }
  return false;
}
