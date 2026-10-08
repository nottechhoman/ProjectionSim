import type { SurfaceUvProjection, UvWrapMode, Vec2, Vec3 } from '../types';

/**
 * Surface UV projections fitted to an object's bounds (used by Feed mappings) —
 * CPU mirror of `rawSurfaceUv()` in bake.frag.glsl. The region / flip / rotate /
 * repeat / wrap step lives in src/mapping/sample.ts (feedRectUv).
 */

export const PROJECTION_INT: Record<SurfaceUvProjection, number> = {
  meshUv: 0,
  planar: 1,
  cylindrical: 2,
  spherical: 3,
};

export const WRAP_INT: Record<UvWrapMode, number> = { clamp: 0, repeat: 1, mirror: 2 };

/** Planar projection axis pair, picked by dropping the thinnest bounds axis. */
export type PlanarAxes = 0 | 1 | 2; // 0 = XY (faces ±Z), 1 = XZ (faces ±Y), 2 = ZY (faces ±X)

export interface SurfaceUvFrame {
  boundsMin: Vec3;
  boundsSize: Vec3;
  planarAxes: PlanarAxes;
  /** Cylindrical/spherical: reference azimuth and azimuth range relative to it (radians). */
  thetaRef: number;
  thetaMin: number;
  thetaMax: number;
  /** Spherical: elevation range (radians). */
  phiMin: number;
  phiMax: number;
}

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= 2 * Math.PI;
  while (x < -Math.PI) x += 2 * Math.PI;
  return x;
}

/** Fit a projection frame to object-local points (root-local space). */
export function computeSurfaceUvFrame(points: readonly Vec3[]): SurfaceUvFrame {
  if (points.length === 0) {
    return {
      boundsMin: { x: -0.5, y: -0.5, z: -0.5 },
      boundsSize: { x: 1, y: 1, z: 1 },
      planarAxes: 0,
      thetaRef: 0,
      thetaMin: -Math.PI,
      thetaMax: Math.PI,
      phiMin: -Math.PI / 2,
      phiMax: Math.PI / 2,
    };
  }
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of points) {
    min.x = Math.min(min.x, p.x); min.y = Math.min(min.y, p.y); min.z = Math.min(min.z, p.z);
    max.x = Math.max(max.x, p.x); max.y = Math.max(max.y, p.y); max.z = Math.max(max.z, p.z);
  }
  const eps = 1e-6;
  const size = {
    x: Math.max(eps, max.x - min.x),
    y: Math.max(eps, max.y - min.y),
    z: Math.max(eps, max.z - min.z),
  };
  let planarAxes: PlanarAxes = 0;
  if (size.y <= size.x && size.y <= size.z) planarAxes = 1;
  else if (size.x <= size.y && size.x <= size.z) planarAxes = 2;

  // Azimuth about local +Y through the local origin (the axis of a curved screen).
  let sx = 0;
  let sz = 0;
  for (const p of points) {
    const r = Math.hypot(p.x, p.z);
    if (r > eps) { sx += p.x / r; sz += p.z / r; }
  }
  const thetaRef = Math.hypot(sx, sz) > eps ? Math.atan2(sx, sz) : 0;
  let tMin = Infinity;
  let tMax = -Infinity;
  let fMin = Infinity;
  let fMax = -Infinity;
  for (const p of points) {
    const rXZ = Math.hypot(p.x, p.z);
    if (rXZ > eps) {
      const t = wrapPi(Math.atan2(p.x, p.z) - thetaRef);
      tMin = Math.min(tMin, t);
      tMax = Math.max(tMax, t);
    }
    const f = Math.atan2(p.y, Math.max(rXZ, eps));
    fMin = Math.min(fMin, f);
    fMax = Math.max(fMax, f);
  }
  if (!(tMax - tMin > eps)) { tMin = -Math.PI; tMax = Math.PI; }
  if (!(fMax - fMin > eps)) { fMin = -Math.PI / 2; fMax = Math.PI / 2; }
  return {
    boundsMin: min,
    boundsSize: size,
    planarAxes,
    thetaRef,
    thetaMin: tMin,
    thetaMax: tMax,
    phiMin: fMin,
    phiMax: fMax,
  };
}

/** Raw 0–1 surface UV of a root-local point for a projection type. */
export function projectSurfaceUv(
  local: Vec3,
  projection: SurfaceUvProjection,
  frame: SurfaceUvFrame,
  meshUv: Vec2 = { x: 0, y: 0 },
): Vec2 {
  const { boundsMin: mn, boundsSize: sz } = frame;
  switch (projection) {
    case 'meshUv':
      return { ...meshUv };
    case 'planar': {
      if (frame.planarAxes === 1) {
        return { x: (local.x - mn.x) / sz.x, y: (mn.z + sz.z - local.z) / sz.z };
      }
      if (frame.planarAxes === 2) {
        return { x: (mn.z + sz.z - local.z) / sz.z, y: (local.y - mn.y) / sz.y };
      }
      return { x: (local.x - mn.x) / sz.x, y: (local.y - mn.y) / sz.y };
    }
    case 'cylindrical': {
      // u runs left→right for a viewer on the axis looking outward (concave side of a
      // curved screen), matching the legacy shared curved mapping.
      const t = wrapPi(Math.atan2(local.x, local.z) - frame.thetaRef);
      return {
        x: (frame.thetaMax - t) / (frame.thetaMax - frame.thetaMin),
        y: (local.y - mn.y) / sz.y,
      };
    }
    case 'spherical': {
      const t = wrapPi(Math.atan2(local.x, local.z) - frame.thetaRef);
      const f = Math.atan2(local.y, Math.max(Math.hypot(local.x, local.z), 1e-6));
      return {
        x: (frame.thetaMax - t) / (frame.thetaMax - frame.thetaMin),
        y: (f - frame.phiMin) / (frame.phiMax - frame.phiMin),
      };
    }
    default:
      return { ...meshUv };
  }
}

