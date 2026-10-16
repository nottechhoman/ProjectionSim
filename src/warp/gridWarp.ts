import type { GridWarp, GridInterpolation, Vec2 } from '../types';

/**
 * v10 grid (mesh) warp — pure math.
 *
 * A grid of cols × rows control points says where each point of the (unwarped)
 * image lands in the projector's physical raster. Coordinates are raster UV, 0–1,
 * bottom-left origin (same as the corner pin); points are row-major with row 0 at
 * the bottom and column 0 on the left.
 *
 * Between control points the surface is interpolated:
 *  - 'linear': bilinear inside each cell;
 *  - 'bezier': uniform Catmull-Rom (bicubic) — a smooth curve that passes exactly
 *    through every control point. Edges are extended linearly (P₋₁ = 2P₀ − P₁) so an
 *    untouched grid is exactly the identity.
 *
 * Rendering never inverts the spline per pixel: the warp is tessellated into a fine
 * triangle mesh (vertices on the spline, exact at the control points) and drawn.
 * This is 2D output space only; it does not change the 3D optics or the brightness /
 * pixel-density calculations.
 */

export const MIN_GRID_SIZE = 2;
export const MAX_GRID_SIZE = 33;
export const DEFAULT_GRID_SIZE = 5;
/** Tessellation of the whole grid (quads across × down), rounded up to whole cells. */
export const TESSELLATION = { x: 64, y: 36 } as const;

export function clampGridSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_GRID_SIZE;
  return Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, Math.round(n)));
}

export function identityGridPoints(cols: number, rows: number): Vec2[] {
  const out: Vec2[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: c / (cols - 1), y: r / (rows - 1) });
  return out;
}

export function createGridWarp(cols = DEFAULT_GRID_SIZE, rows = DEFAULT_GRID_SIZE, interpolation: GridInterpolation = 'bezier'): GridWarp {
  const c = clampGridSize(cols);
  const r = clampGridSize(rows);
  return { cols: c, rows: r, points: identityGridPoints(c, r), interpolation };
}

export function isIdentityGrid(grid: GridWarp, eps = 1e-9): boolean {
  const id = identityGridPoints(grid.cols, grid.rows);
  return grid.points.every((p, i) => Math.abs(p.x - id[i].x) < eps && Math.abs(p.y - id[i].y) < eps);
}

/** Control point (col, row) with linear extension beyond the edges. */
function pointAt(grid: GridWarp, c: number, r: number): Vec2 {
  const { cols, rows, points } = grid;
  // Extend linearly: P(-1) = 2P(0) - P(1), P(n) = 2P(n-1) - P(n-2).
  if (c < 0) return lerpOut(pointAt(grid, 0, r), pointAt(grid, 1, r), -c);
  if (c > cols - 1) return lerpOut(pointAt(grid, cols - 1, r), pointAt(grid, cols - 2, r), c - (cols - 1));
  if (r < 0) return lerpOut(pointAt(grid, c, 0), pointAt(grid, c, 1), -r);
  if (r > rows - 1) return lerpOut(pointAt(grid, c, rows - 1), pointAt(grid, c, rows - 2), r - (rows - 1));
  return points[r * cols + c];
}

function lerpOut(edge: Vec2, inner: Vec2, k: number): Vec2 {
  return { x: edge.x + (edge.x - inner.x) * k, y: edge.y + (edge.y - inner.y) * k };
}

function catmullRom(s: number): [number, number, number, number] {
  const s2 = s * s;
  const s3 = s2 * s;
  return [0.5 * (-s3 + 2 * s2 - s), 0.5 * (3 * s3 - 5 * s2 + 2), 0.5 * (-3 * s3 + 4 * s2 + s), 0.5 * (s3 - s2)];
}

/** Where source UV (u, v) lands in the raster. Exact at the control points. */
export function evalGrid(grid: GridWarp, u: number, v: number): Vec2 {
  const fu = Math.min(1, Math.max(0, u)) * (grid.cols - 1);
  const fv = Math.min(1, Math.max(0, v)) * (grid.rows - 1);
  const c0 = Math.min(grid.cols - 2, Math.floor(fu));
  const r0 = Math.min(grid.rows - 2, Math.floor(fv));
  const s = fu - c0;
  const t = fv - r0;
  if (grid.interpolation === 'linear') {
    const a = pointAt(grid, c0, r0);
    const b = pointAt(grid, c0 + 1, r0);
    const c = pointAt(grid, c0, r0 + 1);
    const d = pointAt(grid, c0 + 1, r0 + 1);
    return {
      x: (1 - t) * ((1 - s) * a.x + s * b.x) + t * ((1 - s) * c.x + s * d.x),
      y: (1 - t) * ((1 - s) * a.y + s * b.y) + t * ((1 - s) * c.y + s * d.y),
    };
  }
  const wu = catmullRom(s);
  const wv = catmullRom(t);
  let x = 0;
  let y = 0;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 4; i++) {
      const p = pointAt(grid, c0 - 1 + i, r0 - 1 + j);
      const w = wu[i] * wv[j];
      x += w * p.x;
      y += w * p.y;
    }
  }
  return { x, y };
}

