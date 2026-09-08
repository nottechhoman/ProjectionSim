import * as THREE from 'three';
import vert from './shaders/projection.vert.glsl?raw';
import frag from './shaders/projection.frag.glsl?raw';
import type { MediaFitMode, TestPattern } from '../types';
import { FIT_MODE_INT } from '../media/MediaTextureCache';

const PATTERN_MAP: Record<TestPattern, number> = {
  checkerboard: 0,
  uvGrid: 1,
  colorBars: 2,
  white: 3,
  projectorId: 4,
};

export function createProjectiveMaterial(): THREE.ShaderMaterial {
  const fallback = new THREE.DataTexture(new Uint8Array([255, 255, 255]), 1, 1);
  fallback.needsUpdate = true;

  return new THREE.ShaderMaterial({
    uniforms: {
      projectorMatrix: { value: new THREE.Matrix4() },
      depthMap: { value: null },
      mediaMap: { value: fallback },
      depthBias: { value: 0.002 },
      brightness: { value: 1.0 },
      patternType: { value: 0 },
      useMediaTexture: { value: 0 },
      fitMode: { value: 0 },
      mediaAspect: { value: 1.0 },
      rasterAspect: { value: 16 / 9 },
      projectorColor: { value: new THREE.Color('#4fc3f7') },
      depthMapSize: { value: new THREE.Vector2(512, 512) },
      forceUvPreview: { value: 0 },
      surfaceBaseColor: { value: new THREE.Color(0.55, 0.55, 0.55) },
      mappingMode: { value: 0 },
      screenMapKind: { value: 0 },
      screenMapMatrixInv: { value: new THREE.Matrix4() },
      screenMapParams: { value: new THREE.Vector4(1, 1, 90, 0) },
    },
    vertexShader: vert,
    fragmentShader: frag,
  });
}

export function patternToInt(pattern: TestPattern): number {
  return PATTERN_MAP[pattern];
}

export function fitModeToInt(fit: MediaFitMode): number {
  return FIT_MODE_INT[fit];
}
