import * as THREE from 'three';
import vert from './shaders/ledWall.vert.glsl?raw';
import frag from './shaders/ledWall.frag.glsl?raw';
import type { SceneObject } from '../types';
import { normalizeProjectionSides, projectionSidesToInt, supportsProjectionSides } from './projectionSides';

export function createLedWallMaterial(): THREE.ShaderMaterial {
  const fallback = new THREE.DataTexture(new Uint8Array([24, 24, 28, 255]), 1, 1);
  fallback.colorSpace = THREE.SRGBColorSpace;
  fallback.needsUpdate = true;

  return new THREE.ShaderMaterial({
    uniforms: {
      mediaMap: { value: fallback },
      useMediaTexture: { value: 0 },
      fitMode: { value: 0 },
      mediaAspect: { value: 1.0 },
      panelAspect: { value: 16 / 9 },
      displaySides: { value: 0 },
      panelColor: { value: new THREE.Color(0.08, 0.08, 0.1) },
    },
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.DoubleSide,
  });
}

/** Sides / aspect from the object; the image itself is the LED wall's screen texture. */
export function updateLedWallMaterial(material: THREE.ShaderMaterial, obj: SceneObject): void {
  const res = obj.ledWall?.pixelResolution ?? { width: 1920, height: 1080 };
  material.uniforms.panelAspect.value = res.width / Math.max(res.height, 1);
  material.uniforms.fitMode.value = 2;
  material.uniforms.displaySides.value = supportsProjectionSides(obj.type)
    ? projectionSidesToInt(normalizeProjectionSides(obj))
    : 0;
}

/** v4: show the wall's baked screen texture (layers on its mappings). */
export function setLedWallTexture(material: THREE.ShaderMaterial, texture: THREE.Texture | null): void {
  if (texture) {
    material.uniforms.mediaMap.value = texture;
    material.uniforms.useMediaTexture.value = 1;
  } else {
    material.uniforms.useMediaTexture.value = 0;
  }
}
