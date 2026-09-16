import * as THREE from 'three';
import { mediaTextureCache } from '../media';
import { isVideoPlaying } from '../media/videoPlayback';
import type { ContentCanvas, ContentCanvasLayer } from '../types';
import { getDeviceProfile, type DeviceProfile } from '../ui/deviceProfile';
import {
  clampContentCanvasSize,
  fittedLayerRect,
  type ClampedCanvasSize,
} from './contentCanvas';

const PATTERN_INT: Record<string, number> = {
  checkerboard: 0,
  uvGrid: 1,
  colorBars: 2,
  white: 3,
  projectorId: 4,
};

const patternVert = `
uniform vec2 canvasSize;
varying vec2 vCanvasUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vCanvasUv = vec2(world.x / max(canvasSize.x, 1.0), world.y / max(canvasSize.y, 1.0));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const patternFrag = `
uniform float patternType;
uniform vec3 tint;
uniform float opacity;
varying vec2 vCanvasUv;

void main() {
  vec3 color = vec3(1.0);
  if (patternType < 0.5) {
    vec2 c = floor(vCanvasUv * 16.0);
    float v = mod(c.x + c.y, 2.0);
    color = mix(vec3(0.1), vec3(0.9), v);
  } else if (patternType < 1.5) {
    color = vec3(vCanvasUv, 0.0);
  } else if (patternType < 2.5) {
    color = vec3(vCanvasUv.x, vCanvasUv.y, 0.5);
  } else if (patternType < 3.5) {
    color = vec3(1.0);
  } else {
    color = tint;
  }
  gl_FragColor = vec4(color, opacity);
}
`;

export class ContentCanvasRenderer {
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private readonly fallback: THREE.DataTexture;
  private dirty = true;
  private signature = '';
  effectiveSize: ClampedCanvasSize = {
    widthPx: 1,
    heightPx: 1,
    clamped: false,
    maxDimension: 4096,
  };

  constructor() {
    this.fallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
    this.fallback.needsUpdate = true;
  }

  get texture(): THREE.Texture {
    return this.target?.texture ?? this.fallback;
  }

  markDirty(): void {
    this.dirty = true;
  }

  composite(
    renderer: THREE.WebGLRenderer,
    canvas: ContentCanvas,
    profile: DeviceProfile = getDeviceProfile(),
  ): void {
    if (!canvas.enabled) return;

    const nextSize = clampContentCanvasSize(
      canvas.widthPx,
      canvas.heightPx,
      profile,
      renderer.capabilities.maxTextureSize,
    );
    this.ensureTarget(nextSize);
    this.effectiveSize = nextSize;

    const signature = JSON.stringify(canvas);
    const hasPlayingVideo = canvas.layers.some(
      (layer) =>
        layer.visible &&
        layer.kind === 'video' &&
        layer.mediaAssetId &&
        isVideoPlaying(layer.mediaAssetId),
    );
    if (signature !== this.signature) {
      this.signature = signature;
      this.dirty = true;
    }
    if (!this.dirty && !hasPlayingVideo) return;

    this.rebuildLayers(canvas, nextSize);

    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.setRenderTarget(this.target);
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const child of this.scene.children) {
      const scissor = child.userData.scissor as { x: number; y: number; w: number; h: number } | undefined;
      if (scissor) {
        renderer.setScissor(scissor.x, scissor.y, scissor.w, scissor.h);
      } else {
        renderer.setScissor(0, 0, this.target!.width, this.target!.height);
      }
      const others = this.scene.children.filter((c) => c !== child);
      for (const other of others) other.visible = false;
      child.visible = true;
      renderer.render(this.scene, this.camera);
      for (const other of others) other.visible = true;
    }
    renderer.setScissorTest(false);
    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAutoClear;
    renderer.setClearColor(prevColor, prevAlpha);
    this.dirty = false;
  }

  dispose(): void {
    this.clearScene();
    this.target?.dispose();
    this.target = null;
    this.fallback.dispose();
  }

  private ensureTarget(size: ClampedCanvasSize): void {
    if (
      this.target &&
      this.target.width === size.widthPx &&
      this.target.height === size.heightPx
    ) {
      return;
    }
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(size.widthPx, size.heightPx, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
    });
    this.target.texture.colorSpace = THREE.SRGBColorSpace;
    this.camera.left = 0;
    this.camera.right = size.widthPx;
    this.camera.top = size.heightPx;
    this.camera.bottom = 0;
    this.camera.position.set(0, 0, 1);
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private rebuildLayers(canvas: ContentCanvas, size: ClampedCanvasSize): void {
    this.clearScene();
    const scaleX = size.widthPx / canvas.widthPx;
    const scaleY = size.heightPx / canvas.heightPx;
    for (const layer of canvas.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      const mesh = this.createLayerMesh(layer, canvas, scaleX, scaleY, size.heightPx);
      if (mesh) this.scene.add(mesh);
    }
  }

  private createLayerMesh(
    layer: ContentCanvasLayer,
    canvas: ContentCanvas,
    scaleX: number,
    scaleY: number,
    canvasHeightRt: number,
  ): THREE.Mesh | null {
    const authoring = {
      x: layer.x,
      y: layer.y,
      width: layer.width,
      height: layer.height,
      fit: layer.fit,
    };
    let mediaAspect = layer.width / layer.height;
    let map: THREE.Texture | null = null;
    if ((layer.kind === 'image' || layer.kind === 'video') && layer.mediaAssetId) {
      const entry = mediaTextureCache.get(layer.mediaAssetId);
      if (!entry) return null;
      map = entry.texture;
      mediaAspect = entry.aspect;
    }
    const fitted = fittedLayerRect(authoring, mediaAspect);
    const w = fitted.width * scaleX;
    const h = fitted.height * scaleY;
    const x = fitted.x * scaleX;
    const yAuthoring = fitted.y * scaleY;
    const y = canvasHeightRt - yAuthoring - h;
    const geometry = new THREE.PlaneGeometry(w, h);
    const material = this.createLayerMaterial(layer, map, canvas.widthPx * scaleX, canvas.heightPx * scaleY);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x + w / 2, y + h / 2, 0);
    mesh.rotation.z = THREE.MathUtils.degToRad(-layer.rotationDeg);
    mesh.frustumCulled = false;
    const clipX = layer.x * scaleX;
    const clipH = layer.height * scaleY;
    const clipY = canvasHeightRt - layer.y * scaleY - clipH;
    mesh.userData.scissor = {
      x: Math.max(0, Math.floor(clipX)),
      y: Math.max(0, Math.floor(clipY)),
      w: Math.max(1, Math.floor(layer.width * scaleX)),
      h: Math.max(1, Math.floor(clipH)),
    };
    return mesh;
  }

  private createLayerMaterial(
    layer: ContentCanvasLayer,
    map: THREE.Texture | null,
    canvasW: number,
    canvasH: number,
  ): THREE.Material {
    if (map) {
      return new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: layer.opacity,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    if (layer.kind === 'solid') {
      return new THREE.MeshBasicMaterial({
        color: layer.color,
        transparent: true,
        opacity: layer.opacity,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    return new THREE.ShaderMaterial({
      uniforms: {
        canvasSize: { value: new THREE.Vector2(canvasW, canvasH) },
        patternType: { value: PATTERN_INT[layer.pattern ?? 'uvGrid'] ?? 1 },
        tint: { value: new THREE.Color(layer.color) },
        opacity: { value: layer.opacity },
      },
      vertexShader: patternVert,
      fragmentShader: patternFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  private clearScene(): void {
    while (this.scene.children.length > 0) {
      const child = this.scene.children[0];
      this.scene.remove(child);
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose();
    }
  }
}
