import * as THREE from 'three';
import type { GridWarp, ProjectorConfig } from '../types';
import { tessellateGrid } from '../warp/gridWarp';

/**
 * v10 grid warp → inverse map textures for the projection shader.
 *
 * The tessellated warp mesh is drawn in raster space (vertex position = where a
 * source point lands); each texel stores `sourceUv − rasterUv` in RG and coverage in
 * A. The shader reads it with texelFetch + manual bilinear, so viewport, output
 * windows, multiview and PNG export all see the same warp. Storing the offset (not
 * the absolute UV) keeps an untouched grid exactly the identity. Where triangles
 * overlap (a folded grid) the one drawn last wins, like the CPU GridInverse.
 */

/** Longest edge of a warp map in texels. */
export const GRID_MAP_LONG_EDGE = 1024;

const VERT = /* glsl */ `
in vec2 position;
in vec2 srcUv;
out vec2 vOffset;
void main() {
  vOffset = srcUv - position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
in vec2 vOffset;
out vec4 fragColor;
void main() {
  fragColor = vec4(vOffset, 0.0, 1.0);
}
`;

interface Entry {
  key: string;
  target: THREE.WebGLRenderTarget;
}

export function gridMapSize(resolution: { width: number; height: number }): { w: number; h: number } {
  const aspect = Math.max(1e-3, resolution.width / Math.max(1, resolution.height));
  return aspect >= 1
    ? { w: GRID_MAP_LONG_EDGE, h: Math.max(2, Math.round(GRID_MAP_LONG_EDGE / aspect)) }
    : { w: Math.max(2, Math.round(GRID_MAP_LONG_EDGE * aspect)), h: GRID_MAP_LONG_EDGE };
}

function gridKey(grid: GridWarp, size: { w: number; h: number }): string {
  let s = `${grid.cols}x${grid.rows}:${grid.interpolation}:${size.w}x${size.h}:`;
  for (const p of grid.points) s += `${p.x},${p.y};`;
  return s;
}

export class GridWarpMaps {
  private entries = new Map<string, Entry>();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly type: THREE.TextureDataType;

  constructor(private renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext();
    // Full float keeps sub-pixel accuracy on 4K rasters; half float is the fallback.
    this.type = gl.getExtension('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
  }

  /** Warp map per projector slot: null unless that projector uses the grid mode. */
  texturesFor(projectors: readonly ProjectorConfig[]): (THREE.Texture | null)[] {
    return projectors.map((p) =>
      p.warp?.mode === 'grid' ? this.mapFor(p.id, p.warp.grid, p.optics.resolution).texture : null,
    );
  }

  /** Free maps of projectors that are gone or no longer grid-warped. */
  prune(projectors: readonly ProjectorConfig[]): void {
    const live = new Set(projectors.filter((p) => p.warp?.mode === 'grid').map((p) => p.id));
    for (const [id, entry] of this.entries) {
      if (live.has(id)) continue;
      entry.target.dispose();
      this.entries.delete(id);
    }
  }

  private mapFor(id: string, grid: GridWarp, resolution: { width: number; height: number }): THREE.WebGLRenderTarget {
    const size = gridMapSize(resolution);
    const key = gridKey(grid, size);
    let entry = this.entries.get(id);
    if (entry && entry.key === key) return entry.target;
    if (!entry || entry.target.width !== size.w || entry.target.height !== size.h) {
      entry?.target.dispose();
      const target = new THREE.WebGLRenderTarget(size.w, size.h, {
        type: this.type,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
      entry = { key: '', target };
      this.entries.set(id, entry);
    }
    this.draw(grid, entry.target);
    entry.key = key;
    return entry.target;
  }

  private draw(grid: GridWarp, target: THREE.WebGLRenderTarget): void {
    const mesh = tessellateGrid(grid);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 2));
    geometry.setAttribute('srcUv', new THREE.BufferAttribute(mesh.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    const object = new THREE.Mesh(geometry, this.material);
    object.frustumCulled = false;
    this.scene.add(object);

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevClear = r.getClearColor(new THREE.Color());
    const prevAlpha = r.getClearAlpha();
    const prevAutoClear = r.autoClear;
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.autoClear = false;
    r.render(this.scene, this.camera);
    r.autoClear = prevAutoClear;
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevClear, prevAlpha);

    this.scene.remove(object);
    geometry.dispose();
  }

  dispose(): void {
    for (const e of this.entries.values()) e.target.dispose();
    this.entries.clear();
    this.material.dispose();
  }
}
