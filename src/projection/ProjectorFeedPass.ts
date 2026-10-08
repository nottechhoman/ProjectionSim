import * as THREE from 'three';
import type { ProjectorConfig } from '../types';
import { getDeviceProfile, type DeviceProfile } from '../ui/deviceProfile';
import { buildProjectorCamera } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import { createMultiProjectiveMaterial } from './MultiProjectiveMaterial';
import { RASTER_PREVIEW_INTERVAL_MS, rasterPreviewSize } from './rasterPreview';

/** colour = what the projector is fed (content × signal-space blend mask); mask = mask only. */
export type FeedKind = 'color' | 'mask';
type RenderKind = FeedKind | 'content';

interface PreviewSlot {
  target: THREE.WebGLRenderTarget;
  canvas: HTMLCanvasElement;
  pixels: Uint8Array;
}

/**
 * Projector feed renderer.
 *
 * v4 content feed: the baked screen textures rendered from each projector's own
 * (unwarped) camera — what the projector is asked to show before blend and warp.
 *
 * Output feed (previews, output windows, exports): the content feed through the
 * corner-pin warp, times the blend mask (auto blend weights depend on every other
 * projector), rendered with the same unified shader as the viewport.
 */
export class ProjectorFeedPass {
  private readonly contentTargets = new Map<string, THREE.WebGLRenderTarget>();
  private readonly material = createMultiProjectiveMaterial();
  /** Full-target quad for the raw-mapping full-frame background. */
  private readonly frameQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
  private readonly frameCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
  private readonly slots = new Map<string, PreviewSlot>();
  private lastUpdate = 0;

  contentTexture(projectorId: string): THREE.Texture | null {
    return this.contentTargets.get(projectorId)?.texture ?? null;
  }

  /** Render one projector's content feed (textured screens seen from its camera). */
  renderContentFeed(
    renderer: THREE.WebGLRenderer,
    projector: ProjectorConfig,
    index: number,
    meshes: THREE.Mesh[],
    prepare: (material: THREE.ShaderMaterial) => void,
    maxLongEdge: number,
  ): THREE.Texture {
    const cap = Math.min(maxLongEdge, renderer.capabilities.maxTextureSize);
    const { width: rw, height: rh } = projector.optics.resolution;
    const scale = Math.min(1, cap / Math.max(rw, rh));
    const width = Math.max(1, Math.round(rw * scale));
    const height = Math.max(1, Math.round(rh * scale));
    let target = this.contentTargets.get(projector.id);
    if (!target || target.width !== width || target.height !== height) {
      target?.dispose();
      target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      this.contentTargets.set(projector.id, target);
    }
    prepare(this.material);
    this.renderInto(renderer, projector, index, 'content', meshes, target);
    return target.texture;
  }

  getCanvas(projectorId: string): HTMLCanvasElement | null {
    return this.slots.get(projectorId)?.canvas ?? null;
  }

  renderPreviews(
    renderer: THREE.WebGLRenderer,
    projectors: ProjectorConfig[],
    meshes: THREE.Mesh[],
    prepare: (material: THREE.ShaderMaterial) => void,
    force = false,
    profile: DeviceProfile = getDeviceProfile(),
  ): boolean {
    const now = performance.now();
    if (!force && now - this.lastUpdate < RASTER_PREVIEW_INTERVAL_MS) return false;
    this.lastUpdate = now;

    const keep = new Set(projectors.map((p) => p.id));
    this.retainContent(keep);
    for (const [id, slot] of this.slots) {
      if (!keep.has(id)) {
        slot.target.dispose();
        this.slots.delete(id);
      }
    }

    prepare(this.material);
    const maxTexture = renderer.capabilities.maxTextureSize;
    projectors.forEach((projector, index) => {
      const size = rasterPreviewSize(projector.optics.aspectRatio, profile, maxTexture);
      const slot = this.ensureSlot(projector.id, size.width, size.height);
      this.renderInto(renderer, projector, index, 'color', meshes, slot.target, true);
      this.blitToCanvas(renderer, slot.target, slot.canvas, slot);
    });
    return true;
  }

  /** Full-resolution (capped) feed or mask as a fresh canvas. */
  renderFull(
    renderer: THREE.WebGLRenderer,
    projectors: ProjectorConfig[],
    projectorId: string,
    kind: FeedKind,
    meshes: THREE.Mesh[],
    prepare: (material: THREE.ShaderMaterial) => void,
    maxLongEdge = 4096,
  ): HTMLCanvasElement | null {
    const index = projectors.findIndex((p) => p.id === projectorId);
    if (index < 0) return null;
    const projector = projectors[index];
    const cap = Math.min(maxLongEdge, renderer.capabilities.maxTextureSize);
    const { width: rw, height: rh } = projector.optics.resolution;
    const scale = Math.min(1, cap / Math.max(rw, rh));
    const width = Math.max(1, Math.round(rw * scale));
    const height = Math.max(1, Math.round(rh * scale));
    const target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    try {
      prepare(this.material);
      this.renderInto(renderer, projector, index, kind, meshes, target);
      this.blitToCanvas(renderer, target, canvas, null);
    } finally {
      target.dispose();
    }
    return canvas;
  }

