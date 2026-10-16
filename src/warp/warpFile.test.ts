import { describe, expect, it } from 'vitest';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';
import { DEFAULT_PROJECTOR_WARP, type ProjectorConfig } from '../types';
import { createGridWarp } from './gridWarp';
import { normalizeWarp, parseWarpJson, projectorFolders, warpExportEntries, warpToCsv, warpToJson, warpToObj } from './warpFile';
import { createZip, crc32, listZip } from '../utils/zip';

function gridProjector(): ProjectorConfig {
  const grid = createGridWarp(3, 2, 'linear');
  grid.points[4] = { x: 0.55, y: 0.9 };
  return {
    ...structuredClone(DEFAULT_PROJECTORS[0]),
    name: 'Left Proj',
    optics: { ...DEFAULT_PROJECTORS[0].optics, resolution: { width: 1920, height: 1080 } },
    warp: { ...structuredClone(DEFAULT_PROJECTOR_WARP), mode: 'grid', grid },
  };
}

/** Minimal OBJ reader: checks every face index and returns counts. */
function readObj(text: string) {
  const v: number[][] = [];
  const vt: number[][] = [];
  const f: [number, number][][] = [];
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v') v.push(parts.slice(1).map(Number));
    else if (parts[0] === 'vt') vt.push(parts.slice(1).map(Number));
    else if (parts[0] === 'f') f.push(parts.slice(1).map((s) => s.split('/').map(Number) as [number, number]));
    else if (parts[0] && !['#', 'o'].includes(parts[0])) throw new Error(`unexpected OBJ line: ${line}`);
  }
  return { v, vt, f };
}

describe('warp export', () => {
  it('writes a valid OBJ: pixels bottom-left origin, UVs = source, all face indices in range', () => {
    const p = gridProjector();
    const { v, vt, f } = readObj(warpToObj(p));
    expect(v.length).toBe(vt.length);
    expect(f.length).toBeGreaterThan(0);
    for (const vert of v) {
      expect(vert).toHaveLength(3);
      expect(vert.every(Number.isFinite)).toBe(true);
      expect(vert[2]).toBe(0);
    }
    for (const t of vt) expect(t.every((x) => x >= 0 && x <= 1)).toBe(true);
    for (const face of f) {
      expect(face).toHaveLength(3);
      for (const [a, b] of face) {
        expect(a).toBeGreaterThanOrEqual(1);
        expect(a).toBeLessThanOrEqual(v.length);
        expect(b).toBe(a);
      }
    }
    // First vertex: source (0,0) at pixel (0,0); last: source (1,1) at the moved point.
    expect(v[0]).toEqual([0, 0, 0]);
    expect(vt[0]).toEqual([0, 0]);
    expect(v[v.length - 1][0]).toBeCloseTo(1920, 3);
    const last = vt[vt.length - 1];
    expect(last).toEqual([1, 1]);
    // Control point (row 1, col 1) at 0.55 × 1920, 0.9 × 1080.
    expect(v.some(([x, y]) => Math.abs(x - 1056) < 1e-3 && Math.abs(y - 972) < 1e-3)).toBe(true);
  });

  it('a mesh with no warp is a single quad covering the raster', () => {
    const p = { ...gridProjector(), warp: structuredClone(DEFAULT_PROJECTOR_WARP) };
    const { v, f } = readObj(warpToObj(p));
    expect(v).toEqual([[0, 0, 0], [1920, 0, 0], [0, 1080, 0], [1920, 1080, 0]]);
    expect(f).toHaveLength(2);
  });

  it('writes the control points as CSV (row,col,outX,outY,srcU,srcV)', () => {
    const lines = warpToCsv(gridProjector()).trim().split('\n');
    expect(lines[0]).toBe('row,col,outX,outY,srcU,srcV');
    expect(lines).toHaveLength(1 + 6);
    expect(lines[1]).toBe('0,0,0,0,0,0');
    expect(lines[5]).toBe('1,1,1056,972,0.5,1');
  });

  it('round-trips our JSON and rejects other files', () => {
    const p = gridProjector();
    const { warp, projectorName } = parseWarpJson(warpToJson(p));
    expect(warp).toEqual(p.warp);
    expect(projectorName).toBe('Left Proj');
    expect(() => parseWarpJson('{"foo":1}')).toThrow(/Not a Projection Simulator warp file/);
    expect(() => parseWarpJson('nope')).toThrow(/Not a JSON file/);
    expect(() => parseWarpJson(JSON.stringify({ format: 'projectionsim-warp', version: 99 }))).toThrow(/newer version/);
  });

  it('sanitises bad warp data', () => {
    const w = normalizeWarp({ mode: 'grid', grid: { cols: 3, rows: 3, points: [{ x: 'a' }] } });
    expect(w.mode).toBe('grid');
    expect(w.grid.points).toHaveLength(9);
    expect(normalizeWarp(null)).toEqual(DEFAULT_PROJECTOR_WARP);
  });

  it('bundles OBJ, CSV, mask, JSON per projector, in unique folders for "all"', () => {
    const p = gridProjector();
    expect(warpExportEntries(p, new Uint8Array([1, 2])).map((e) => e.name)).toEqual([
      'left-proj-warp.obj',
      'left-proj-warp.csv',
      'left-proj-blend-mask.png',
      'left-proj-warp.json',
    ]);
    expect(projectorFolders([p, p, { ...p, name: 'Other' }])).toEqual(['left-proj/', 'left-proj-2/', 'other/']);
  });
});

describe('zip writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes a readable archive', () => {
    const zip = createZip([
      { name: 'a/x.txt', data: 'hello' },
      { name: 'README.txt', data: new Uint8Array([1, 2, 3]) },
    ]);
    expect(listZip(zip)).toEqual(['a/x.txt', 'README.txt']);
    // Stored data sits right after the first local header + name.
    expect(new TextDecoder().decode(zip.subarray(30 + 7, 30 + 7 + 5))).toBe('hello');
  });
});
