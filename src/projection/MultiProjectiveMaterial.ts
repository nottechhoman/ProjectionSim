import * as THREE from 'three';
import multiVert from './shaders/multiProjection.vert.glsl?raw';
import multiFrag from './shaders/multiProjection.frag.glsl?raw';
import type { MediaFitMode, ProjectionCompositeMode, ProjectorConfig, TestPattern } from '../types';
import { DEFAULT_BLEND_GAMMA, MAX_BLEND_GAMMA, MIN_BLEND_GAMMA } from '../types';
import { FIT_MODE_INT } from '../media/MediaTextureCache';
import { patternToInt } from './ProjectiveMaterial';
import { falloffReferenceDistance } from '../optics/falloff';
import { getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import { mediaTextureCache } from '../media';

const MAX = 4;

const PATTERN_MAP: Record<TestPattern, number> = {
  checkerboard: 0,
  uvGrid: 1,
  colorBars: 2,
  white: 3,
  projectorId: 4,
};

const COMPOSITE_INT: Record<ProjectionCompositeMode, number> = {
  solo: 0,
  unblended: 0,
  blended: 1,
  heatmap: 2,
};

export function createMultiProjectiveMaterial(): THREE.ShaderMaterial {
  const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255]), 1, 1);
  fallback.needsUpdate = true;

  const depthMaps: THREE.Texture[] = [];
  const mediaMaps: THREE.Texture[] = [];
  for (let i = 0; i < MAX; i++) {
    depthMaps.push(fallback);
    mediaMaps.push(fallback);
  }

  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      projectorMatrices: { value: Array.from({ length: MAX }, () => new THREE.Matrix4()) },
      depthMaps: { value: depthMaps },
      mediaMaps: { value: mediaMaps },
      depthBias: { value: 0.002 },
      useOcclusion: { value: 0 },
      brightness: { value: new Float32Array(MAX) },
      patternTypes: { value: new Float32Array(MAX) },
      useMediaTexture: { value: new Float32Array(MAX) },
      fitModes: { value: new Float32Array(MAX) },
      mediaAspects: { value: new Float32Array(MAX) },
      rasterAspects: { value: new Float32Array(MAX) },
      projectorColors: {
        value: Array.from({ length: MAX }, () => new THREE.Color('#ffffff')),
      },
      blendEdges: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) },
      outerEdgeFade: { value: new Float32Array(MAX) },
      blendGamma: { value: new Float32Array(MAX) },
      depthMapSize: { value: new THREE.Vector2(512, 512) },
      projectorCount: { value: 0 },
      compositeMode: { value: 0 },
      forceUvPreview: { value: 0 },
      surfaceBaseColor: { value: new THREE.Color(0.55, 0.55, 0.55) },
      mappingMode: { value: 0 },
      screenMapKind: { value: 0 },
      screenMapMatrixInv: { value: new THREE.Matrix4() },
      screenMapParams: { value: new THREE.Vector4(1, 1, 90, 0) },
      sharedUseMediaTexture: { value: 0 },
      sharedMediaMap: { value: fallback },
      sharedPatternType: { value: 0 },
      sharedFitMode: { value: 0 },
      sharedMediaAspect: { value: 1.0 },
      sharedRasterAspect: { value: 16 / 9 },
      sharedProjectorColor: { value: new THREE.Color('#ffffff') },
      sharedBrightness: { value: 1.0 },
      projectionSides: { value: 0 },
      falloffPreview: { value: 0 },
      projectorWorldPos: {
        value: Array.from({ length: MAX }, () => new THREE.Vector3()),
      },
      falloffRefDistance: { value: new Float32Array(MAX) },
    },
    vertexShader: multiVert,
    fragmentShader: multiFrag,
    side: THREE.DoubleSide,
  });
}

function fitModeToInt(fit: MediaFitMode): number {
  return FIT_MODE_INT[fit];
}

