import * as THREE from 'three';
import multiVert from './shaders/multiProjection.vert.glsl?raw';
import multiFrag from './shaders/multiProjection.frag.glsl?raw';
import type { BlendSettings, PrevizSettings, ProjectionCompositeMode, ProjectorConfig } from '../types';
import { DEFAULT_BLEND_SETTINGS } from '../types';
import { BLEND_CURVE_INT } from '../blending/advancedBlend';
import { warpInverseMatrix } from '../warp/homography';
import { DEFAULT_BLEND_GAMMA, MAX_BLEND_GAMMA, MIN_BLEND_GAMMA } from '../types';
import { falloffReferenceDistance } from '../optics/falloff';
import { DEFAULT_PREVIZ_SETTINGS, pixelsPerMetreAt1m, projectorLumens, unitImageArea } from '../optics/illuminance';
import { getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';

const MAX = 4;

const NO_FEED = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

const COMPOSITE_INT: Record<ProjectionCompositeMode, number> = {
  solo: 0,
  unblended: 0,
  blended: 1,
  heatmap: 2,
};

export function createMultiProjectiveMaterial(): THREE.ShaderMaterial {
  const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  fallback.needsUpdate = true;

  const depthMaps: THREE.Texture[] = [];
  const feedMaps: THREE.Texture[] = [];
  for (let i = 0; i < MAX; i++) {
    depthMaps.push(fallback);
    feedMaps.push(fallback);
  }

  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      projectorMatrices: { value: Array.from({ length: MAX }, () => new THREE.Matrix4()) },
      depthMaps: { value: depthMaps },
      feedMaps: { value: feedMaps },
      depthBias: { value: 0.002 },
      useOcclusion: { value: 0 },
      brightness: { value: new Float32Array(MAX) },
      blendEdges: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
      outerEdgeFade: { value: new Float32Array(MAX) },
      blendGamma: { value: new Float32Array(MAX) },
      depthMapSize: { value: new THREE.Vector2(512, 512) },
      projectorCount: { value: 0 },
      compositeMode: { value: 0 },
      forceUvPreview: { value: 0 },
      surfaceBaseColor: { value: new THREE.Color(0.55, 0.55, 0.55) },
      screenMap: { value: fallback },
      hasScreenMap: { value: 0 },
      projectionSides: { value: 0 },
      falloffPreview: { value: 0 },
      projectorWorldPos: {
        value: Array.from({ length: MAX }, () => new THREE.Vector3()),
      },
      falloffRefDistance: { value: new Float32Array(MAX) },
      projLumens: { value: new Float32Array(MAX) },
      projForward: { value: Array.from({ length: MAX }, () => new THREE.Vector3(0, 0, -1)) },
      projUnitArea: { value: new Float32Array(MAX).fill(1) },
      illumScaleMax: { value: DEFAULT_PREVIZ_SETTINGS.scaleMax },
      illumUnit: { value: 1 },
      screenGain: { value: 1 },
      projPxAt1m: { value: new Float32Array(MAX) },
      densityScaleMax: { value: DEFAULT_PREVIZ_SETTINGS.densityScaleMax },
      // v2 warp
      warpInv: { value: Array.from({ length: MAX }, () => new THREE.Matrix3()) },
      // v2 blending
      blendMode: { value: 0 },
      blendCurve: { value: 1 },
      blendWidth: { value: 1 },
      blendExponent: { value: 1 },
      blendGammaCorrect: { value: 1 },
      displayGamma: { value: 2.2 },
      blackLevel: { value: 0 },
      blackComp: { value: 0 },
      maxOverlap: { value: 1 },
      // v2 previews / feed
      previewKind: { value: 0 },
      feedIndex: { value: -1 },
      feedKind: { value: 0 },
      feedLayer: { value: 0 },
      feedSize: { value: new THREE.Vector2(1, 1) },
      feedView: { value: 0 },
      feedSpill: { value: 0.22 },
    },
    vertexShader: multiVert,
    fragmentShader: multiFrag,
    side: THREE.DoubleSide,
  });
}