/**
 * Change the grid size keeping the current warp: new control points are sampled
 * from the current surface (not reset).
 */
export function resampleGrid(grid: GridWarp, cols: number, rows: number): GridWarp {
  const c = clampGridSize(cols);
  const r = clampGridSize(rows);
  if (c === grid.cols && r === grid.rows) return grid;
  const points: Vec2[] = [];
  for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) points.push(evalGrid(grid, i / (c - 1), j / (r - 1)));
  return { ...grid, cols: c, rows: r, points };
}

export interface WarpMesh {
  /** Vertices across / down. */
  nx: number;
  ny: number;
  /** Warped raster UV per vertex (x, y pairs). */
  positions: Float32Array;
  /** Source (unwarped) UV per vertex (u, v pairs). */
  uvs: Float32Array;
  /** Triangles (two per quad), in draw order. */
  indices: Uint32Array;
}

/** Tessellate the grid; control points are mesh vertices (every cell is split evenly). */
export function tessellateGrid(grid: GridWarp, quads: { x: number; y: number } = TESSELLATION): WarpMesh {
  const sx = Math.max(1, Math.ceil(quads.x / (grid.cols - 1)));
  const sy = Math.max(1, Math.ceil(quads.y / (grid.rows - 1)));
  const nx = (grid.cols - 1) * sx + 1;
  const ny = (grid.rows - 1) * sy + 1;
  const positions = new Float32Array(nx * ny * 2);
  const uvs = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const u = i / (nx - 1);
      const v = j / (ny - 1);
      // Control points exactly (no spline round-off) where a vertex sits on one.
      const p = i % sx === 0 && j % sy === 0 ? grid.points[(j / sy) * grid.cols + i / sx] : evalGrid(grid, u, v);
      positions[2 * k] = p.x;
      positions[2 * k + 1] = p.y;
      uvs[2 * k] = u;
      uvs[2 * k + 1] = v;
    }
  }
  const indices = new Uint32Array((nx - 1) * (ny - 1) * 6);
  let o = 0;
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      indices.set([a, b, d, a, d, c], o);
      o += 6;
    }
  }
  return { nx, ny, positions, uvs, indices };
}

/**
 * CPU inverse (physical raster UV → source UV) on the tessellated mesh, for the
 * auto-blend analysis. Matches the GPU warp map: where triangles overlap (a folded
 * grid) the one drawn last wins. Returns null outside the warped image.
 */
export class GridInverse {
  private readonly bins: number[][];
  private readonly binsX: number;
  private readonly binsY: number;
  private readonly minX: number;
  private readonly minY: number;
  private readonly sizeX: number;
  private readonly sizeY: number;

