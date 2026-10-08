import * as THREE from 'three';
import bakeVert from './shaders/bake.vert.glsl?raw';
import bakeFrag from './shaders/bake.frag.glsl?raw';
import type { Layer, LayerBlendMode, Mapping, MappingFiltering, ProjectorConfig, SceneObject } from '../types';
import type { DeviceProfile } from '../ui/deviceProfile';
import type { LiveLayer } from '../playback/evaluate';
import { mediaTextureCache } from '../media';
import { PROJECTION_INT, WRAP_INT, type SurfaceUvFrame } from '../uvmapping/surfaceUv';
import { mappingResolution, screenAspect } from './model';
import {
  DIRECT_FIT_INT,
  hexToRgb,
  LAYER_FIT_INT,
  MAPPING_KIND_INT,
  mappingMatrix,
  mappingVisibleTo,
  PATTERN_INT,
} from './sample';

/** One screen: a scene object whose meshes share one texture (its UV layout). */
export interface BakeSurface {
  obj: SceneObject;
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  /** Fitted bounds frame for Feed planar / cylindrical / spherical projections. */
  frame: SurfaceUvFrame;
}

export const SCREEN_TEXTURE_MAX: Record<DeviceProfile, number> = { phone: 1024, tablet: 1536, desktop: 2048 };

