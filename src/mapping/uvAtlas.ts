import * as THREE from 'three';

/**
 * Screen textures are baked in each mesh's UV layout, so UVs must not overlap
 * (and should stay inside 0–1). Imported models often reuse UV space (mirrored /
 * tiled textures); these helpers measure that and can generate a fresh,
 * non-overlapping atlas.
 */

export interface UvReport {
  /** Share of covered UV area painted by more than one triangle (0–1). */
  overlap: number;
  /** Share of triangles with UVs outside 0–1 (they get no screen texture). */
  outside: number;
  /** Mesh has no UVs at all. */
  missing: boolean;
}

export interface UvTriangleSource {
  uv: ArrayLike<number> | null;
  index: ArrayLike<number> | null;
  vertexCount: number;
}

/** Rasterize UV triangles on a grid and count cells hit more than once. */
export function measureUvOverlap(sources: UvTriangleSource[], grid = 256): UvReport {
  const cells = new Uint8Array(grid * grid);
  let triangles = 0;
  let outside = 0;
  let missing = false;
  for (const src of sources) {
    if (!src.uv) {
      missing = true;
      continue;
    }
    const uv = src.uv;
    const count = src.index ? src.index.length : src.vertexCount;
    for (let t = 0; t + 2 < count; t += 3) {
      const ids = [0, 1, 2].map((k) => (src.index ? src.index[t + k] : t + k));
      const p = ids.map((i) => [uv[i * 2], uv[i * 2 + 1]] as const);
      triangles += 1;
      if (p.some(([u, v]) => u < -1e-4 || u > 1.0001 || v < -1e-4 || v > 1.0001)) {
        outside += 1;
        continue;
      }
      rasterize(p, grid, cells);
    }
  }
  let covered = 0;
  let multi = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] > 0) covered += 1;
    if (cells[i] > 1) multi += 1;
  }
  return {
    overlap: covered > 0 ? multi / covered : 0,
    outside: triangles > 0 ? outside / triangles : 0,
    missing,
  };
}

function rasterize(p: (readonly [number, number])[], grid: number, cells: Uint8Array): void {
  const xs = p.map((q) => q[0] * grid);
  const ys = p.map((q) => q[1] * grid);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(grid - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(grid - 1, Math.ceil(Math.max(...ys)));
  const area = (xs[1] - xs[0]) * (ys[2] - ys[0]) - (xs[2] - xs[0]) * (ys[1] - ys[0]);
  if (Math.abs(area) < 1e-9) return;
  const edge = (ax: number, ay: number, bx: number, by: number, x: number, y: number) =>
    (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const cx = x + 0.5;
      const cy = y + 0.5;
      const w0 = edge(xs[1], ys[1], xs[2], ys[2], cx, cy);
      const w1 = edge(xs[2], ys[2], xs[0], ys[0], cx, cy);
      const w2 = edge(xs[0], ys[0], xs[1], ys[1], cx, cy);
      const inside = area > 0 ? w0 >= 0 && w1 >= 0 && w2 >= 0 : w0 <= 0 && w1 <= 0 && w2 <= 0;
      if (inside) {
        const i = y * grid + x;
        if (cells[i] < 255) cells[i] += 1;
      }
    }
  }
}

export function uvReportForMeshes(meshes: THREE.Mesh[]): UvReport {
  return measureUvOverlap(
    meshes.map((m) => {
      const uv = m.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
      const index = m.geometry.getIndex();
      return {
        uv: uv ? Float32Array.from({ length: uv.count * 2 }, (_, k) => (k % 2 === 0 ? uv.getX(k >> 1) : uv.getY(k >> 1))) : null,
        index: index ? index.array : null,
        vertexCount: m.geometry.getAttribute('position').count,
      };
    }),
  );
}

interface Island {
  mesh: number;
  triangles: number[];
  axis: number;
  minU: number;
  minV: number;
  maxU: number;
  maxV: number;
}

/** Project a point onto the plane of its dominant axis (0..5 = +X −X +Y −Y +Z −Z), keeping orientation. */
function project(axis: number, x: number, y: number, z: number): [number, number] {
  switch (axis) {
    case 0:
      return [-z, y];
    case 1:
      return [z, y];
    case 2:
      return [x, -z];
    case 3:
      return [x, z];
    case 4:
      return [x, y];
    default:
      return [-x, y];
  }
}

/**
 * Replace the meshes' UVs with a non-overlapping atlas: triangles are grouped into
 * islands (connected, facing the same axis), each island is projected flat along
 * that axis and the islands are shelf-packed into 0–1 at one common scale. The
 * geometries are converted to non-indexed copies (callers own them).
 */