export function updateMultiProjectiveMaterial(
  material: THREE.ShaderMaterial,
  projectors: ProjectorConfig[],
  depthTextures: THREE.Texture[],
  compositeMode: ProjectionCompositeMode,
  forceUvPreview = false,
  contentProjector?: ProjectorConfig | null,
  mappingMode = 0,
  falloffPreview = false,
): void {
  const count = Math.min(projectors.length, MAX);
  material.uniforms.projectorCount.value = count;
  material.uniforms.compositeMode.value = COMPOSITE_INT[compositeMode];
  material.uniforms.forceUvPreview.value = forceUvPreview ? 1 : 0;

  const matrices = material.uniforms.projectorMatrices.value as THREE.Matrix4[];
  const brightness = material.uniforms.brightness.value as Float32Array;
  const patternTypes = material.uniforms.patternTypes.value as Float32Array;
  const useMediaTexture = material.uniforms.useMediaTexture.value as Float32Array;
  const fitModes = material.uniforms.fitModes.value as Float32Array;
  const mediaAspects = material.uniforms.mediaAspects.value as Float32Array;
  const rasterAspects = material.uniforms.rasterAspects.value as Float32Array;
  const projectorColors = material.uniforms.projectorColors.value as THREE.Color[];
  const blendEdges = material.uniforms.blendEdges.value as THREE.Vector4[];
  const outerEdgeFade = material.uniforms.outerEdgeFade.value as Float32Array;
  const blendGamma = material.uniforms.blendGamma.value as Float32Array;
  const depthMaps = material.uniforms.depthMaps.value as THREE.Texture[];
  const mediaMaps = material.uniforms.mediaMaps.value as THREE.Texture[];
  const projectorWorldPos = material.uniforms.projectorWorldPos.value as THREE.Vector3[];
  const falloffRefDistance = material.uniforms.falloffRefDistance.value as Float32Array;

  for (let i = 0; i < MAX; i++) {
    if (i >= count) {
      useMediaTexture[i] = 0;
      continue;
    }
    const proj = projectors[i];
    const worldMatrix = getProjectorWorldMatrix(proj);

    matrices[i].copy(getProjectorViewProjectionMatrix(proj.optics, worldMatrix));
    projectorWorldPos[i].setFromMatrixPosition(worldMatrix);
    falloffRefDistance[i] = falloffReferenceDistance(proj);
    brightness[i] = proj.brightness;
    patternTypes[i] = PATTERN_MAP[proj.testPattern];
    rasterAspects[i] = proj.optics.aspectRatio;
    projectorColors[i].set(proj.color);
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

    const useMedia =
      (proj.mediaSource === 'image' || proj.mediaSource === 'video') && proj.mediaAssetId;
    if (useMedia) {
      const entry = mediaTextureCache.get(proj.mediaAssetId!);
      if (entry) {
        useMediaTexture[i] = 1;
        mediaMaps[i] = entry.texture;
        mediaAspects[i] = entry.aspect;
        fitModes[i] = fitModeToInt(proj.mediaFit);
      } else {
        useMediaTexture[i] = 0;
      }
    } else {
      useMediaTexture[i] = 0;
    }
  }

  material.uniforms.depthMaps.value = depthMaps;
  material.uniforms.mediaMaps.value = mediaMaps;

  const source = contentProjector ?? projectors[0];
  if (source) {
    material.uniforms.sharedPatternType.value = PATTERN_MAP[source.testPattern];
    material.uniforms.sharedRasterAspect.value = source.optics.aspectRatio;
    material.uniforms.sharedBrightness.value = source.brightness;
    (material.uniforms.sharedProjectorColor.value as THREE.Color).set(source.color);
    const useMedia =
      (source.mediaSource === 'image' || source.mediaSource === 'video') && source.mediaAssetId;
    if (useMedia) {
      const entry = mediaTextureCache.get(source.mediaAssetId!);
      if (entry) {
        material.uniforms.sharedUseMediaTexture.value = 1;
        material.uniforms.sharedMediaMap.value = entry.texture;
        material.uniforms.sharedMediaAspect.value = entry.aspect;
        material.uniforms.sharedFitMode.value = fitModeToInt(source.mediaFit);
      } else {
        material.uniforms.sharedUseMediaTexture.value = 0;
      }
    } else {
      material.uniforms.sharedUseMediaTexture.value = 0;
    }
  }
  material.uniforms.mappingMode.value = mappingMode;
  material.uniforms.falloffPreview.value = falloffPreview ? 1 : 0;
}

export { patternToInt };
