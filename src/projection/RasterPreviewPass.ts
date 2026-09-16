import * as THREE from 'three';
import vert from './shaders/projection.vert.glsl?raw';
import frag from './shaders/rasterPreview.frag.glsl?raw';
import type { ContentCanvas, ProjectorConfig, SceneObject } from '../types';
import { DEFAULT_BLEND_GAMMA, MAX_BLEND_GAMMA, MIN_BLEND_GAMMA } from '../types';
import { mediaTextureCache } from '../media';
import { getDeviceProfile, type DeviceProfile } from '../ui/deviceProfile';
import { buildProjectorCamera, getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import { fitModeToInt, patternToInt } from './ProjectiveMaterial';
import {
  buildScreenMapUniforms,
  resolveSharedCanvasSupport,
} from './sharedCanvasMapping';
import { RASTER_PREVIEW_INTERVAL_MS, rasterPreviewSize } from './rasterPreview';

interface PreviewSlot {
  target: THREE.WebGLRenderTarget;
  canvas: HTMLCanvasElement;
  pixels: Uint8Array;
}

export class RasterPreviewPass {
  private readonly material: THREE.ShaderMaterial;
  private readonly fallback: THREE.DataTexture;
  private readonly slots = new Map<string, PreviewSlot>();
  private lastUpdate = 0;
  private pixelScratch: Uint8ClampedArray | null = null;

  constructor() {
    this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    this.fallback.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        projectorMatrix: { value: new THREE.Matrix4() },
        mediaMap: { value: this.fallback },
        canvasMap: { value: this.fallback },
        useContentCanvas: { value: 0 },
        useMediaTexture: { value: 0 },
        patternType: { value: 0 },
        fitMode: { value: 0 },
        mediaAspect: { value: 1 },
        rasterAspect: { value: 16 / 9 },
        projectorColor: { value: new THREE.Color('#ffffff') },
        brightness: { value: 1 },
        blendEdges: { value: new THREE.Vector4() },
        outerEdgeFade: { value: 0 },
        blendGamma: { value: DEFAULT_BLEND_GAMMA },
        screenMapKind: { value: 0 },
        screenMapMatrixInv: { value: new THREE.Matrix4() },
        screenMapParams: { value: new THREE.Vector4(1, 1, 90, 0) },
        projectionSides: { value: 0 },
      },
      vertexShader: vert,
      fragmentShader: frag,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  }

  getCanvas(projectorId: string): HTMLCanvasElement | null {
    return this.slots.get(projectorId)?.canvas ?? null;
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    projectors: ProjectorConfig[],
    sceneObjects: SceneObject[],
    meshes: THREE.Mesh[],
    contentCanvas: ContentCanvas,
    canvasTexture: THREE.Texture,
    force = false,
    profile: DeviceProfile = getDeviceProfile(),
  ): boolean {
    const now = performance.now();
    if (!force && now - this.lastUpdate < RASTER_PREVIEW_INTERVAL_MS) return false;
    this.lastUpdate = now;

    const enabled = projectors.filter((p) => p.enabled).slice(0, 4);
    const keep = new Set(enabled.map((p) => p.id));
    for (const [id, slot] of this.slots) {
      if (!keep.has(id)) {
        slot.target.dispose();
        this.slots.delete(id);
      }
    }

    const prevTarget = renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevScissor = renderer.getScissorTest();
    const prevScissorBox = new THREE.Vector4();
    renderer.getScissor(prevScissorBox);
    const prevViewport = new THREE.Vector4();
    renderer.getViewport(prevViewport);

    const savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    for (const mesh of meshes) {
      savedMaterials.set(mesh, mesh.material);
      mesh.material = this.material;
    }

    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    renderer.setScissorTest(false);
    scene.overrideMaterial = null;

    try {
      const maxTexture = renderer.capabilities.maxTextureSize;
      for (const projector of enabled) {
        this.applyUniforms(projector, sceneObjects, contentCanvas, canvasTexture);
        const size = rasterPreviewSize(projector.optics.aspectRatio, profile, maxTexture);
        const slot = this.ensureSlot(projector.id, size.width, size.height);
        const camera = buildProjectorCamera(
          projector.optics,
          getProjectorWorldMatrix(projector),
        );
        renderer.setRenderTarget(slot.target);
        renderer.clear();
        for (const mesh of meshes) {
          this.material.uniforms.projectionSides.value = mesh.userData.projectionSides ?? 0;
          renderer.render(mesh, camera);
        }
        this.blitToCanvas(renderer, slot);
      }
    } finally {
      for (const [mesh, material] of savedMaterials) {
        mesh.material = material;
      }
      scene.overrideMaterial = prevOverride;
      renderer.setRenderTarget(prevTarget);
      renderer.setViewport(prevViewport);
      renderer.autoClear = prevAutoClear;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setScissorTest(prevScissor);
      renderer.setScissor(prevScissorBox);
    }
    return true;
  }

  disposeProjector(id: string): void {
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
    for (const slot of this.slots.values()) slot.target.dispose();
    this.slots.clear();
    this.material.dispose();
    this.fallback.dispose();
  }

  private applyUniforms(
    projector: ProjectorConfig,
    sceneObjects: SceneObject[],
    contentCanvas: ContentCanvas,
    canvasTexture: THREE.Texture,
  ): void {
    const worldMatrix = getProjectorWorldMatrix(projector);
    const u = this.material.uniforms;
    u.projectorMatrix.value.copy(getProjectorViewProjectionMatrix(projector.optics, worldMatrix));
    u.brightness.value = projector.brightness;
    u.patternType.value = patternToInt(projector.testPattern);
    u.rasterAspect.value = projector.optics.aspectRatio;
    (u.projectorColor.value as THREE.Color).set(projector.color);
    (u.blendEdges.value as THREE.Vector4).set(
      projector.blendEdges.left,
      projector.blendEdges.right,
      projector.blendEdges.top,
      projector.blendEdges.bottom,
    );
    u.outerEdgeFade.value = projector.outerEdgeFade ? 1 : 0;
    u.blendGamma.value = Math.min(
      MAX_BLEND_GAMMA,
      Math.max(MIN_BLEND_GAMMA, projector.blendGamma ?? DEFAULT_BLEND_GAMMA),
    );

    const support = resolveSharedCanvasSupport(sceneObjects);
    const canvasActive = contentCanvas.enabled && support.supported;
    u.useContentCanvas.value = canvasActive ? 1 : 0;
    u.canvasMap.value = canvasActive ? canvasTexture : this.fallback;
    if (support.supported && support.primaryReceiver) {
      const map = buildScreenMapUniforms(support.primaryReceiver, support.mapKind);
      u.screenMapKind.value = map.mapKind;
      (u.screenMapMatrixInv.value as THREE.Matrix4).copy(map.matrixInv);
      (u.screenMapParams.value as THREE.Vector4).copy(map.params);
    } else {
      u.screenMapKind.value = 0;
    }

    const useMedia =
      (projector.mediaSource === 'image' || projector.mediaSource === 'video') &&
      projector.mediaAssetId;
    if (useMedia) {
      const entry = mediaTextureCache.get(projector.mediaAssetId!);
      if (entry) {
        u.useMediaTexture.value = 1;
        u.mediaMap.value = entry.texture;
        u.mediaAspect.value = entry.aspect;
        u.fitMode.value = fitModeToInt(projector.mediaFit);
      } else {
        u.useMediaTexture.value = 0;
      }
    } else {
      u.useMediaTexture.value = 0;
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
      target.texture.colorSpace = THREE.SRGBColorSpace;
      const canvas = slot?.canvas ?? document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      slot = { target, canvas, pixels: new Uint8Array(width * height * 4) };
      this.slots.set(id, slot);
    }
    return slot;
  }

  private blitToCanvas(renderer: THREE.WebGLRenderer, slot: PreviewSlot): void {
    const { width, height } = slot.target;
    const needed = width * height * 4;
    if (slot.pixels.length !== needed) slot.pixels = new Uint8Array(needed);
    renderer.readRenderTargetPixels(slot.target, 0, 0, width, height, slot.pixels);
    const ctx = slot.canvas.getContext('2d');
    if (!ctx) return;
    if (!this.pixelScratch || this.pixelScratch.length !== needed) {
      this.pixelScratch = new Uint8ClampedArray(needed);
    }
    const dst = this.pixelScratch;
    const src = slot.pixels;
    const row = width * 4;
    for (let y = 0; y < height; y++) {
      dst.set(src.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    }
    ctx.putImageData(new ImageData(dst, width, height), 0, 0);
  }

}
