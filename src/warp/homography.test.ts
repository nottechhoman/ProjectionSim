import { describe, expect, it } from 'vitest';
import {
  applyMat3,
  fitWarpToRasterPoints,
  invertMat3,
  isValidWarpQuad,
  squareToQuad,
  warpInverseMatrix,
} from './homography';

const quad = [
  { x: 0.1, y: 0.05 },
  { x: 0.92, y: 0.12 },
  { x: 0.85, y: 0.95 },
  { x: 0.05, y: 0.88 },
];

describe('corner-pin homography', () => {
  it('maps unit-square corners onto the quad corners', () => {
    const m = squareToQuad(quad);
    const src = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    src.forEach((p, i) => {
      const q = applyMat3(m, p)!;
      expect(q.x).toBeCloseTo(quad[i].x, 6);
      expect(q.y).toBeCloseTo(quad[i].y, 6);
    });
  });

  it('inverse round-trips interior points', () => {
    const m = squareToQuad(quad);
    const inv = invertMat3(m)!;
    const p = { x: 0.37, y: 0.61 };
    const back = applyMat3(inv, applyMat3(m, p)!)!;
    expect(back.x).toBeCloseTo(p.x, 6);
    expect(back.y).toBeCloseTo(p.y, 6);
  });

  it('is identity when disabled', () => {
    const inv = warpInverseMatrix({ enabled: false, corners: quad as never });
    expect(applyMat3(inv, { x: 0.3, y: 0.7 })).toEqual({ x: 0.3, y: 0.7 });
  });

  it('rejects self-intersecting quads', () => {
    expect(isValidWarpQuad([quad[0], quad[2], quad[1], quad[3]])).toBe(false);
    expect(isValidWarpQuad(quad)).toBe(true);
  });

  it('fit clamps target points into the raster', () => {
    const warp = fitWarpToRasterPoints([
      { x: -0.2, y: 0.1 },
      { x: 0.9, y: 0.1 },
      { x: 0.9, y: 0.9 },
      { x: 0.1, y: 1.3 },
    ])!;
    expect(warp.enabled).toBe(true);
    expect(warp.corners[0].x).toBe(0);
    expect(warp.corners[3].y).toBe(1);
  });
});