  /** Render a feed / mask into a caller-owned target (used by output windows). */
  renderToTarget(
    renderer: THREE.WebGLRenderer,
    projectors: ProjectorConfig[],
    index: number,
    kind: FeedKind,
    meshes: THREE.Mesh[],
    prepare: (material: THREE.ShaderMaterial) => void,
    target: THREE.WebGLRenderTarget,
  ): void {
    const projector = projectors[index];
    if (!projector) return;
    prepare(this.material);
    this.renderInto(renderer, projector, index, kind, meshes, target);
  }

  /** Drop content feeds of projectors that are no longer composited. */
  retainContent(ids: Set<string>): void {
    for (const [id, target] of this.contentTargets) {
      if (!ids.has(id)) {
        target.dispose();
        this.contentTargets.delete(id);
      }
    }
  }

  disposeProjector(id: string): void {
    this.contentTargets.get(id)?.dispose();
    this.contentTargets.delete(id);
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.target.dispose();
    this.slots.delete(id);
  }

  releaseTargets(): void {
    for (const slot of this.slots.values()) slot.target.dispose();
    this.slots.clear();
    this.lastUpdate = 0;
  }

  dispose(): void {
    this.releaseTargets();
    this.retainContent(new Set());
    this.frameQuad.geometry.dispose();
    this.material.dispose();
  }

  private renderInto(
    renderer: THREE.WebGLRenderer,
    projector: ProjectorConfig,
    index: number,
    kind: RenderKind,
    meshes: THREE.Mesh[],
    target: THREE.WebGLRenderTarget,
    /** Preview only: dim spill and outline surfaces. Never used for real outputs. */
    view = false,
  ): void {
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevScissor = renderer.getScissorTest();
    const saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    for (const mesh of meshes) {
      saved.set(mesh, mesh.material);
      mesh.material = this.material;
    }
    this.material.uniforms.feedIndex.value = index;
    this.material.uniforms.feedKind.value = kind === 'mask' ? 1 : kind === 'content' ? 2 : 0;
    this.material.uniforms.previewKind.value = 0;
    this.material.uniforms.forceUvPreview.value = 0;
    this.material.uniforms.falloffPreview.value = 0;
    this.material.uniforms.feedSize.value.set(target.width, target.height);
    this.material.uniforms.feedView.value = view ? 1 : 0;
    // Output feeds start from the full warped frame (content displaced by the warp can
    // land off-surface); surfaces with their blend weights are drawn over it.
    const fullFrame = kind !== 'content';
    try {
      const camera = buildProjectorCamera(projector.optics, getProjectorWorldMatrix(projector));
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 1);
      renderer.setRenderTarget(target);
      renderer.clear();
      if (fullFrame) {
        this.frameQuad.position.set(0, 0, -1);
        this.frameQuad.updateMatrixWorld();
        this.material.uniforms.feedLayer.value = 1;
        renderer.render(this.frameQuad, this.frameCamera);
        renderer.clearDepth();
        this.material.uniforms.feedLayer.value = 2;
      } else {
        this.material.uniforms.feedLayer.value = 0;
        this.material.uniforms.feedView.value = 0;
      }
      for (const mesh of meshes) {
        if (!mesh.visible) continue;
        renderer.render(mesh, camera);
      }
    } finally {
      this.material.uniforms.feedLayer.value = 0;
      for (const [mesh, material] of saved) mesh.material = material;
      this.material.uniforms.feedIndex.value = -1;
      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAutoClear;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setScissorTest(prevScissor);
    }
  }

  private ensureSlot(id: string, width: number, height: number): PreviewSlot {
    let slot = this.slots.get(id);
    if (!slot || slot.target.width !== width || slot.target.height !== height) {
      slot?.target.dispose();
      const target = new THREE.WebGLRenderTarget(width, height, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
      const canvas = slot?.canvas ?? document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      slot = { target, canvas, pixels: new Uint8Array(width * height * 4) };
      this.slots.set(id, slot);
    }
    return slot;
  }

  private blitToCanvas(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    canvas: HTMLCanvasElement,
    slot: PreviewSlot | null,
  ): void {
    const { width, height } = target;
    const needed = width * height * 4;
    let src = slot?.pixels ?? new Uint8Array(needed);
    if (src.length !== needed) {
      src = new Uint8Array(needed);
      if (slot) slot.pixels = src;
    }
    renderer.readRenderTargetPixels(target, 0, 0, width, height, src);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(width, height);
    const row = width * 4;
    for (let y = 0; y < height; y++) {
      image.data.set(src.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    }
    ctx.putImageData(image, 0, 0);
  }
}
