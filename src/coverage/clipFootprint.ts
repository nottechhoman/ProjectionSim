import type { Vec3 } from '../types';

interface LocalPoint {
  x: number;
  y: number;
}

interface PlaneFrame {
  center: { x: number; y: number; z: number };
  uAxis: { x: number; y: number; z: number };
  vAxis: { x: number; y: number; z: number };
  halfWidth: number;
  halfHeight: number;
}

function buildPlaneFrame(
  center: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  width: number,
  height: number,
): PlaneFrame {
  const nx = normal.x;
  const ny = normal.y;
  const nz = normal.z;
  const refX = Math.abs(ny) < 0.9 ? 0 : 1;
  const refY = Math.abs(ny) < 0.9 ? 1 : 0;
  const refZ = 0;

  let ux = refY * nz - refZ * ny;
  let uy = refZ * nx - refX * nz;
  let uz = refX * ny - refY * nx;
  const uLen = Math.hypot(ux, uy, uz) || 1;
  ux /= uLen;
  uy /= uLen;
  uz /= uLen;

  let vx = ny * uz - nz * uy;
  let vy = nz * ux - nx * uz;
  let vz = nx * uy - ny * ux;
  const vLen = Math.hypot(vx, vy, vz) || 1;
  vx /= vLen;
  vy /= vLen;
  vz /= vLen;

  return {
    center,
    uAxis: { x: ux, y: uy, z: uz },
    vAxis: { x: vx, y: vy, z: vz },
    halfWidth: width / 2,
    halfHeight: height / 2,
  };
}

function toLocal(frame: PlaneFrame, point: Vec3): LocalPoint {
  const dx = point.x - frame.center.x;
  const dy = point.y - frame.center.y;
  const dz = point.z - frame.center.z;
  return {
    x: dx * frame.uAxis.x + dy * frame.uAxis.y + dz * frame.uAxis.z,
    y: dx * frame.vAxis.x + dy * frame.vAxis.y + dz * frame.vAxis.z,
  };
}

function polygonArea2D(points: LocalPoint[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function clipPolygonAxis(points: LocalPoint[], axis: 'x' | 'y', edge: number, keepGreater: boolean): LocalPoint[] {
  if (points.length === 0) return [];

  const inside = (value: number) => (keepGreater ? value >= edge : value <= edge);
  const intersect = (a: LocalPoint, b: LocalPoint): LocalPoint => {
    const av = axis === 'x' ? a.x : a.y;
    const bv = axis === 'x' ? b.x : b.y;
    const t = (edge - av) / (bv - av);
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  };

  const output: LocalPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const previous = points[(i + points.length - 1) % points.length];
    const currInside = inside(axis === 'x' ? current.x : current.y);
    const prevInside = inside(axis === 'x' ? previous.x : previous.y);

    if (currInside) {
      if (!prevInside) output.push(intersect(previous, current));
      output.push(current);
    } else if (prevInside) {
      output.push(intersect(previous, current));
    }
  }
  return output;
}

export function clipFootprintAreaToScreen(
  corners: Vec3[],
  screen: {
    center: Vec3;
    normal: Vec3;
    width: number;
    height: number;
  },
): number {
  if (corners.length < 3) return 0;

  const frame = buildPlaneFrame(screen.center, screen.normal, screen.width, screen.height);
  let polygon = corners.map((corner) => toLocal(frame, corner));
  polygon = clipPolygonAxis(polygon, 'x', -frame.halfWidth, true);
  polygon = clipPolygonAxis(polygon, 'x', frame.halfWidth, false);
  polygon = clipPolygonAxis(polygon, 'y', -frame.halfHeight, true);
  polygon = clipPolygonAxis(polygon, 'y', frame.halfHeight, false);
  return polygonArea2D(polygon);
}