/** Screen texture size: its Direct mapping's canvas (or LED pixels), else its aspect at the device cap. */
export function screenTextureSize(
  obj: SceneObject,
  mappings: Mapping[],
  maxDim: number,
): { w: number; h: number } {
  let w: number;
  let h: number;
  const direct = mappings.find((m) => m.kind === 'direct' && m.screenIds.includes(obj.id));
  if (obj.type === 'ledWall' && obj.ledWall) {
    w = obj.ledWall.pixelResolution.width;
    h = obj.ledWall.pixelResolution.height;
  } else if (direct && (direct.direct?.fit ?? 'stretch') === 'stretch') {
    w = direct.resolution.w;
    h = direct.resolution.h;
  } else {
    const aspect = screenAspect(obj);
    w = aspect >= 1 ? maxDim : maxDim * aspect;
    h = aspect >= 1 ? maxDim / aspect : maxDim;
  }
  const scale = Math.min(1, maxDim / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

const BLEND_INT: Record<LayerBlendMode, number> = { normal: 0, add: 1, multiply: 2 };
const FILTER_INT: Record<MappingFiltering, number> = { nearest: 0, bilinear: 1, msaa2x: 2 };

function setBlend(material: THREE.ShaderMaterial, mode: LayerBlendMode): void {
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  material.blendEquationAlpha = THREE.AddEquation;
  if (mode === 'add') {
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneFactor;
  } else if (mode === 'multiply') {
    material.blendSrc = THREE.DstColorFactor;
    material.blendDst = THREE.ZeroFactor;
  } else {
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
  }
}

/**
 * v4: bakes each screen's texture for the frame — its live layers composited
 * bottom to top, each sampled through its layer's mapping. Projectors then render
 * these textured screens from their own camera (see ProjectorFeedPass).
 */
export class ScreenTextureBaker {
  private readonly targets = new Map<string, THREE.WebGLRenderTarget>();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  private readonly rootInv = new THREE.Matrix4();
  readonly material: THREE.ShaderMaterial;
  private mediaFor?: (layer: Layer) => { texture: THREE.Texture; aspect: number } | null;

  constructor() {
    this.fallback.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: bakeVert,
      fragmentShader: bakeFrag,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        mapKind: { value: 0 },
        mapMatrix: { value: new THREE.Matrix4() },
        mapParams: { value: new THREE.Vector4(1, 1, 0, 0) },
        mapRes: { value: new THREE.Vector2(1920, 1080) },
        directFit: { value: 0 },
        screenAspect: { value: 16 / 9 },
        screenTexSize: { value: new THREE.Vector2(1, 1) },
        surfProj: { value: 0 },
        surfAxes: { value: 0 },
        surfRootInv: { value: new THREE.Matrix4() },
        surfBoundsMin: { value: new THREE.Vector3() },
        surfBoundsSize: { value: new THREE.Vector3(1, 1, 1) },
        surfTheta: { value: new THREE.Vector3(0, -Math.PI, Math.PI) },
        surfPhi: { value: new THREE.Vector2(-Math.PI / 2, Math.PI / 2) },
        surfRegion: { value: new THREE.Vector4(0, 0, 1, 1) },
        surfXform: { value: new THREE.Vector4() },
        surfRepeat: { value: new THREE.Vector2(1, 1) },
        mediaKind: { value: 0 },
        mediaMap: { value: this.fallback },
        mediaAspect: { value: 1 },
        patternType: { value: 0 },
        layerColor: { value: new THREE.Color(1, 1, 1) },
        layerRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        layerRot: { value: 0 },
        layerFit: { value: 0 },
        layerOpacity: { value: 1 },
        blendMode: { value: 0 },
        filterMode: { value: 1 },
        maskMap: { value: this.fallback },
        hasMask: { value: 0 },
      },
    });
  }

  texture(objectId: string): THREE.Texture | null {
    return this.targets.get(objectId)?.texture ?? null;
  }

  /** Free textures of screens that no longer exist. */
  retain(objectIds: Set<string>): void {
    for (const [id, target] of this.targets) {
      if (!objectIds.has(id)) {
        target.dispose();
        this.targets.delete(id);
      }
    }
  }

  bake(
    renderer: THREE.WebGLRenderer,
    surfaces: BakeSurface[],
    live: LiveLayer[],
    mappings: Mapping[],
    projectors: ProjectorConfig[],
    forProjectorId: string | null,
    maxDim: number,
    mediaFor?: (layer: Layer) => { texture: THREE.Texture; aspect: number } | null,
  ): void {
    this.mediaFor = mediaFor;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const mappingById = new Map(mappings.map((m) => [m.id, m]));
    const matrices = new Map<string, THREE.Matrix4>();
    const u = this.material.uniforms;
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    try {
      for (const surface of surfaces) {
        const { obj } = surface;
        const size = screenTextureSize(obj, mappings, maxDim);
        const target = this.ensureTarget(obj.id, size.w, size.h);
        renderer.setRenderTarget(target);
        renderer.clear();
        u.screenAspect.value = screenAspect(obj);
        (u.screenTexSize.value as THREE.Vector2).set(size.w, size.h);
        this.applySurfaceFrame(surface);
        for (const entry of live) {
          const mapping = entry.layer.mappingId ? mappingById.get(entry.layer.mappingId) : undefined;
          if (!mapping || entry.opacity <= 0 || !mapping.screenIds.includes(obj.id)) continue;
          if (!mappingVisibleTo(mapping, forProjectorId)) continue;
          if (!this.applyLayer(entry, mapping, projectors, matrices, obj.id)) continue;
          for (const mesh of surface.meshes) this.drawMesh(renderer, mesh);
        }
      }
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAutoClear;
      renderer.setClearColor(prevClear, prevAlpha);
    }
  }

  dispose(): void {
    for (const target of this.targets.values()) target.dispose();
    this.targets.clear();
    this.material.dispose();
    this.fallback.dispose();
  }

  private drawMesh(renderer: THREE.WebGLRenderer, mesh: THREE.Mesh): void {
    const savedMaterial = mesh.material;
    const savedCull = mesh.frustumCulled;
    const savedVisible = mesh.visible;
    mesh.material = this.material;
    mesh.frustumCulled = false;
    mesh.visible = true;
    this.material.uniformsNeedUpdate = true;
    try {
      renderer.render(mesh, this.camera);
    } finally {
      mesh.material = savedMaterial;
      mesh.frustumCulled = savedCull;
      mesh.visible = savedVisible;
    }
  }

  private ensureTarget(id: string, w: number, h: number): THREE.WebGLRenderTarget {
    let target = this.targets.get(id);
    if (!target || target.width !== w || target.height !== h) {
      target?.dispose();
      target = new THREE.WebGLRenderTarget(w, h, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        depthBuffer: false,
      });
      // sRGB storage keeps 8-bit darks smooth; blending still happens in linear.
      target.texture.colorSpace = THREE.SRGBColorSpace;
      this.targets.set(id, target);
    }
    return target;
  }

  private applySurfaceFrame(surface: BakeSurface): void {
    const u = this.material.uniforms;
    const f = surface.frame;
    surface.root.updateMatrixWorld(true);
    (u.surfRootInv.value as THREE.Matrix4).copy(this.rootInv.copy(surface.root.matrixWorld).invert());
    (u.surfBoundsMin.value as THREE.Vector3).set(f.boundsMin.x, f.boundsMin.y, f.boundsMin.z);
    (u.surfBoundsSize.value as THREE.Vector3).set(f.boundsSize.x, f.boundsSize.y, f.boundsSize.z);
    (u.surfTheta.value as THREE.Vector3).set(f.thetaRef, f.thetaMin, f.thetaMax);
    (u.surfPhi.value as THREE.Vector2).set(f.phiMin, f.phiMax);
    u.surfAxes.value = f.planarAxes;
  }

  /** Set mapping + layer uniforms; false when the layer has nothing to draw. */
  private applyLayer(
    entry: LiveLayer,
    mapping: Mapping,
    projectors: ProjectorConfig[],
    matrices: Map<string, THREE.Matrix4>,
    screenId: string,
  ): boolean {
    const u = this.material.uniforms;
    const { layer } = entry;
    const media = layer.media;
    if (media.kind === 'image' || media.kind === 'video') {
      const loaded = this.mediaFor?.(layer) ?? (media.assetId ? mediaTextureCache.get(media.assetId) : undefined);
      if (!loaded) return false;
      u.mediaKind.value = 1;
      u.mediaMap.value = loaded.texture;
      u.mediaAspect.value = loaded.aspect;
      u.layerFit.value = LAYER_FIT_INT[layer.fit];
    } else {
      u.mediaKind.value = media.kind === 'pattern' ? 2 : 3;
      u.mediaMap.value = this.fallback;
      u.mediaAspect.value = 0;
      u.layerFit.value = LAYER_FIT_INT.stretch;
      if (media.kind === 'pattern') u.patternType.value = PATTERN_INT[media.pattern];
      (u.layerColor.value as THREE.Color).setRGB(...hexToRgb(media.color));
    }
    (u.layerRect.value as THREE.Vector4).set(layer.rect.x, layer.rect.y, layer.rect.width, layer.rect.height);
    u.layerRot.value = THREE.MathUtils.degToRad(layer.rect.rotationDeg);
    u.layerOpacity.value = entry.opacity;
    u.blendMode.value = BLEND_INT[layer.blendMode];
    setBlend(this.material, layer.blendMode);

    const res = mappingResolution(mapping, projectors);
    (u.mapRes.value as THREE.Vector2).set(res.w, res.h);
    u.filterMode.value = FILTER_INT[mapping.filtering];
    const mask = mapping.maskAssetId ? mediaTextureCache.get(mapping.maskAssetId) : undefined;
    u.hasMask.value = mask ? 1 : 0;
    u.maskMap.value = mask ? mask.texture : this.fallback;
    u.mapKind.value = MAPPING_KIND_INT[mapping.kind];
    let matrix = matrices.get(mapping.id);
    if (!matrix) {
      matrix = mappingMatrix(mapping, projectors);
      matrices.set(mapping.id, matrix);
    }
    (u.mapMatrix.value as THREE.Matrix4).copy(matrix);
    const params = u.mapParams.value as THREE.Vector4;
    if (mapping.kind === 'direct') {
      u.directFit.value = DIRECT_FIT_INT[mapping.direct?.fit ?? 'stretch'];
    } else if (mapping.kind === 'parallel' && mapping.parallel) {
      params.set(mapping.parallel.size.w, mapping.parallel.size.h, 0, 0);
    } else if (mapping.kind === 'cylindrical' && mapping.cylindrical) {
      params.set(THREE.MathUtils.degToRad(mapping.cylindrical.arcDeg), mapping.cylindrical.height, 0, 0);
    } else if (mapping.kind === 'spherical' && mapping.spherical) {
      params.set(
        THREE.MathUtils.degToRad(mapping.spherical.arcDeg),
        THREE.MathUtils.degToRad(mapping.spherical.elevationDeg),
        0,
        0,
      );
    } else if (mapping.kind === 'feed') {
      const rect = mapping.feed?.rects.find((r) => r.screenId === screenId);
      if (!rect) return false;
      u.surfProj.value = PROJECTION_INT[rect.projection];
      (u.surfRegion.value as THREE.Vector4).set(rect.region.x, rect.region.y, rect.region.width, rect.region.height);
      (u.surfXform.value as THREE.Vector4).set(
        THREE.MathUtils.degToRad(rect.rotationDeg),
        rect.flipU ? 1 : 0,
        rect.flipV ? 1 : 0,
        WRAP_INT[rect.wrap],
      );
      (u.surfRepeat.value as THREE.Vector2).set(rect.repeatU, rect.repeatV);
    }
    return true;
  }
}
