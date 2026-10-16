import { describe, expect, it } from 'vitest';
import type { GridWarp } from '../types';
import {
  clampGridSize,
  colIndices,
  createGridWarp,
  evalGrid,
  gridFromPoints,
  gridInverse,
  isIdentityGrid,
  movePoints,
  resampleGrid,
  resetPoint,
  rowIndices,
  tessellateGrid,
} from './gridWarp';

/** A smooth, clearly non-trivial warp (barrel-ish bulge + keystone). */
function warped(cols: number, rows: number, interpolation: GridWarp['interpolation'] = 'bezier'): GridWarp {
  const g = createGridWarp(cols, rows, interpolation);
  return {
    ...g,
    points: g.points.map(({ x, y }) => ({
      x: 0.05 + 0.9 * x + 0.04 * Math.sin(Math.PI * y) * (x - 0.5),
      y: 0.03 + 0.92 * y + 0.03 * x * y + 0.02 * Math.sin(Math.PI * x),
    })),
  };
}

describe('grid warp', () => {
  it('clamps the grid size to 2..33 (default 5)', () => {
    expect(clampGridSize(1)).toBe(2);
    expect(clampGridSize(40)).toBe(33);
    expect(clampGridSize(Number.NaN)).toBe(5);
    expect(createGridWarp().cols).toBe(5);
  });

  it('a new grid is the identity for both interpolations', () => {
    for (const interp of ['linear', 'bezier'] as const) {
      const g = createGridWarp(5, 4, interp);
      expect(isIdentityGrid(g)).toBe(true);
      for (const [u, v] of [[0.13, 0.77], [0.5, 0.5], [0.999, 0.01], [0, 1]]) {
        const p = evalGrid(g, u, v);
        expect(p.x).toBeCloseTo(u, 12);
        expect(p.y).toBeCloseTo(v, 12);
      }
    }
  });

  it('is exact at every control point (both interpolations)', () => {
    for (const interp of ['linear', 'bezier'] as const) {
      const g = warped(6, 4, interp);
      for (let r = 0; r < g.rows; r++) {
        for (let c = 0; c < g.cols; c++) {
          const p = evalGrid(g, c / (g.cols - 1), r / (g.rows - 1));
          const q = g.points[r * g.cols + c];
          expect(p.x).toBeCloseTo(q.x, 12);
          expect(p.y).toBeCloseTo(q.y, 12);
        }
      }
    }
  });

  it('the tessellated mesh has the control points as vertices', () => {
    const g = warped(5, 5);
    const mesh = tessellateGrid(g);
    const sx = (mesh.nx - 1) / (g.cols - 1);
    const sy = (mesh.ny - 1) / (g.rows - 1);
    expect(Number.isInteger(sx) && Number.isInteger(sy)).toBe(true);
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const k = r * sy * mesh.nx + c * sx;
        expect(mesh.positions[2 * k]).toBeCloseTo(g.points[r * g.cols + c].x, 6);
        expect(mesh.positions[2 * k + 1]).toBeCloseTo(g.points[r * g.cols + c].y, 6);
      }
    }
    expect(mesh.nx).toBeGreaterThanOrEqual(65);
    expect(mesh.ny).toBeGreaterThanOrEqual(37);
  });

  it('resampling 5×5 → 7×7 → 5×5 keeps the warp (within 1/2 px on a 4K raster)', () => {
    const g = warped(5, 5);
    const up = resampleGrid(g, 7, 7);
    expect([up.cols, up.rows]).toEqual([7, 7]);
    const back = resampleGrid(up, 5, 5);
    const tol = 0.5 / 3840;
    back.points.forEach((p, i) => {
      expect(Math.abs(p.x - g.points[i].x)).toBeLessThan(tol);
      expect(Math.abs(p.y - g.points[i].y)).toBeLessThan(tol);
    });
    // The 7×7 surface itself follows the original everywhere.
    for (const [u, v] of [[0.1, 0.2], [0.42, 0.66], [0.9, 0.95]]) {
      const a = evalGrid(g, u, v);
      const b = evalGrid(up, u, v);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-3);
    }
  });

  it('resampling an identity grid stays the identity', () => {
    expect(isIdentityGrid(resampleGrid(createGridWarp(5, 5), 9, 3), 1e-12)).toBe(true);
  });

  it('the CPU inverse undoes the warp', () => {
    const g = warped(5, 5);
    const inv = gridInverse(g);
    for (const [u, v] of [[0.2, 0.3], [0.5, 0.5], [0.81, 0.12], [0.33, 0.9]]) {
      const q = inv.lookup(evalGrid(g, u, v))!;
      expect(q).not.toBeNull();
      expect(q.x).toBeCloseTo(u, 3);
      expect(q.y).toBeCloseTo(v, 3);
    }
    expect(inv.lookup({ x: 0.01, y: 0.01 })).toBeNull();
    expect(gridInverse(g)).toBe(inv);
  });

  it('editing helpers: rows, columns, move, reset, fit', () => {
    const g = createGridWarp(4, 3);
    expect(rowIndices(g, 1)).toEqual([4, 5, 6, 7]);
    expect(colIndices(g, 2)).toEqual([2, 6, 10]);
    const moved = movePoints(g, rowIndices(g, 1), 0.1, -0.05);
    expect(moved.points[5]).toEqual({ x: 1 / 3 + 0.1, y: 0.5 - 0.05 });
    expect(moved.points[1]).toBe(g.points[1]);
    expect(resetPoint(moved, 5).points[5]).toEqual({ x: 1 / 3, y: 0.5 });
    expect(gridFromPoints(2, 2, [{ x: 0, y: 0 }, null, { x: 0, y: 1 }, { x: 1, y: 1 }], 'linear')).toBeNull();
    expect(gridFromPoints(2, 2, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], 'linear')?.points).toHaveLength(4);
  });
});
