import type { SurfaceUvMapping, SurfaceUvProjection, UvRegion, UvWrapMode, Vec2, Vec3 } from '../types';
import { DEFAULT_SURFACE_UV_MAPPING } from '../types';

/**
 * v2 per-surface UV mapping — CPU mirror of `surfaceContentUv()` in
 * multiProjection.frag.glsl.
 *
 * Pipeline for a surface point:
 *   surface UV (mesh UV or planar / cylindrical / spherical projection, fitted to
 *   the object's bounds) → flip → rotate about centre → repeat → wrap → region.
 * The result is a content UV (0–1, bottom-left origin) into the shared content
 * (content canvas, or the shared source projector's media / pattern).
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

function wrapScalar(x: number, mode: UvWrapMode): number | null {
  if (mode === 'repeat') return x - Math.floor(x);
  if (mode === 'mirror') {
    const m = x - 2 * Math.floor(x / 2);
    return m > 1 ? 2 - m : m;
  }
  return x < -1e-9 || x > 1 + 1e-9 ? null : Math.min(1, Math.max(0, x));
}

/** Surface UV → content UV (bottom-left origin); null when clamped out. */
export function surfaceToContentUv(s: Vec2, mapping: SurfaceUvMapping): Vec2 | null {
  let u = mapping.flipU ? 1 - s.x : s.x;
  let v = mapping.flipV ? 1 - s.y : s.y;
  const a = (mapping.rotationDeg * Math.PI) / 180;
  if (a !== 0) {
    const cx = u - 0.5;
    const cy = v - 0.5;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    u = c * cx - sn * cy + 0.5;
    v = sn * cx + c * cy + 0.5;
  }
  u *= mapping.repeatU;
  v *= mapping.repeatV;
  const wu = wrapScalar(u, mapping.wrap);
  const wv = wrapScalar(v, mapping.wrap);
  if (wu === null || wv === null) return null;
  const r = mapping.region;
  return { x: r.x + wu * r.width, y: 1 - r.y - r.height + wv * r.height };
}

export function clampRegion(region: Partial<UvRegion> | undefined): UvRegion {
  const d = DEFAULT_SURFACE_UV_MAPPING.region;
  const n = (v: unknown, fb: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
  const width = Math.min(4, Math.max(0.01, n(region?.width, d.width)));
  const height = Math.min(4, Math.max(0.01, n(region?.height, d.height)));
  return {
    x: Math.min(2, Math.max(-2, n(region?.x, d.x))),
    y: Math.min(2, Math.max(-2, n(region?.y, d.y))),
    width,
    height,
  };
}

export function normalizeSurfaceUvMapping(raw: Partial<SurfaceUvMapping> | undefined | null): SurfaceUvMapping {
  const d = DEFAULT_SURFACE_UV_MAPPING;
  if (!raw) return structuredClone(d);
  const proj: SurfaceUvProjection =
    raw.projection === 'planar' || raw.projection === 'cylindrical' || raw.projection === 'spherical'
      ? raw.projection
      : 'meshUv';
  const wrap: UvWrapMode = raw.wrap === 'repeat' || raw.wrap === 'mirror' ? raw.wrap : 'clamp';
  const rep = (v: unknown) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(32, Math.max(0.05, v)) : 1;
  return {
    enabled: raw.enabled === true,
    projection: proj,
    region: clampRegion(raw.region),
    rotationDeg: typeof raw.rotationDeg === 'number' && Number.isFinite(raw.rotationDeg) ? raw.rotationDeg : 0,
    flipU: raw.flipU === true,
    flipV: raw.flipV === true,
    repeatU: rep(raw.repeatU),
    repeatV: rep(raw.repeatV),
    wrap,
  };
}

/** Default projection per object type (mesh UV works for all built-in primitives). */
export function defaultProjectionForType(type: string): SurfaceUvProjection {
  if (type === 'curvedScreen') return 'cylindrical';
  if (type === 'box') return 'planar';
  return 'meshUv';
}
