import type { ProjectorConfig, ProjectorWarp, Vec2 } from '../types';
import { DEFAULT_PROJECTOR_WARP } from '../types';
import { applyMat3, isValidWarpQuad, squareToQuad } from './homography';
import { clampGridSize, createGridWarp, identityGridPoints, tessellateGrid, TESSELLATION, type WarpMesh } from './gridWarp';
import type { ZipEntry } from '../utils/zip';

/**
 * v10 warp files: sanitising, our JSON, and the export bundle (OBJ mesh, CSV control
 * points, README). Pure — the blend-mask PNG is rendered by the caller.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const finiteVec2 = (c: unknown): c is Vec2 =>
  isObject(c) && typeof c.x === 'number' && Number.isFinite(c.x) && typeof c.y === 'number' && Number.isFinite(c.y);

/** Sanitise a v4 warp (shape comes from the migration chain; bad values fall back). */
export function normalizeWarp(raw: unknown): ProjectorWarp {
  const d = DEFAULT_PROJECTOR_WARP;
  if (!isObject(raw)) return structuredClone(d);
  const pin = isObject(raw.cornerPin) ? raw.cornerPin : {};
  const corners = (
    Array.isArray(pin.corners) && pin.corners.length === 4
      ? pin.corners.map((c: unknown, i: number) => (finiteVec2(c) ? { x: c.x, y: c.y } : { ...d.cornerPin.corners[i] }))
      : structuredClone(d.cornerPin.corners)
  ) as ProjectorWarp['cornerPin']['corners'];
  const g = isObject(raw.grid) ? raw.grid : {};
  const cols = clampGridSize(Number(g.cols));
  const rows = clampGridSize(Number(g.rows));
  const interpolation = g.interpolation === 'linear' ? ('linear' as const) : ('bezier' as const);
  const grid =
    Array.isArray(g.points) && g.points.length === cols * rows && g.points.every(finiteVec2)
      ? { cols, rows, points: (g.points as Vec2[]).map((p) => ({ x: p.x, y: p.y })), interpolation }
      : createGridWarp(cols, rows, interpolation);
  const mode = raw.mode === 'cornerPin' || raw.mode === 'grid' ? raw.mode : 'none';
  return { mode, cornerPin: { corners }, grid };
}

// ---------------------------------------------------------------------------
// Our JSON
// ---------------------------------------------------------------------------

export const WARP_FILE_FORMAT = 'projectionsim-warp';
export const WARP_FILE_VERSION = 1;

export function warpToJson(projector: ProjectorConfig): string {
  const { width, height } = projector.optics.resolution;
  return JSON.stringify(
    {
      format: WARP_FILE_FORMAT,
      version: WARP_FILE_VERSION,
      projector: { name: projector.name, resolution: { width, height } },
      warp: normalizeWarp(projector.warp ?? DEFAULT_PROJECTOR_WARP),
    },
    null,
    2,
  );
}

/** Parse a warp JSON written by warpToJson. Throws with a readable message otherwise. */
export function parseWarpJson(text: string): { warp: ProjectorWarp; projectorName: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Not a JSON file.');
  }
  if (!isObject(raw) || raw.format !== WARP_FILE_FORMAT) {
    throw new Error('Not a Projection Simulator warp file (only our own warp JSON can be imported).');
  }
  if (typeof raw.version !== 'number' || raw.version > WARP_FILE_VERSION) {
    throw new Error('This warp file was written by a newer version of Projection Simulator.');
  }
  const projector = isObject(raw.projector) ? raw.projector : {};
  return {
    warp: normalizeWarp(raw.warp),
    projectorName: typeof projector.name === 'string' ? projector.name : null,
  };
}

// ---------------------------------------------------------------------------
// Export bundle
// ---------------------------------------------------------------------------

function meshFromMap(map: (u: number, v: number) => Vec2, nx: number, ny: number): WarpMesh {
  const positions = new Float32Array(nx * ny * 2);
  const uvs = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const u = i / (nx - 1);
      const v = j / (ny - 1);
      const p = map(u, v);
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
      indices.set([a, a + 1, a + nx + 1, a, a + nx + 1, a + nx], o);
      o += 6;
    }
  }
  return { nx, ny, positions, uvs, indices };
}

/** The mesh the projector actually outputs, whatever the warp mode. */
export function warpExportMesh(warp: ProjectorWarp | undefined): WarpMesh {
  const w = warp ?? DEFAULT_PROJECTOR_WARP;
  if (w.mode === 'grid') return tessellateGrid(w.grid);
  if (w.mode === 'cornerPin' && isValidWarpQuad(w.cornerPin.corners)) {
    const m = squareToQuad(w.cornerPin.corners);
    return meshFromMap((u, v) => applyMat3(m, { x: u, y: v }) ?? { x: u, y: v }, TESSELLATION.x + 1, TESSELLATION.y + 1);
  }
  return meshFromMap((u, v) => ({ x: u, y: v }), 2, 2);
}

