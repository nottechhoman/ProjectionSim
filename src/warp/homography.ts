import type { ProjectorWarp, Vec2 } from '../types';
import { IDENTITY_WARP_CORNERS } from '../types';

/** Row-major 3×3 matrix [a b c; d e f; g h i]. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export const IDENTITY_MAT3: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/**
 * Homography mapping the unit square (0,0)(1,0)(1,1)(0,1) onto the quad p0..p3
 * (Heckbert, "Fundamentals of Texture Mapping", 1989).
 */
export function squareToQuad(corners: readonly Vec2[]): Mat3 {
  const [p0, p1, p2, p3] = corners;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  if (Math.abs(dx3) < 1e-12 && Math.abs(dy3) < 1e-12) {
    return [p1.x - p0.x, p3.x - p0.x, p0.x, p1.y - p0.y, p3.y - p0.y, p0.y, 0, 0, 1];
  }
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < 1e-12) return [...IDENTITY_MAT3];
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ];
}

export function invertMat3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-14) return null;
  const inv = 1 / det;
  return [
    A * inv,
    -(b * i - c * h) * inv,
    (b * f - c * e) * inv,
    B * inv,
    (a * i - c * g) * inv,
    -(a * f - c * d) * inv,
    C * inv,
    -(a * h - b * g) * inv,
    (a * e - b * d) * inv,
  ];
}

export function applyMat3(m: Mat3, p: Vec2): Vec2 | null {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  if (Math.abs(w) < 1e-12) return null;
  return {
    x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w,
  };
}

/** True when the quad is convex and non-degenerate (a physically valid corner pin). */
export function isValidWarpQuad(corners: readonly Vec2[]): boolean {
  if (corners.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const c = corners[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

export function isIdentityWarp(warp: ProjectorWarp | undefined): boolean {
  if (!warp || !warp.enabled) return true;
  return warp.corners.every(
    (c, i) =>
      Math.abs(c.x - IDENTITY_WARP_CORNERS[i].x) < 1e-9 &&
      Math.abs(c.y - IDENTITY_WARP_CORNERS[i].y) < 1e-9,
  );
}

/**
 * Inverse warp: physical raster UV → content (image) UV. Identity when the warp is
 * disabled or invalid. Used by the shader and the CPU blend analysis.
 */
export function warpInverseMatrix(warp: ProjectorWarp | undefined): Mat3 {
  if (!warp || !warp.enabled || !isValidWarpQuad(warp.corners)) return [...IDENTITY_MAT3];
  const inv = invertMat3(squareToQuad(warp.corners));
  return inv ?? [...IDENTITY_MAT3];
}

export function clampCorner(p: Vec2, limit = 0.5): Vec2 {
  return {
    x: Math.min(1 + limit, Math.max(-limit, p.x)),
    y: Math.min(1 + limit, Math.max(-limit, p.y)),
  };
}

/**
 * Build a corner pin so the image lands on four target points already expressed in
 * the projector's physical raster UV. Points outside the raster are clamped to it,
 * because a projector cannot emit light outside its own raster.
 */
export function fitWarpToRasterPoints(points: readonly (Vec2 | null)[]): ProjectorWarp | null {
  if (points.length !== 4 || points.some((p) => p === null)) return null;
  const corners = points.map((p) => ({
    x: Math.min(1, Math.max(0, p!.x)),
    y: Math.min(1, Math.max(0, p!.y)),
  })) as [Vec2, Vec2, Vec2, Vec2];
  if (!isValidWarpQuad(corners)) return null;
  return { enabled: true, corners };
}
