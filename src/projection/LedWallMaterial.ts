import * as THREE from 'three';
import vert from './shaders/ledWall.vert.glsl?raw';
import frag from './shaders/ledWall.frag.glsl?raw';
import type { SceneObject } from '../types';
import { mediaTextureCache } from '../media/assetImport';
import { fitModeToInt } from './ProjectiveMaterial';
import { normalizeProjectionSides, projectionSidesToInt, supportsProjectionSides } from './projectionSides';

export function createLedWallMaterial(): THREE.ShaderMaterial {
  const fallback = new THREE.DataTexture(new Uint8Array([24, 24, 28]), 1, 1);
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

export function updateLedWallMaterial(material: THREE.ShaderMaterial, obj: SceneObject): void {
  const config = obj.ledWall ?? {
    pixelResolution: { width: 1920, height: 1080 },
    mediaSource: 'image' as const,
    mediaAssetId: null,
    mediaFit: 'contain' as const,
  };
  const panelAspect =
    config.pixelResolution.width / Math.max(config.pixelResolution.height, 1);

  material.uniforms.panelAspect.value = panelAspect;
  material.uniforms.fitMode.value = fitModeToInt(config.mediaFit);
  material.uniforms.displaySides.value = supportsProjectionSides(obj.type)
    ? projectionSidesToInt(normalizeProjectionSides(obj))
    : 0;

  const useMedia =
    (config.mediaSource === 'image' || config.mediaSource === 'video') && config.mediaAssetId;
  if (useMedia) {
    const entry = mediaTextureCache.get(config.mediaAssetId!);
    if (entry) {
      material.uniforms.useMediaTexture.value = 1;
      material.uniforms.mediaMap.value = entry.texture;
      material.uniforms.mediaAspect.value = entry.aspect;
      return;
    }
  }

  material.uniforms.useMediaTexture.value = 0;
}