  constructor(readonly mesh: WarpMesh, bins = 64) {
    const { positions, indices } = mesh;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < positions.length; i += 2) {
      minX = Math.min(minX, positions[i]);
      maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]);
      maxY = Math.max(maxY, positions[i + 1]);
    }
    this.minX = minX;
    this.minY = minY;
    this.sizeX = Math.max(1e-9, maxX - minX);
    this.sizeY = Math.max(1e-9, maxY - minY);
    this.binsX = bins;
    this.binsY = bins;
    this.bins = Array.from({ length: bins * bins }, () => []);
    for (let t = 0; t < indices.length / 3; t++) {
      let tx0 = Infinity;
      let ty0 = Infinity;
      let tx1 = -Infinity;
      let ty1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const v = indices[3 * t + k];
        tx0 = Math.min(tx0, positions[2 * v]);
        tx1 = Math.max(tx1, positions[2 * v]);
        ty0 = Math.min(ty0, positions[2 * v + 1]);
        ty1 = Math.max(ty1, positions[2 * v + 1]);
      }
      const [bx0, by0] = this.bin(tx0, ty0);
      const [bx1, by1] = this.bin(tx1, ty1);
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) this.bins[by * bins + bx].push(t);
    }
  }

  private bin(x: number, y: number): [number, number] {
    const bx = Math.floor(((x - this.minX) / this.sizeX) * this.binsX);
    const by = Math.floor(((y - this.minY) / this.sizeY) * this.binsY);
    return [Math.min(this.binsX - 1, Math.max(0, bx)), Math.min(this.binsY - 1, Math.max(0, by))];
  }

  lookup(p: Vec2): Vec2 | null {
    if (p.x < this.minX || p.y < this.minY || p.x > this.minX + this.sizeX || p.y > this.minY + this.sizeY) return null;
    const [bx, by] = this.bin(p.x, p.y);
    const list = this.bins[by * this.binsX + bx];
    const { positions, uvs, indices } = this.mesh;
    for (let n = list.length - 1; n >= 0; n--) {
      const t = list[n];
      const a = indices[3 * t];
      const b = indices[3 * t + 1];
      const c = indices[3 * t + 2];
      const ax = positions[2 * a];
      const ay = positions[2 * a + 1];
      const v0x = positions[2 * b] - ax;
      const v0y = positions[2 * b + 1] - ay;
      const v1x = positions[2 * c] - ax;
      const v1y = positions[2 * c + 1] - ay;
      const v2x = p.x - ax;
      const v2y = p.y - ay;
      const den = v0x * v1y - v1x * v0y;
      if (Math.abs(den) < 1e-14) continue;
      const wb = (v2x * v1y - v1x * v2y) / den;
      const wc = (v0x * v2y - v2x * v0y) / den;
      const wa = 1 - wb - wc;
      const e = -1e-9;
      if (wa < e || wb < e || wc < e) continue;
      return {
        x: wa * uvs[2 * a] + wb * uvs[2 * b] + wc * uvs[2 * c],
        y: wa * uvs[2 * a + 1] + wb * uvs[2 * b + 1] + wc * uvs[2 * c + 1],
      };
    }
    return null;
  }
}

const inverseCache = new WeakMap<GridWarp, GridInverse>();

/** Cached inverse for a grid object (grids are replaced, never mutated, on edit). */
export function gridInverse(grid: GridWarp): GridInverse {
  let inv = inverseCache.get(grid);
  if (!inv) {
    inv = new GridInverse(tessellateGrid(grid));
    inverseCache.set(grid, inv);
  }
  return inv;
}

// ---- editing helpers (pure) -------------------------------------------------

export function movePoints(grid: GridWarp, indices: number[], dx: number, dy: number): GridWarp {
  const set = new Set(indices);
  return { ...grid, points: grid.points.map((p, i) => (set.has(i) ? { x: p.x + dx, y: p.y + dy } : p)) };
}

export function setPoint(grid: GridWarp, index: number, p: Vec2): GridWarp {
  return { ...grid, points: grid.points.map((q, i) => (i === index ? { x: p.x, y: p.y } : q)) };
}

export function rowIndices(grid: GridWarp, row: number): number[] {
  return Array.from({ length: grid.cols }, (_, c) => row * grid.cols + c);
}

export function colIndices(grid: GridWarp, col: number): number[] {
  return Array.from({ length: grid.rows }, (_, r) => r * grid.cols + col);
}

export function resetPoint(grid: GridWarp, index: number): GridWarp {
  const c = index % grid.cols;
  const r = Math.floor(index / grid.cols);
  return setPoint(grid, index, { x: c / (grid.cols - 1), y: r / (grid.rows - 1) });
}

/** Grid from raster points sampled at the control-point lattice (fit to target); null if any is missing. */
export function gridFromPoints(cols: number, rows: number, pts: readonly (Vec2 | null)[], interpolation: GridInterpolation): GridWarp | null {
  if (pts.length !== cols * rows || pts.some((p) => p === null)) return null;
  return { cols, rows, points: pts.map((p) => ({ x: p!.x, y: p!.y })), interpolation };
}

/** Polylines of the warped grid lines (for overlays), sampled `steps` times per cell. */
export function gridLinePolylines(grid: GridWarp, steps = 8): Vec2[][] {
  const lines: Vec2[][] = [];
  const nu = (grid.cols - 1) * steps;
  const nv = (grid.rows - 1) * steps;
  for (let r = 0; r < grid.rows; r++) {
    const v = r / (grid.rows - 1);
    lines.push(Array.from({ length: nu + 1 }, (_, i) => evalGrid(grid, i / nu, v)));
  }
  for (let c = 0; c < grid.cols; c++) {
    const u = c / (grid.cols - 1);
    lines.push(Array.from({ length: nv + 1 }, (_, j) => evalGrid(grid, u, j / nv)));
  }
  return lines;
}
