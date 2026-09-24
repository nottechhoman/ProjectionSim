import { describe, expect, it } from 'vitest';
import { DEFAULT_SURFACE_UV_MAPPING } from '../types';
import {
  computeSurfaceUvFrame,
  normalizeSurfaceUvMapping,
  projectSurfaceUv,
  surfaceToContentUv,
} from './surfaceUv';

const base = { ...DEFAULT_SURFACE_UV_MAPPING, enabled: true };

describe('v2 surface UV mapping', () => {
  it('full region is identity', () => {
    expect(surfaceToContentUv({ x: 0.25, y: 0.75 }, base)).toEqual({ x: 0.25, y: 0.75 });
  });

  it('region picks a sub-rect of the content (top-left origin rect)', () => {
    const m = { ...base, region: { x: 0.5, y: 0, width: 0.5, height: 0.5 } };
    // bottom-left of surface → bottom-left of the top-right quadrant
    const c = surfaceToContentUv({ x: 0, y: 0 }, m)!;
    expect(c.x).toBeCloseTo(0.5, 9);
    expect(c.y).toBeCloseTo(0.5, 9);
    const c2 = surfaceToContentUv({ x: 1, y: 1 }, m)!;
    expect(c2.x).toBeCloseTo(1, 9);
    expect(c2.y).toBeCloseTo(1, 9);
  });

  it('flip and 90° rotation', () => {
    const f = surfaceToContentUv({ x: 0.2, y: 0.3 }, { ...base, flipU: true })!;
    expect(f.x).toBeCloseTo(0.8, 9);
    const r = surfaceToContentUv({ x: 1, y: 0.5 }, { ...base, rotationDeg: 90 })!;
    expect(r.x).toBeCloseTo(0.5, 9);
    expect(r.y).toBeCloseTo(1, 9);
  });

  it('wrap modes', () => {
    const rep = { ...base, repeatU: 2, repeatV: 1 };
    expect(surfaceToContentUv({ x: 0.75, y: 0.5 }, rep)).toBeNull();
    expect(surfaceToContentUv({ x: 0.75, y: 0.5 }, { ...rep, wrap: 'repeat' })!.x).toBeCloseTo(0.5, 9);
    expect(surfaceToContentUv({ x: 0.75, y: 0.5 }, { ...rep, wrap: 'mirror' })!.x).toBeCloseTo(0.5, 9);
    expect(surfaceToContentUv({ x: 0.6, y: 0.5 }, { ...rep, wrap: 'mirror' })!.x).toBeCloseTo(0.8, 9);
  });

  it('planar frame picks the facing axes', () => {
    const plane = [
      { x: -2, y: -1, z: 0 },
      { x: 2, y: 1, z: 0 },
    ];
    const f = computeSurfaceUvFrame(plane);
    expect(f.planarAxes).toBe(0);
    const uv = projectSurfaceUv({ x: 0, y: 0, z: 0 }, 'planar', f);
    expect(uv.x).toBeCloseTo(0.5, 6);
    expect(uv.y).toBeCloseTo(0.5, 6);
    const floor = computeSurfaceUvFrame([
      { x: -1, y: 0, z: -1 },
      { x: 1, y: 0, z: 1 },
    ]);
    expect(floor.planarAxes).toBe(1);
  });

  it('cylindrical fits the arc of a curved screen', () => {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = -Math.PI / 4 + (i / 8) * (Math.PI / 2);
      pts.push({ x: 4 * Math.sin(t), y: -1, z: 4 * Math.cos(t) });
      pts.push({ x: 4 * Math.sin(t), y: 1, z: 4 * Math.cos(t) });
    }
    const f = computeSurfaceUvFrame(pts);
    // Viewer on the axis looking toward +Z has +X on their left.
    const left = projectSurfaceUv({ x: 4 * Math.sin(Math.PI / 4), y: -1, z: 4 * Math.cos(Math.PI / 4) }, 'cylindrical', f);
    const mid = projectSurfaceUv({ x: 0, y: 0, z: 4 }, 'cylindrical', f);
    expect(left.x).toBeCloseTo(0, 6);
    expect(left.y).toBeCloseTo(0, 6);
    expect(mid.x).toBeCloseTo(0.5, 6);
    expect(mid.y).toBeCloseTo(0.5, 6);
  });

  it('normalize fills defaults and clamps', () => {
    const n = normalizeSurfaceUvMapping({ enabled: true, repeatU: 0, region: { x: 0, y: 0, width: -1, height: 0.5 } });
    expect(n.repeatU).toBe(0.05);
    expect(n.region.width).toBe(0.01);
    expect(n.projection).toBe('meshUv');
    expect(normalizeSurfaceUvMapping(undefined).enabled).toBe(false);
  });
});