export function applyUvAtlas(meshes: THREE.Mesh[], root: THREE.Object3D, padding = 0.004): void {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  const local: Float32Array[] = [];
  const islands: Island[] = [];

  meshes.forEach((mesh, mi) => {
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    mesh.geometry = geo;
    const pos = geo.getAttribute('position');
    const m = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
    const pts = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      pts.set([v.x, v.y, v.z], i * 3);
    }
    local.push(pts);
    const triCount = Math.floor(pos.count / 3);
    const axes = new Int8Array(triCount);
    for (let t = 0; t < triCount; t++) {
      a.fromArray(pts, t * 9);
      b.fromArray(pts, t * 9 + 3);
      c.fromArray(pts, t * 9 + 6);
      n.subVectors(b, a).cross(c.clone().sub(a));
      const ax = Math.abs(n.x);
      const ay = Math.abs(n.y);
      const az = Math.abs(n.z);
      axes[t] = ax >= ay && ax >= az ? (n.x >= 0 ? 0 : 1) : ay >= az ? (n.y >= 0 ? 2 : 3) : n.z >= 0 ? 4 : 5;
    }
    // Union triangles that share a vertex position and face the same axis.
    const parent = Int32Array.from({ length: triCount }, (_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };
    const seen = new Map<string, number>();
    for (let t = 0; t < triCount; t++) {
      for (let k = 0; k < 3; k++) {
        const o = t * 9 + k * 3;
        const key = `${axes[t]}|${Math.round(pts[o] * 1e4)},${Math.round(pts[o + 1] * 1e4)},${Math.round(pts[o + 2] * 1e4)}`;
        const other = seen.get(key);
        if (other === undefined) seen.set(key, t);
        else parent[find(t)] = find(other);
      }
    }
    const groups = new Map<number, number[]>();
    for (let t = 0; t < triCount; t++) {
      const r = find(t);
      const list = groups.get(r);
      if (list) list.push(t);
      else groups.set(r, [t]);
    }
    for (const tris of groups.values()) {
      const axis = axes[tris[0]];
      const island: Island = { mesh: mi, triangles: tris, axis, minU: Infinity, minV: Infinity, maxU: -Infinity, maxV: -Infinity };
      for (const t of tris) {
        for (let k = 0; k < 3; k++) {
          const o = t * 9 + k * 3;
          const [u, w] = project(axis, pts[o], pts[o + 1], pts[o + 2]);
          island.minU = Math.min(island.minU, u);
          island.maxU = Math.max(island.maxU, u);
          island.minV = Math.min(island.minV, w);
          island.maxV = Math.max(island.maxV, w);
        }
      }
      islands.push(island);
    }
  });

  // Shelf-pack island boxes (world units), tallest first.
  const sized = islands.map((isl) => ({ isl, w: Math.max(1e-6, isl.maxU - isl.minU), h: Math.max(1e-6, isl.maxV - isl.minV) }));
  sized.sort((p, q) => q.h - p.h);
  const totalArea = sized.reduce((s, x) => s + x.w * x.h, 0);
  const pack = (rowWidth: number) => {
    const pad = padding * rowWidth;
    let x = 0;
    let y = 0;
    let rowH = 0;
    let width = 0;
    const placed = sized.map((s) => {
      if (x > 0 && x + s.w > rowWidth) {
        y += rowH + pad;
        x = 0;
        rowH = 0;
      }
      const at = { x, y };
      x += s.w + pad;
      width = Math.max(width, x);
      rowH = Math.max(rowH, s.h);
      return at;
    });
    return { placed, size: Math.max(width, y + rowH) };
  };
  const widest = sized.reduce((m, s) => Math.max(m, s.w), 0);
  let best = pack(Math.max(widest, Math.sqrt(totalArea) * 1.05));
  for (const f of [0.9, 1.2, 1.4]) {
    const tryPack = pack(Math.max(widest, Math.sqrt(totalArea) * f));
    if (tryPack.size < best.size) best = tryPack;
  }
  const scale = 1 / Math.max(1e-9, best.size * (1 + 2 * padding));
  const offset = padding;

  const uvArrays = meshes.map((mesh) => new Float32Array(mesh.geometry.getAttribute('position').count * 2));
  sized.forEach(({ isl }, k) => {
    const at = best.placed[k];
    const pts = local[isl.mesh];
    const uvs = uvArrays[isl.mesh];
    for (const t of isl.triangles) {
      for (let j = 0; j < 3; j++) {
        const vi = t * 3 + j;
        const [u, w] = project(isl.axis, pts[vi * 3], pts[vi * 3 + 1], pts[vi * 3 + 2]);
        uvs[vi * 2] = offset + (at.x + (u - isl.minU)) * scale;
        uvs[vi * 2 + 1] = offset + (at.y + (w - isl.minV)) * scale;
      }
    }
  });
  meshes.forEach((mesh, i) => {
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uvArrays[i], 2));
  });
}
