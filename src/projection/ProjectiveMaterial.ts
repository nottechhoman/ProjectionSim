import * as THREE from 'three';
import vert from './shaders/projection.vert.glsl?raw';
import frag from './shaders/projection.frag.glsl?raw';
import type { TestPattern } from '../types';

const PATTERN_MAP: Record<TestPattern, number> = {
  checkerboard: 0,
  uvGrid: 1,
  colorBars: 2,
  white: 3,
  projectorId: 4,
};

export function createProjectiveMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      projectorMatrix: { value: new THREE.Matrix4() },
      depthMap: { value: null },
      depthBias: { value: 0.001 },
      brightness: { value: 1.0 },
      patternType: { value: 0 },
      projectorColor: { value: new THREE.Color('#4fc3f7') },
      depthMapSize: { value: new THREE.Vector2(512, 512) },
    },
    vertexShader: vert,
    fragmentShader: frag,
  });
}

export function patternToInt(pattern: TestPattern): number {
  return PATTERN_MAP[pattern];
}