export function updateMultiProjectiveMaterial(
  material: THREE.ShaderMaterial,
  projectors: ProjectorConfig[],
  depthTextures: THREE.Texture[],
  compositeMode: ProjectionCompositeMode,
  forceUvPreview = false,
  falloffPreview = false,
  feedTextures: (THREE.Texture | null)[] = [],
): void {
  const count = Math.min(projectors.length, MAX);
  material.uniforms.projectorCount.value = count;
  material.uniforms.compositeMode.value = COMPOSITE_INT[compositeMode];
  material.uniforms.forceUvPreview.value = forceUvPreview ? 1 : 0;

  const matrices = material.uniforms.projectorMatrices.value as THREE.Matrix4[];
  const brightness = material.uniforms.brightness.value as Float32Array;
  const blendEdges = material.uniforms.blendEdges.value as THREE.Vector4[];
  const outerEdgeFade = material.uniforms.outerEdgeFade.value as Float32Array;
  const blendGamma = material.uniforms.blendGamma.value as Float32Array;
  const depthMaps = material.uniforms.depthMaps.value as THREE.Texture[];
  const feedMaps = material.uniforms.feedMaps.value as THREE.Texture[];
  const projectorWorldPos = material.uniforms.projectorWorldPos.value as THREE.Vector3[];
  const falloffRefDistance = material.uniforms.falloffRefDistance.value as Float32Array;
  const warpInv = material.uniforms.warpInv.value as THREE.Matrix3[];
  const projLumens = material.uniforms.projLumens.value as Float32Array;
  const projUnitArea = material.uniforms.projUnitArea.value as Float32Array;
  const projForward = material.uniforms.projForward.value as THREE.Vector3[];
  const projPxAt1m = material.uniforms.projPxAt1m.value as Float32Array;

  for (let i = 0; i < MAX; i++) {
    if (i >= count) {
      warpInv[i].identity();
      continue;
    }
    const proj = projectors[i];
    const inv = warpInverseMatrix(proj.warp);
    warpInv[i].set(inv[0], inv[1], inv[2], inv[3], inv[4], inv[5], inv[6], inv[7], inv[8]);
    const worldMatrix = getProjectorWorldMatrix(proj);

    matrices[i].copy(getProjectorViewProjectionMatrix(proj.optics, worldMatrix));
    projectorWorldPos[i].setFromMatrixPosition(worldMatrix);
    falloffRefDistance[i] = falloffReferenceDistance(proj);
    projLumens[i] = projectorLumens(proj);
    projUnitArea[i] = unitImageArea(proj.optics.throwRatio, proj.optics.aspectRatio);
    projForward[i].set(0, 0, -1).transformDirection(worldMatrix);
    projPxAt1m[i] = pixelsPerMetreAt1m(proj);
    brightness[i] = proj.brightness;
    blendEdges[i].set(
      proj.blendEdges.left,
      proj.blendEdges.right,
      proj.blendEdges.top,
      proj.blendEdges.bottom,
    );
    outerEdgeFade[i] = proj.outerEdgeFade ? 1 : 0;
    blendGamma[i] = Math.min(
      MAX_BLEND_GAMMA,
      Math.max(MIN_BLEND_GAMMA, proj.blendGamma ?? DEFAULT_BLEND_GAMMA),
    );
    depthMaps[i] = depthTextures[i] ?? depthMaps[i] ?? depthMaps[0];

    // Never leave a stale feed bound: the content pass renders into these textures.
    feedMaps[i] = feedTextures[i] ?? NO_FEED;
  }

  material.uniforms.depthMaps.value = depthMaps;
  material.uniforms.feedMaps.value = feedMaps;

  material.uniforms.falloffPreview.value = falloffPreview ? 1 : 0;
}

export type PreviewKind = 'normal' | 'blendSum' | 'surfaceUv' | 'illuminance' | 'pixelDensity';
const PREVIEW_KIND_INT: Record<PreviewKind, number> = {
  normal: 0,
  blendSum: 1,
  surfaceUv: 2,
  illuminance: 3,
  pixelDensity: 4,
};

/** v5: brightness heatmap scale / unit / gain. */
export function applyPrevizUniforms(material: THREE.ShaderMaterial, settings: PrevizSettings): void {
  const u = material.uniforms;
  u.illumScaleMax.value = settings.scaleMax;
  u.illumUnit.value = settings.unit === 'nits' ? 1 : 0;
  u.screenGain.value = settings.screenGain;
  u.densityScaleMax.value = settings.densityScaleMax;
}

/** v2: global advanced-blend and preview uniforms. */
export function applyAdvancedBlendUniforms(
  material: THREE.ShaderMaterial,
  settings: BlendSettings = DEFAULT_BLEND_SETTINGS,
  maxOverlap = 1,
  previewKind: PreviewKind = 'normal',
): void {
  const u = material.uniforms;
  u.blendMode.value = settings.mode === 'auto' ? 1 : 0;
  u.blendCurve.value = BLEND_CURVE_INT[settings.curve];
  u.blendWidth.value = settings.width;
  u.blendExponent.value = settings.exponent;
  u.blendGammaCorrect.value = settings.gammaCorrect ? 1 : 0;
  u.displayGamma.value = settings.displayGamma;
  u.blackLevel.value = settings.blackLevel;
  u.blackComp.value = settings.blackLevelCompensation ? 1 : 0;
  u.maxOverlap.value = Math.max(1, maxOverlap);
  u.previewKind.value = PREVIEW_KIND_INT[previewKind];
}