/** Control points (row-major, row 0 at the bottom) whatever the warp mode. */
export function warpControlPoints(warp: ProjectorWarp | undefined): { cols: number; rows: number; points: Vec2[] } {
  const w = warp ?? DEFAULT_PROJECTOR_WARP;
  if (w.mode === 'grid') return { cols: w.grid.cols, rows: w.grid.rows, points: w.grid.points };
  if (w.mode === 'cornerPin' && isValidWarpQuad(w.cornerPin.corners)) {
    const [bl, br, tr, tl] = w.cornerPin.corners;
    return { cols: 2, rows: 2, points: [bl, br, tl, tr] };
  }
  return { cols: 2, rows: 2, points: identityGridPoints(2, 2) };
}

const fmt = (n: number) => String(Math.round(n * 1e4) / 1e4);
const fmtUv = (n: number) => String(Math.round(n * 1e7) / 1e7);

/** Wavefront OBJ: v = warped output pixel (bottom-left origin, y up, z 0), vt = source UV. */
export function warpToObj(projector: ProjectorConfig): string {
  const { width, height } = projector.optics.resolution;
  const mesh = warpExportMesh(projector.warp);
  const n = mesh.nx * mesh.ny;
  const lines: string[] = [
    `# Projection Simulator warp mesh: ${projector.name} (${width}x${height})`,
    '# v  = warped output position in pixels; origin bottom-left, +X right, +Y up, Z = 0',
    '# vt = unwarped source image UV (0-1, origin bottom-left)',
    `o ${projector.name.replace(/\s+/g, '_') || 'projector'}`,
  ];
  for (let k = 0; k < n; k++) {
    lines.push(`v ${fmt(mesh.positions[2 * k] * width)} ${fmt(mesh.positions[2 * k + 1] * height)} 0`);
  }
  for (let k = 0; k < n; k++) {
    lines.push(`vt ${fmtUv(mesh.uvs[2 * k])} ${fmtUv(mesh.uvs[2 * k + 1])}`);
  }
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const a = mesh.indices[t] + 1;
    const b = mesh.indices[t + 1] + 1;
    const c = mesh.indices[t + 2] + 1;
    lines.push(`f ${a}/${a} ${b}/${b} ${c}/${c}`);
  }
  return lines.join('\n') + '\n';
}

/** CSV of the control points: row,col,outX,outY (pixels, bottom-left origin),srcU,srcV. */
export function warpToCsv(projector: ProjectorConfig): string {
  const { width, height } = projector.optics.resolution;
  const { cols, rows, points } = warpControlPoints(projector.warp);
  const lines = ['row,col,outX,outY,srcU,srcV'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = points[r * cols + c];
      lines.push([r, c, fmt(p.x * width), fmt(p.y * height), fmtUv(c / (cols - 1)), fmtUv(r / (rows - 1))].join(','));
    }
  }
  return lines.join('\n') + '\n';
}

export const WARP_EXPORT_README = `Projection Simulator - warp export
==================================

Per projector:
  <name>-warp.obj         Warp mesh (Wavefront OBJ).
  <name>-warp.csv         Warp control points.
  <name>-blend-mask.png   Blend mask at the projector's resolution (white = full signal).
  <name>-warp.json        Projection Simulator warp file; import it back in Studio > Warp.

Coordinates and axes
--------------------
OBJ vertices (v) are the warped OUTPUT positions in pixels of the projector's raster:
origin at the BOTTOM-LEFT corner, +X to the right, +Y up, Z always 0.
OBJ texture coordinates (vt) are the UNWARPED source image UV, 0-1, origin bottom-left
(OpenGL convention). Each vertex says "this point of the image is shown at this pixel".
Many media servers use a top-left origin: flip Y as outY' = height - outY if needed.

The OBJ is the dense mesh the simulator renders (for a grid warp: the curved
interpolation tessellated into triangles, exact at the control points; corner pin:
the perspective quad sampled on a fine lattice; no warp: one quad).

CSV columns: row,col,outX,outY,srcU,srcV
  row 0 is the bottom row, col 0 the left column; outX/outY are output pixels with the
  same bottom-left origin as the OBJ; srcU/srcV the source UV of that control point.
  Corner pin exports as a 2x2 grid; no warp as the identity 2x2 grid.

Grid warp is 2D output space only: it does not change the 3D projector optics or the
brightness / pixel-density calculations.
`;

function fileSlug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'projector';
}

/** Zip entries for one projector, optionally inside a folder. */
export function warpExportEntries(projector: ProjectorConfig, maskPng: Uint8Array | null, folder = ''): ZipEntry[] {
  const base = `${folder}${fileSlug(projector.name)}`;
  const entries: ZipEntry[] = [
    { name: `${base}-warp.obj`, data: warpToObj(projector) },
    { name: `${base}-warp.csv`, data: warpToCsv(projector) },
  ];
  if (maskPng) entries.push({ name: `${base}-blend-mask.png`, data: maskPng });
  entries.push({ name: `${base}-warp.json`, data: warpToJson(projector) });
  return entries;
}

/** Folder names for "all projectors" (unique even when projector names repeat). */
export function projectorFolders(projectors: readonly ProjectorConfig[]): string[] {
  const used = new Map<string, number>();
  return projectors.map((p) => {
    const s = fileSlug(p.name);
    const n = (used.get(s) ?? 0) + 1;
    used.set(s, n);
    return n === 1 ? `${s}/` : `${s}-${n}/`;
  });
}
