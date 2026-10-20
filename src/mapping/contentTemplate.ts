import * as THREE from 'three';
import type { Mapping, ProjectorConfig, SceneObject, Vec2 } from '../types';
import { getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import { computeSurfaceUvFrame, type SurfaceUvFrame } from '../uvmapping/surfaceUv';
import { collectMeshes } from '../visibility/projectionOcclusion';
import { MAPPING_KIND_LABEL, mappingResolution, screenAspect } from './model';
import { mappingCanvasUvUnclipped, mappingMatrix, type TexelContext } from './sample';
import { screenTextureSize, SCREEN_TEXTURE_MAX } from './ScreenTextureBaker';

/**
 * Content template for a mapping: which pixels of the mapping canvas land on which
 * screen, and where two or more projectors overlap (blend zones). Content makers
 * draw on top of it so their media fits the stage pixel for pixel.
 *
 * Every screen triangle is pushed through the same texel → canvas UV function the
 * bake shader mirrors (sample.ts), then rasterised into canvas pixels (top-left
 * origin). Non-linear mappings are subdivided so curves stay smooth.
 */

export const TEMPLATE_COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#ba68c8', '#f06292', '#4db6ac', '#e57373', '#aed581'];

/** Largest canvas side a template is built at; bigger canvases would not fit in memory comfortably. */
export const TEMPLATE_MAX_SIDE = 16384;

export interface TemplateSurface {
  obj: SceneObject;
  /** The object's root in world space (the editor's mesh, or a freshly built one in tests). */
  root: THREE.Object3D;
  /** Fitted frame for Feed planar / cylindrical / spherical projections. */
  frame?: SurfaceUvFrame;
}

export interface TemplateScreen {
  id: string;
  name: string;
  type: SceneObject['type'];
  color: string;
  /** Bounding box in canvas pixels (top-left origin), null when the screen is not on the canvas. */
  bbox: { x: number; y: number; w: number; h: number } | null;
  /** Canvas pixels that land on this screen. */
  pixels: number;
  /** Canvas pixels on this screen lit by two or more projectors. */
  blendPixels: number;
  /** Physical size label, e.g. "6.00 × 3.38 m". */
  physical: string;
}

export interface ContentTemplate {
  mappingName: string;
  kindLabel: string;
  width: number;
  height: number;
  /** Per canvas pixel: index into screens + 1, or 0 for no screen. Row 0 is the top row. */
  owner: Uint16Array;
  /** Per canvas pixel: how many enabled projectors light that point (0 when not computed). */
  projectorCount: Uint8Array;
  screens: TemplateScreen[];
  /** Number of enabled projectors that were checked for overlap. */
  projectorsChecked: number;
}

/** Physical size of a screen as shown on the template. */
export function physicalSizeLabel(obj: SceneObject): string {
  const m = (v: number) => v.toFixed(2);
  if (obj.type === 'curvedScreen' && obj.curved) {
    const arc = (obj.curved.radius * obj.curved.arcAngleDeg * Math.PI) / 180;
    return `${m(arc)} × ${m(obj.curved.height)} m arc (r ${m(obj.curved.radius)} m, ${Math.round(obj.curved.arcAngleDeg)}°)`;
  }
  if (obj.type === 'box') return `${m(obj.dimensions.width)} × ${m(obj.dimensions.height)} × ${m(obj.dimensions.depth ?? 1)} m box`;
  if (obj.type === 'model') return 'imported model';
  if (obj.type === 'ledWall' && obj.ledWall) {
    const r = obj.ledWall.pixelResolution;
    return `${m(obj.dimensions.width)} × ${m(obj.dimensions.height)} m LED (${r.width} × ${r.height} px)`;
  }
  return `${m(obj.dimensions.width)} × ${m(obj.dimensions.height)} m`;
}

/** Root-local vertex sample → fitted frame (same as the editor's computeRootSurfaceFrame). */
export function fitSurfaceFrame(root: THREE.Object3D): SurfaceUvFrame {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const points: { x: number; y: number; z: number }[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  for (const mesh of collectMeshes(root)) {
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) continue;
    m.multiplyMatrices(rootInv, mesh.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      points.push({ x: v.x, y: v.y, z: v.z });
    }
  }
  return computeSurfaceUvFrame(points);
}

interface Vtx {
  world: THREE.Vector3;
  local: THREE.Vector3;
  uv: Vec2;
}

/**
 * Canvas pixel position (top-left origin) of a vertex, or null when the mapping misses it.
 * z is the distance along the view for Perspective mappings (nearest surface wins), else 0.
 */
type CanvasPoint = { x: number; y: number; z: number } | null;

const SUBDIVIDE_TARGET_PX = 12;
const MAX_SUBDIVISIONS = 48;

function lerpVtx(a: Vtx, b: Vtx, c: Vtx, wa: number, wb: number, wc: number): Vtx {
  return {
    world: new THREE.Vector3(
      a.world.x * wa + b.world.x * wb + c.world.x * wc,
      a.world.y * wa + b.world.y * wb + c.world.y * wc,
      a.world.z * wa + b.world.z * wb + c.world.z * wc,
    ),
    local: new THREE.Vector3(
      a.local.x * wa + b.local.x * wb + c.local.x * wc,
      a.local.y * wa + b.local.y * wb + c.local.y * wc,
      a.local.z * wa + b.local.z * wb + c.local.z * wc,
    ),
    uv: { x: a.uv.x * wa + b.uv.x * wb + c.uv.x * wc, y: a.uv.y * wa + b.uv.y * wb + c.uv.y * wc },
  };
}

/** Projectors that can light a point: enabled, and the point is inside the raster and in front. */
function makeProjectorCounter(projectors: ProjectorConfig[]): { count: (x: number, y: number, z: number) => number; n: number } {
  const mats = projectors.filter((p) => p.enabled).map((p) => getProjectorViewProjectionMatrix(p.optics, getProjectorWorldMatrix(p)).elements);
  return {
    n: mats.length,
    count(x, y, z) {
      let n = 0;
      for (const e of mats) {
        const w = e[3] * x + e[7] * y + e[11] * z + e[15];
        if (w <= 1e-6) continue;
        const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
        const cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
        if (cx >= -1 && cx <= 1 && cy >= -1 && cy <= 1) n++;
      }
      return n;
    },
  };
}

/**
 * Build the template buffers for a mapping. Screens the mapping does not use are
 * ignored; surfaces must include the root of every screen on the mapping.
 */
export function buildContentTemplate(
  mapping: Mapping,
  projectors: ProjectorConfig[],
  surfaces: TemplateSurface[],
  allMappings: Mapping[] = [mapping],
): ContentTemplate {
  const res = mappingResolution(mapping, projectors);
  const scale = Math.min(1, TEMPLATE_MAX_SIDE / Math.max(res.w, res.h));
  const W = Math.max(1, Math.round(res.w * scale));
  const H = Math.max(1, Math.round(res.h * scale));
  const owner = new Uint16Array(W * H);
  const projectorCount = new Uint8Array(W * H);
  const matrix = mappingMatrix(mapping, projectors);
  // A Perspective canvas is a view: where screens overlap in it, the viewer sees the nearer one.
  const depthTest = mapping.kind === 'perspective';
  const depth = depthTest ? new Float32Array(W * H).fill(Infinity) : null;
  const me = matrix.elements;
  const counter = makeProjectorCounter(projectors);
  const wraps = mapping.kind === 'cylindrical' || mapping.kind === 'spherical';
  const linearInUv = mapping.kind === 'direct' || mapping.kind === 'feed';

  const onMapping = surfaces.filter((s) => mapping.screenIds.includes(s.obj.id));
  const screens: TemplateScreen[] = onMapping.map((s, i) => ({
    id: s.obj.id,
    name: s.obj.name,
    type: s.obj.type,
    color: TEMPLATE_COLORS[i % TEMPLATE_COLORS.length],
    bbox: null,
    pixels: 0,
    blendPixels: 0,
    physical: physicalSizeLabel(s.obj),
  }));

  onMapping.forEach((surface, si) => {
    const { obj, root } = surface;
    root.updateMatrixWorld(true);
    const frame = surface.frame ?? fitSurfaceFrame(root);
    const lit = obj.type !== 'ledWall' && obj.receivesProjection && counter.n >= 2;
    const feedRect = mapping.kind === 'feed' ? mapping.feed?.rects.find((r) => r.screenId === obj.id) : undefined;
    const linear =
      linearInUv && (mapping.kind !== 'feed' || (feedRect?.projection === 'meshUv' && feedRect.repeatU === 1 && feedRect.repeatV === 1));
    const baseCtx = {
      screenId: obj.id,
      screenAspect: screenAspect(obj),
      screenTexSize: screenTextureSize(obj, allMappings, SCREEN_TEXTURE_MAX.desktop),
      frame,
    };
    const toCanvas = (v: Vtx): CanvasPoint => {
      const ctx: TexelContext = {
        ...baseCtx,
        world: { x: v.world.x, y: v.world.y, z: v.world.z },
        surfaceUv: v.uv,
        local: { x: v.local.x, y: v.local.y, z: v.local.z },
      };
      const uv = mappingCanvasUvUnclipped(mapping, ctx, projectors, matrix);
      if (!uv) return null;
      const z = depthTest ? me[3] * v.world.x + me[7] * v.world.y + me[11] * v.world.z + me[15] : 0;
      return { x: uv.x * W, y: (1 - uv.y) * H, z };
    };

    const rootInv = root.matrixWorld.clone().invert();
    const localM = new THREE.Matrix4();
    for (const mesh of collectMeshes(root)) {
      const geo = mesh.geometry;
      const pos = geo.getAttribute('position');
      const uvAttr = geo.getAttribute('uv');
      if (!pos || !uvAttr) continue;
      localM.multiplyMatrices(rootInv, mesh.matrixWorld);
      const index = geo.getIndex();
      const triCount = (index ? index.count : pos.count) / 3;
      const vtx = (i: number): Vtx => {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i);
        return {
          world: p.clone().applyMatrix4(mesh.matrixWorld),
          local: p.clone().applyMatrix4(localM),
          uv: { x: uvAttr.getX(i), y: uvAttr.getY(i) },
        };
      };
      for (let t = 0; t < triCount; t++) {
        const ia = index ? index.getX(t * 3) : t * 3;
        const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
        const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
        const a = vtx(ia);
        const b = vtx(ib);
        const c = vtx(ic);
        let n = 1;
        if (!linear) {
          const pa = toCanvas(a);
          const pb = toCanvas(b);
          const pc = toCanvas(c);
          const pts = [pa, pb, pc].filter((p): p is NonNullable<CanvasPoint> => !!p);
          let edge = Math.max(W, H) / 8; // some vertices miss the mapping: subdivide to find the edge
          if (pts.length === 3) {
            edge = Math.max(
              Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
              Math.hypot(pts[1].x - pts[2].x, pts[1].y - pts[2].y),
              Math.hypot(pts[2].x - pts[0].x, pts[2].y - pts[0].y),
            );
            if (wraps && edge > W / 2) edge = Math.max(W, H) / 8;
          }
          n = Math.min(MAX_SUBDIVISIONS, Math.max(1, Math.ceil(edge / SUBDIVIDE_TARGET_PX)));
        }
        rasterSubdivided(a, b, c, n);
      }
    }

    function rasterSubdivided(a: Vtx, b: Vtx, c: Vtx, n: number) {
      // Grid of barycentric points: row i (0..n), column j (0..n-i).
      const grid: { v: Vtx; p: CanvasPoint }[][] = [];
      for (let i = 0; i <= n; i++) {
        const row: { v: Vtx; p: CanvasPoint }[] = [];
        for (let j = 0; j <= n - i; j++) {
          const wb = i / n;
          const wc = j / n;
          const v = lerpVtx(a, b, c, 1 - wb - wc, wb, wc);
          row.push({ v, p: toCanvas(v) });
        }
        grid.push(row);
      }
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n - i; j++) {
          fillTri(grid[i][j], grid[i + 1][j], grid[i][j + 1]);
          if (j < n - i - 1) fillTri(grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
        }
      }
    }

    function fillTri(A: { v: Vtx; p: CanvasPoint }, B: { v: Vtx; p: CanvasPoint }, C: { v: Vtx; p: CanvasPoint }) {
      const pa = A.p;
      const pb = B.p;
      const pc = C.p;
      if (!pa || !pb || !pc) return;
      // A sub-triangle spanning more than half the canvas crosses a cylindrical / spherical seam.
      if (wraps && Math.max(pa.x, pb.x, pc.x) - Math.min(pa.x, pb.x, pc.x) > W / 2) return;
      const minX = Math.max(0, Math.floor(Math.min(pa.x, pb.x, pc.x)));
      const maxX = Math.min(W - 1, Math.ceil(Math.max(pa.x, pb.x, pc.x)));
      const minY = Math.max(0, Math.floor(Math.min(pa.y, pb.y, pc.y)));
      const maxY = Math.min(H - 1, Math.ceil(Math.max(pa.y, pb.y, pc.y)));
      if (minX > maxX || minY > maxY) return;
      const area = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
      if (Math.abs(area) < 1e-12) return;
      const eps = -1e-6;
      for (let y = minY; y <= maxY; y++) {
        const py = y + 0.5;
        for (let x = minX; x <= maxX; x++) {
          const px = x + 0.5;
          const w0 = ((pb.x - px) * (pc.y - py) - (pb.y - py) * (pc.x - px)) / area;
          const w1 = ((pc.x - px) * (pa.y - py) - (pc.y - py) * (pa.x - px)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < eps || w1 < eps || w2 < eps) continue;
          const k = y * W + x;
          if (depth) {
            const z = pa.z * w0 + pb.z * w1 + pc.z * w2;
            if (z >= depth[k]) continue;
            depth[k] = z;
          }
          owner[k] = si + 1;
          if (lit) {
            const wx = A.v.world.x * w0 + B.v.world.x * w1 + C.v.world.x * w2;
            const wy = A.v.world.y * w0 + B.v.world.y * w1 + C.v.world.y * w2;
            const wz = A.v.world.z * w0 + B.v.world.z * w1 + C.v.world.z * w2;
            projectorCount[k] = counter.count(wx, wy, wz);
          } else {
            projectorCount[k] = 0;
          }
        }
      }
    }
  });

  // Per-screen stats from the final (top-most) owner of each pixel.
  const minX = new Array(screens.length).fill(Infinity);
  const minY = new Array(screens.length).fill(Infinity);
  const maxX = new Array(screens.length).fill(-Infinity);
  const maxY = new Array(screens.length).fill(-Infinity);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const o = owner[k];
      if (!o) continue;
      const s = o - 1;
      screens[s].pixels++;
      if (projectorCount[k] >= 2) screens[s].blendPixels++;
      if (x < minX[s]) minX[s] = x;
      if (x > maxX[s]) maxX[s] = x;
      if (y < minY[s]) minY[s] = y;
      if (y > maxY[s]) maxY[s] = y;
    }
  }
  screens.forEach((s, i) => {
    if (s.pixels > 0) s.bbox = { x: minX[i], y: minY[i], w: maxX[i] - minX[i] + 1, h: maxY[i] - minY[i] + 1 };
  });

  return {
    mappingName: mapping.name,
    kindLabel: MAPPING_KIND_LABEL[mapping.kind],
    width: W,
    height: H,
    owner,
    projectorCount,
    screens,
    projectorsChecked: counter.n,
  };
}

/** One row per screen: where it sits on the canvas, for content makers and media servers. */
export function contentTemplateCsv(t: ContentTemplate): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [
    ['screen', 'type', 'x_px', 'y_px', 'width_px', 'height_px', 'pixels', 'blend_zone_pixels', 'physical_size'].join(','),
  ];
  for (const s of t.screens) {
    const b = s.bbox;
    rows.push(
      [q(s.name), s.type, b ? b.x : '', b ? b.y : '', b ? b.w : '', b ? b.h : '', s.pixels, s.blendPixels, q(s.physical)].join(','),
    );
  }
  return `# ${t.mappingName} (${t.kindLabel}), canvas ${t.width} x ${t.height} px, origin top-left\n${rows.join('\n')}\n`;
}

export function templateFileBase(t: ContentTemplate): string {
  const name = t.mappingName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'mapping';
  return `${name}-template-${t.width}x${t.height}`;
}
