import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { useAppStore } from '../store';
import { buildProjectorCamera, getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import {
  applyAdvancedBlendUniforms,
  createMultiProjectiveMaterial,
  updateMultiProjectiveMaterial,
  type PreviewKind,
} from '../projection/MultiProjectiveMaterial';
import type { BlendSettings, Show, SurfaceUvProjection } from '../types';
import { DEFAULT_BLEND_SETTINGS } from '../types';
import { computeSurfaceUvFrame, projectSurfaceUv, type SurfaceUvFrame } from '../uvmapping/surfaceUv';
import { ScreenTextureBaker, SCREEN_TEXTURE_MAX, type BakeSurface } from '../mapping/ScreenTextureBaker';
import { activeTrack, createShow } from '../mapping/model';
import { mappingVisibleTo } from '../mapping/sample';
import { applyUvAtlas, uvReportForMeshes, type UvReport } from '../mapping/uvAtlas';
import { evaluate, type LiveLayer } from '../playback/evaluate';
import { transport } from '../playback/clock';
import { transportStep, type PlayMode } from '../playback/showControl';
import { MediaSync } from '../playback/mediaSync';
import { ProjectorFeedPass, type FeedKind } from '../projection/ProjectorFeedPass';
import { outputWindows } from '../output/outputWindows';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import { DepthPass } from '../visibility/DepthPass';
import { depthPassResolution, getDeviceProfile, targetPixelRatio } from '../ui/deviceProfile';
import {
  collectBlockerMeshes,
  excludeObjectIdFromDepthKey,
  occlusionDepthKeyForReceiver,
  requiredOcclusionDepthKeys,
  type OcclusionDepthKey,
} from '../visibility/projectionOcclusion';
import type {
  MaterialPreviewMode,
  ProjectionCompositeMode,
  ProjectorConfig,
  SceneObject,
  Transform,
  TransformMode,
  ViewPreset,
} from '../types';
import {
  normalizeProjectionSides,
  projectionSidesToInt,
  supportsProjectionSides,
} from '../projection/projectionSides';
import { createScreen } from './objects/createScreen';
import { createLedWall } from './objects/createLedWall';
import { setLedWallTexture, updateLedWallMaterial } from '../projection/LedWallMaterial';
import { createFloor } from './objects/createFloor';
import { createBox } from './objects/createBox';
import { createCurvedScreen } from './objects/createCurvedScreen';
import { FrustumHelper } from './helpers/FrustumHelper';
import { mediaTextureCache, modelCache } from '../media';
import { cloneModelGroup } from './ModelLoader';
import { computeProjectorLookAtQuaternion, rollFromProjectorQuaternion } from '../optics/lookAt';
import { getCalculationTargetObject } from '../store/reliabilitySettings';
import { eulerYXZToQuaternion, quaternionToEulerYXZ } from '../utils/euler';
import { unprojectRasterRay } from '../optics/rays';
import { computePlanarFootprint } from '../coverage/planarFootprint';
import { computeCurvedFootprint, type CurvedScreenSurface } from '../coverage/curvedFootprint';

const CORNER_UV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
] as const;

type AppState = ReturnType<typeof useAppStore.getState>;

export interface SceneEngineCallbacks {
  onFrameTime?: (ms: number) => void;
  onWebglStatus?: (available: boolean) => void;
  onSelect?: (id: string) => void;
  onTransformChange?: (id: string, patch: { position?: Transform['position']; quaternion?: Transform['quaternion'] }) => void;
  onMeasurePoint?: (point: { x: number; y: number; z: number }) => void;
  onHistoryCheckpoint?: () => void;
  onRasterPreview?: () => void;
}

function dimensionsKey(obj: SceneObject): string {
  const depth = obj.dimensions.depth ?? 0;
  const curved = obj.curved
    ? `${obj.curved.radius}:${obj.curved.arcAngleDeg}:${obj.curved.height}`
    : '';
  const model = obj.modelAssetId ? `${obj.modelAssetId}:${obj.modelScale ?? 1}:${obj.uvAtlas ? 'atlas' : 'uv'}` : '';
  const led = obj.ledWall ? `${obj.ledWall.pixelResolution.width}x${obj.ledWall.pixelResolution.height}` : '';
  const sides = obj.projectionSides ?? 'front';
  return `${obj.type}:${obj.dimensions.width}:${obj.dimensions.height}:${depth}:${curved}:${model}:${led}:${sides}`;
}

function createObjectMesh(obj: SceneObject): THREE.Object3D {
  switch (obj.type) {
    case 'screen':
      return createScreen(obj);
    case 'floor':
      return createFloor(obj);
    case 'box':
      return createBox(obj);
    case 'curvedScreen':
      return createCurvedScreen(obj);
    case 'ledWall':
      return createLedWall(obj);
    case 'model': {
      if (!obj.modelAssetId) return createBox(obj);
      const prototype = modelCache.get(obj.modelAssetId);
      if (!prototype) return createBox(obj);
      const group = cloneModelGroup(prototype);
      group.userData.isModel = true;
      if (obj.uvAtlas) {
        // Own copies of the geometry (the prototype is shared) before rewriting UVs.
        const meshes = collectMeshes(group);
        for (const mesh of meshes) mesh.geometry = mesh.geometry.clone();
        applyUvAtlas(meshes, group);
      }
      return group;
    }
    default:
      return createScreen(obj);
  }
}

type OcclusionDepthResolver = (key: OcclusionDepthKey, multi: boolean) => THREE.Texture | THREE.Texture[] | null;

const blackTexture = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

function attachReceiverShaderHooks(
  mesh: THREE.Mesh,
  objectId: string,
  blocksProjection: boolean,
  sidesInt: number,
  resolveOcclusionDepth: OcclusionDepthResolver,
): void {
  mesh.userData.projectionSides = sidesInt;
  mesh.userData.occlusionDepthKey = occlusionDepthKeyForReceiver(objectId, blocksProjection);
  mesh.onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
    const mat = material as THREE.ShaderMaterial;
    if (!mat.uniforms) return;
    // Per-mesh values on a shared material: force a uniform upload for every mesh
    // (three.js only refreshes uniforms automatically when the material changes).
    mat.uniformsNeedUpdate = true;
    if (mat.uniforms.projectionSides) {
      mat.uniforms.projectionSides.value = mesh.userData.projectionSides ?? 0;
    }
    if (mat.uniforms.screenMap) {
      const tex = mesh.userData.screenTexture as THREE.Texture | null | undefined;
      mat.uniforms.screenMap.value = tex ?? blackTexture;
      mat.uniforms.hasScreenMap.value = tex ? 1 : 0;
    }
    const base = mesh.userData.baseColor as THREE.Color | undefined;
    if (base && mat.uniforms.surfaceBaseColor && mat.uniforms.feedIndex) {
      (mat.uniforms.surfaceBaseColor.value as THREE.Color).copy(base);
    }
    const key = mesh.userData.occlusionDepthKey as OcclusionDepthKey;
    const multi = mat.uniforms.depthMaps != null;
    const depth = resolveOcclusionDepth(key, multi);
    if (multi && Array.isArray(depth) && mat.uniforms.depthMaps) {
      const depthMaps = mat.uniforms.depthMaps.value as THREE.Texture[];
      const fallback = depthMaps[0];
      for (let slot = 0; slot < depthMaps.length; slot++) {
        depthMaps[slot] = slot < depth.length ? depth[slot] : fallback;
      }
      mat.uniforms.useOcclusion.value = depth.length > 0 ? 1 : 0;
    } else if (!multi && depth instanceof THREE.Texture && mat.uniforms.depthMap) {
      mat.uniforms.depthMap.value = depth;
      mat.uniforms.useOcclusion.value = 1;
    } else if (mat.uniforms.useOcclusion) {
      mat.uniforms.useOcclusion.value = 0;
    }
  };
}

/** Root-local vertex sample used to fit planar / cylindrical / spherical UV frames (Feed mappings). */
function computeRootSurfaceFrame(root: THREE.Object3D): SurfaceUvFrame {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const points: { x: number; y: number; z: number }[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  for (const mesh of collectMeshes(root)) {
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) continue;
    m.multiplyMatrices(rootInv, mesh.matrixWorld);
    const step = Math.max(1, Math.floor(pos.count / 4000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      points.push({ x: v.x, y: v.y, z: v.z });
    }
  }
  return computeSurfaceUvFrame(points);
}

function syncReceiverMeshHooks(
  root: THREE.Object3D,
  obj: SceneObject,
  sidesInt: number,
  resolveOcclusionDepth: OcclusionDepthResolver,
): void {
  for (const mesh of collectMeshes(root)) {
    attachReceiverShaderHooks(mesh, obj.id, obj.blocksProjection, sidesInt, resolveOcclusionDepth);
    if (!mesh.userData.baseColor) mesh.userData.baseColor = meshBaseColor(mesh);
  }
}

function surfaceFrameOf(root: THREE.Object3D): SurfaceUvFrame {
  if (!root.userData.surfaceFrame) root.userData.surfaceFrame = computeRootSurfaceFrame(root);
  return root.userData.surfaceFrame as SurfaceUvFrame;
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  return meshes;
}

function meshBaseColor(mesh: THREE.Mesh): THREE.Color {
  const material = mesh.material;
  if (!Array.isArray(material) && (material as THREE.MeshStandardMaterial).color) {
    return (material as THREE.MeshStandardMaterial).color.clone();
  }
  return new THREE.Color(0.55, 0.55, 0.55);
}

function objectWorldMatrix(transform: Transform): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(transform.position.x, transform.position.y, transform.position.z);
  const quaternion = new THREE.Quaternion(...transform.quaternion);
  matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return matrix;
}

function buildPlanarScreen(
  sceneObjects: SceneObject[],
  calculationTargetId: string | null,
): {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
  height: number;
} | null {
  const screen =
    getCalculationTargetObject(sceneObjects, calculationTargetId) ??
    sceneObjects.find((obj) => obj.type === 'screen' && obj.receivesProjection);
  if (!screen || screen.type !== 'screen') return null;
  const matrix = objectWorldMatrix(screen.transform);
  const center = new THREE.Vector3().setFromMatrixPosition(matrix);
  const normal = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(matrix))
    .normalize();
  return {
    center,
    normal,
    width: screen.dimensions.width,
    height: screen.dimensions.height,
  };
}

function buildCurvedScreenSurface(
  sceneObjects: SceneObject[],
  calculationTargetId: string | null,
): CurvedScreenSurface | null {
  const screen =
    getCalculationTargetObject(sceneObjects, calculationTargetId) ??
    sceneObjects.find((obj) => obj.type === 'curvedScreen' && obj.receivesProjection);
  if (!screen || screen.type !== 'curvedScreen' || !screen.curved) return null;
  return {
    worldMatrix: objectWorldMatrix(screen.transform),
    radius: screen.curved.radius,
    arcAngleDeg: screen.curved.arcAngleDeg,
    height: screen.curved.height,
  };
}

function offsetCornersAlongNormal(
  corners: { x: number; y: number; z: number }[],
  normal: THREE.Vector3,
  offset: number,
): { x: number; y: number; z: number }[] {
  return corners.map((c) => ({
    x: c.x + normal.x * offset,
    y: c.y + normal.y * offset,
    z: c.z + normal.z * offset,
  }));
}

export class SceneEngine {
  /** Gizmo helper size in scene meters (scales with distance, not fixed screen pixels). */
  private static readonly GIZMO_WORLD_SIZE = 1.25;

  private readonly canvas: HTMLCanvasElement;
  private readonly webglAvailable: boolean;
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly editorScene = new THREE.Scene();
  private readonly contentGroup = new THREE.Group();
  private readonly helpersGroup = new THREE.Group();
  private editorCamera: THREE.PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private transformControls: TransformControls | null = null;
  private depthPass: DepthPass | null = null;
  private readonly depthPassByProjector = new Map<string, DepthPass>();
  private readonly multiProjectiveMaterial = createMultiProjectiveMaterial();
  private readonly projectorVisuals = new Map<string, { body: THREE.Mesh; frustum: FrustumHelper }>();
  private readonly objectMeshes = new Map<string, THREE.Object3D>();
  private allProjectors: ProjectorConfig[] = [];
  private activeProjectors: ProjectorConfig[] = [];
  private selectedProjectorId = 'proj-1';
  private materialPreviewMode: MaterialPreviewMode = 'projectionPreview';
  private projectionCompositeMode: ProjectionCompositeMode = 'unblended';
  private show: Show = createShow();
  private readonly baker = new ScreenTextureBaker();
  private readonly mediaSync = new MediaSync();
  private liveLayers: LiveLayer[] = [];
  private playMode: PlayMode = 'play';
  private lastPlayhead: number | null = null;
  /** Any play / pause / seek restarts boundary detection (a jump is not a crossing). */
  private readonly transportUnsub = transport.subscribe(() => {
    this.lastPlayhead = null;
  });
  /** Bumped on every store sync; with the live-layer signature it decides re-bakes. */
  private syncRevision = 0;
  private lastContentKey = '';
  private readonly feedPass = new ProjectorFeedPass();
  private blendSettings: BlendSettings = DEFAULT_BLEND_SETTINGS;
  private lastFrameAt = 0;
  private readonly outputTargets = new Map<
    string,
    {
      target: THREE.WebGLRenderTarget;
      pixels: Uint8Array;
      pbo: WebGLBuffer | null;
      sync: WebGLSync | null;
      issuedAt: number;
    }
  >();
  private maxOverlap = 1;
  private rasterPreviewPanelVisible = false;
  private rasterPreviewWasVisible = false;
  private sceneObjects: SceneObject[] = [];
  private animationId: number | null = null;
  private disposed = false;
  private currentViewPreset: ViewPreset = 'persp';
  private callbacks: SceneEngineCallbacks = {};
  private readonly viewTarget = new THREE.Vector3(0, 1.5, 0);
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private gizmoDragging = false;
  private gizmoRotateStartEuler: { yaw: number; pitch: number; roll: number } | null = null;
  private gizmoRotateStartQuat: THREE.Quaternion | null = null;
  private gizmoOrbitStartOffset: THREE.Vector3 | null = null;
  private calculationTargetId: string | null = null;
  private readonly lookAtMarkers = new Map<string, THREE.Mesh>();
  private currentTransformMode: TransformMode = 'translate';
  private showProjectionBeam = false;
  private measureMode = false;
  private readonly measureGroup = new THREE.Group();
  private measureLine: THREE.Line | null = null;
  private readonly measureMarkers: THREE.Mesh[] = [];
  private readonly occlusionDepthSingle = new Map<OcclusionDepthKey, THREE.Texture | null>();
  private readonly occlusionDepthMulti = new Map<OcclusionDepthKey, THREE.Texture[] | null>();
  private currentDepthResolution = depthPassResolution();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    this.webglAvailable = gl !== null;

    if (!this.webglAvailable) {
      const parent = canvas.parentElement;
      if (parent) {
        const message = document.createElement('div');
        message.textContent = 'WebGL2 is required. This browser or device does not support WebGL2.';
        message.style.cssText =
          'display:flex;align-items:center;justify-content:center;width:100%;height:100%;padding:24px;text-align:center;color:#e0e0e0;background:#1a1a1a;font-family:system-ui,sans-serif;font-size:14px;';
        parent.replaceChildren(message);
      }
      this.projectorVisuals.clear();
      return;
    }

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl as WebGL2RenderingContext,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(targetPixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.debug.checkShaderErrors = true;
    this.canvas.style.touchAction = 'none';

    this.editorScene.background = new THREE.Color(0x1a1a1a);
    this.editorScene.add(this.contentGroup);
    this.editorScene.add(this.helpersGroup);

    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 10, 7);
    this.editorScene.add(ambient, directional);

    const grid = new THREE.GridHelper(20, 20, 0x555555, 0x333333);
    const axes = new THREE.AxesHelper(2);
    this.helpersGroup.add(grid, axes, this.measureGroup);

    this.editorCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.editorCamera.position.set(8, 6, 12);
    this.editorCamera.lookAt(0, 1.5, 0);

    this.controls = new OrbitControls(this.editorCamera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.panSpeed = 0.8;
    this.controls.target.set(0, 1.5, 0);
    this.controls.update();

    this.transformControls = new TransformControls(this.editorCamera, canvas);
    this.transformControls.setSpace('local');
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.gizmoDragging = event.value as boolean;
      if (this.controls) this.controls.enabled = !this.gizmoDragging;

      if (this.gizmoDragging) {
        this.callbacks.onHistoryCheckpoint?.();
      }

      if (this.gizmoDragging) {
        const obj = this.transformControls?.object;
        const isProjector =
          obj &&
          [...this.projectorVisuals.values()].some((visual) => visual.body === obj);
        if (obj && isProjector) {
          this.gizmoRotateStartQuat = obj.quaternion.clone();
          this.gizmoRotateStartEuler = quaternionToEulerYXZ([
            obj.quaternion.x,
            obj.quaternion.y,
            obj.quaternion.z,
            obj.quaternion.w,
          ]);
          const proj = this.findProjectorByBody(obj);
          if (proj?.lookAtEnabled && this.transformControls?.mode === 'rotate') {
            const target = this.lookAtTargetVec(proj);
            this.gizmoOrbitStartOffset = obj.position.clone().sub(target);
          }
        }
      } else if (!this.gizmoDragging) {
        this.gizmoRotateStartEuler = null;
        this.gizmoRotateStartQuat = null;
        this.gizmoOrbitStartOffset = null;
      }
    });
    this.transformControls.addEventListener('change', () => {
      this.handleGizmoChange();
    });
    this.helpersGroup.add(this.transformControls.getHelper());

    canvas.addEventListener('pointerdown', this.onPointerDown);

    this.depthPass = new DepthPass(this.currentDepthResolution, this.currentDepthResolution);
    this.applyDepthMapUniformSize(this.currentDepthResolution);

    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  get isWebglAvailable(): boolean {
    return this.webglAvailable;
  }

  setCallbacks(callbacks: SceneEngineCallbacks): void {
    this.callbacks = callbacks;
    callbacks.onWebglStatus?.(this.webglAvailable);
  }

  get maxTextureSize(): number {
    return this.renderer?.capabilities.maxTextureSize ?? 16384;
  }

  getRasterPreviewCanvas(projectorId: string): HTMLCanvasElement | null {
    return this.feedPass.getCanvas(projectorId);
  }

  /** Read one preview pixel (top-left canvas origin). */
  readRasterPreviewPixel(
    projectorId: string,
    x: number,
    y: number,
  ): [number, number, number, number] | null {
    const canvas = this.feedPass.getCanvas(projectorId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const px = Math.max(0, Math.min(canvas.width - 1, Math.floor(x)));
    const py = Math.max(0, Math.min(canvas.height - 1, Math.floor(y)));
    const data = ctx.getImageData(px, py, 1, 1).data;
    return [data[0], data[1], data[2], data[3]];
  }

  setViewPreset(preset: ViewPreset): void {
    if (!this.editorCamera || !this.controls || this.currentViewPreset === preset) return;
    this.currentViewPreset = preset;
    this.editorCamera.up.set(0, 1, 0);

    switch (preset) {
      case 'persp':
        this.editorCamera.position.set(8, 6, 12);
        break;
      case 'top':
        this.editorCamera.position.set(0, 20, 0.001);
        this.editorCamera.up.set(0, 0, -1);
        break;
      case 'front':
        this.editorCamera.position.set(0, 1.5, 20);
        break;
      case 'side':
        this.editorCamera.position.set(20, 1.5, 0);
        break;
    }

    this.editorCamera.lookAt(this.viewTarget);
    this.controls.target.copy(this.viewTarget);
    this.controls.update();
  }

  private onResize = (): void => {
    this.resize();
  };

  private resize(): void {
    if (!this.renderer || !this.editorCamera) return;
    this.syncRenderQuality();
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? this.canvas.clientWidth;
    const height = parent?.clientHeight ?? this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.editorCamera.aspect = width / height;
    this.editorCamera.updateProjectionMatrix();
  }

  private syncRenderQuality(): void {
    if (!this.renderer) return;

    const pixelRatio = targetPixelRatio();
    if (this.renderer.getPixelRatio() !== pixelRatio) {
      this.renderer.setPixelRatio(pixelRatio);
    }

    const depthSize = depthPassResolution();
    if (depthSize === this.currentDepthResolution) return;

    this.currentDepthResolution = depthSize;
    this.depthPass?.dispose();
    this.depthPass = new DepthPass(depthSize, depthSize);
    for (const pass of this.depthPassByProjector.values()) pass.dispose();
    this.depthPassByProjector.clear();
    this.applyDepthMapUniformSize(depthSize);
  }

  private applyDepthMapUniformSize(size: number): void {
    this.multiProjectiveMaterial.uniforms.depthMapSize.value.set(size, size);
  }

  sync(state: AppState): void {
    if (!this.webglAvailable || this.disposed) return;
    this.syncRevision += 1;

    if (state.viewPreset !== this.currentViewPreset) {
      this.setViewPreset(state.viewPreset);
    }

    if (state.transformMode !== this.currentTransformMode) {
      this.currentTransformMode = state.transformMode;
      this.transformControls?.setMode(state.transformMode);
    }

    this.syncSceneObjects(state.sceneObjects, this.gizmoDragging);
    this.sceneObjects = state.sceneObjects;
    this.materialPreviewMode = state.materialPreviewMode;
    this.projectionCompositeMode = state.projectionCompositeMode;
    this.show = state.show;
    this.playMode = state.playMode;
    this.showProjectionBeam = state.showProjectionBeam;
    this.calculationTargetId = state.calculationTargetId;
    this.rasterPreviewPanelVisible = state.rasterPreviewPanelVisible;
    this.blendSettings = state.blendSettings;
    this.maxOverlap = state.blendAnalysis?.maxOverlap ?? Math.min(2, state.projectors.filter((p) => p.enabled).length);
    this.syncProjectors(
      state.projectors,
      state.selectedProjectorId,
      state.sceneObjects,
      this.gizmoDragging,
    );
    if (state.measureMode) {
      this.transformControls?.detach();
    } else {
      this.syncSelectionGizmo(state.selectedObjectId, state.projectors);
    }
    this.syncMeasureOverlay(state.measureMode, state.measurePoints);
  }

  private syncMeasureOverlay(
    measureMode: boolean,
    measurePoints: [{ x: number; y: number; z: number } | null, { x: number; y: number; z: number } | null],
  ): void {
    this.measureMode = measureMode;

    if (this.measureLine) {
      this.measureGroup.remove(this.measureLine);
      this.measureLine.geometry.dispose();
      (this.measureLine.material as THREE.Material).dispose();
      this.measureLine = null;
    }
    for (const marker of this.measureMarkers) {
      this.measureGroup.remove(marker);
      marker.geometry.dispose();
      (marker.material as THREE.Material).dispose();
    }
    this.measureMarkers.length = 0;

    if (!measureMode) {
      this.measureGroup.visible = false;
      return;
    }

    this.measureGroup.visible = true;
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffeb3b });

    for (const point of measurePoints) {
      if (!point) continue;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xffeb3b }),
      );
      marker.position.set(point.x, point.y, point.z);
      this.measureGroup.add(marker);
      this.measureMarkers.push(marker);
    }

    const [a, b] = measurePoints;
    if (a && b) {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, a.y, a.z),
        new THREE.Vector3(b.x, b.y, b.z),
      ]);
      this.measureLine = new THREE.Line(geometry, lineMat);
      this.measureGroup.add(this.measureLine);
    }
  }

  private syncSelectionGizmo(selectedId: string | null, projectors: ProjectorConfig[]): void {
    if (this.measureMode || !this.transformControls) return;

    if (!selectedId) {
      this.transformControls.detach();
      return;
    }

    const obj3d = this.objectMeshes.get(selectedId);
    if (obj3d) {
      if (this.transformControls.object !== obj3d) {
        this.transformControls.attach(obj3d);
      }
      this.transformControls.setMode(this.currentTransformMode);
      return;
    }

    const projector = projectors.find((p) => p.id === selectedId);
    if (projector) {
      const visual = this.projectorVisuals.get(projector.id);
      if (visual && this.transformControls.object !== visual.body) {
        this.transformControls.attach(visual.body);
      }
      this.transformControls.setMode(this.currentTransformMode);
      return;
    }

    this.transformControls.detach();
  }

  private lookAtTargetVec(projector: ProjectorConfig): THREE.Vector3 {
    const t = projector.lookAtTarget ?? { x: 0, y: 1.5, z: 0 };
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  private findProjectorByBody(body: THREE.Object3D): ProjectorConfig | undefined {
    for (const [projId, visual] of this.projectorVisuals) {
      if (visual.body === body) {
        return this.allProjectors.find((p) => p.id === projId);
      }
    }
    return undefined;
  }

  private handleGizmoChange(): void {
    const tc = this.transformControls;
    const obj = tc?.object;
    if (!obj || !tc) return;

    let q = obj.quaternion;
    const projector = this.findProjectorByBody(obj);
    const isProjector = projector != null;

    if (isProjector && projector.lookAtEnabled) {
      const target = this.lookAtTargetVec(projector);
      const start = this.gizmoRotateStartEuler;
      const pos = { x: obj.position.x, y: obj.position.y, z: obj.position.z };

      if (
        this.currentTransformMode === 'rotate' &&
        start &&
        this.gizmoRotateStartQuat &&
        this.gizmoOrbitStartOffset &&
        tc.axis &&
        (tc.axis === 'X' || tc.axis === 'Y' || tc.axis === 'Z')
      ) {
        const qDelta = this.gizmoRotateStartQuat.clone().invert().multiply(q).normalize();
        const angleDeg = deltaAngleDegreesForAxis(qDelta, tc.axis);

        if (tc.axis === 'Z') {
          const roll = start.roll + angleDeg;
          const quat = computeProjectorLookAtQuaternion(pos, target, roll);
          obj.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
        } else {
          const newOffset = this.gizmoOrbitStartOffset.clone().applyQuaternion(qDelta);
          const newPos = target.clone().add(newOffset);
          obj.position.copy(newPos);
          const quat = computeProjectorLookAtQuaternion(
            { x: newPos.x, y: newPos.y, z: newPos.z },
            { x: target.x, y: target.y, z: target.z },
            start.roll,
          );
          obj.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
        }
      } else if (this.currentTransformMode === 'translate') {
        const roll = start?.roll ?? rollFromProjectorQuaternion(projector.transform.quaternion);
        const quat = computeProjectorLookAtQuaternion(pos, target, roll);
        obj.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
      }
      q = obj.quaternion;
    } else if (
      isProjector &&
      this.currentTransformMode === 'rotate' &&
      this.gizmoRotateStartEuler &&
      this.gizmoRotateStartQuat &&
      tc.axis &&
      (tc.axis === 'X' || tc.axis === 'Y' || tc.axis === 'Z')
    ) {
      const qDelta = this.gizmoRotateStartQuat.clone().invert().multiply(q).normalize();
      const angleDeg = deltaAngleDegreesForAxis(qDelta, tc.axis);
      const start = this.gizmoRotateStartEuler;
      const yaw = tc.axis === 'Y' ? start.yaw + angleDeg : start.yaw;
      const pitch = tc.axis === 'X' ? start.pitch + angleDeg : start.pitch;
      const roll = tc.axis === 'Z' ? start.roll + angleDeg : start.roll;
      const quat = eulerYXZToQuaternion(yaw, pitch, roll);
      obj.quaternion.set(quat[0], quat[1], quat[2], quat[3]);
      q = obj.quaternion;
    }

    const payload = {
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      quaternion: [q.x, q.y, q.z, q.w] as [number, number, number, number],
    };

    for (const [projId, visual] of this.projectorVisuals) {
      if (visual.body === obj) {
        this.callbacks.onTransformChange?.(projId, payload);
        return;
      }
    }

    const id = obj.userData.id as string | undefined;
    if (!id) return;

    this.callbacks.onTransformChange?.(id, payload);
  }

  private updateGizmoScale(): void {
    if (!this.transformControls || !this.editorCamera || !this.transformControls.object) return;

    const obj = this.transformControls.object;
    obj.updateMatrixWorld(true);
    const worldPos = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
    const dist = this.editorCamera.position.distanceTo(worldPos);
    const fovFactor = Math.min(
      1.9 * Math.tan((Math.PI * this.editorCamera.fov) / 360),
      7,
    );
    const raw = SceneEngine.GIZMO_WORLD_SIZE / Math.max(dist * fovFactor, 0.01);
    this.transformControls.size = THREE.MathUtils.clamp(raw, 0.35, 2.5);
  }

  private pickWorldPoint(): THREE.Vector3 | null {
    if (!this.editorCamera) return null;

    const pickables: THREE.Object3D[] = [];
    for (const mesh of this.objectMeshes.values()) {
      if (mesh.visible) pickables.push(mesh);
    }
    for (const visual of this.projectorVisuals.values()) {
      if (visual.body.visible) pickables.push(visual.body);
    }

    const hits = this.raycaster.intersectObjects(pickables, true);
    if (hits.length > 0) return hits[0].point.clone();

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, target) ? target : null;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.editorCamera || this.gizmoDragging || event.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.editorCamera);

    if (this.measureMode) {
      const point = this.pickWorldPoint();
      if (point) {
        this.callbacks.onMeasurePoint?.({ x: point.x, y: point.y, z: point.z });
      }
      return;
    }

    const pickables: THREE.Object3D[] = [];
    for (const mesh of this.objectMeshes.values()) {
      if (mesh.visible) pickables.push(mesh);
    }
    for (const visual of this.projectorVisuals.values()) {
      if (visual.body.visible) pickables.push(visual.body);
    }

    const hits = this.raycaster.intersectObjects(pickables, true);
    if (hits.length === 0) return;

    const hit = hits[0].object;
    let id = hit.userData.pickId as string | undefined;
    if (!id) {
      let current: THREE.Object3D | null = hit;
      while (current) {
        id = current.userData.pickId as string | undefined;
        if (id) break;
        id = current.userData.id as string | undefined;
        if (id) break;
        current = current.parent;
      }
    }
    if (id) this.callbacks.onSelect?.(id);
  };

  private syncSceneObjects(sceneObjects: SceneObject[], skipTransforms = false): void {
    const nextIds = new Set(sceneObjects.map((obj) => obj.id));

    for (const [id, obj3d] of this.objectMeshes) {
      if (!nextIds.has(id)) {
        this.contentGroup.remove(obj3d);
        disposeObject3D(obj3d);
        this.objectMeshes.delete(id);
      }
    }

    for (const obj of sceneObjects) {
      const dimKey = dimensionsKey(obj);
      let obj3d = this.objectMeshes.get(obj.id);

      if (!obj3d || obj3d.userData.dimKey !== dimKey) {
        if (obj3d) {
          this.contentGroup.remove(obj3d);
          disposeObject3D(obj3d);
        }
        obj3d = createObjectMesh(obj);
        obj3d.userData.dimKey = dimKey;
        this.objectMeshes.set(obj.id, obj3d);
        this.contentGroup.add(obj3d);
      }

      if (!skipTransforms) {
        obj3d.position.set(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z);
        obj3d.quaternion.set(...obj.transform.quaternion);
        if (obj.type === 'model') {
          const scale = obj.modelScale ?? 1;
          obj3d.scale.setScalar(scale);
        }
      } else if (obj.type === 'model') {
        const scale = obj.modelScale ?? 1;
        if (obj3d.scale.x !== scale) obj3d.scale.setScalar(scale);
      }
      obj3d.visible = obj.visibleInEditor;
      obj3d.userData.id = obj.id;
      obj3d.userData.receivesProjection = obj.receivesProjection;
      obj3d.userData.blocksProjection = obj.blocksProjection;
      if (obj.type === 'ledWall') {
        const mesh = obj3d as THREE.Mesh;
        if (mesh.material instanceof THREE.ShaderMaterial) {
          updateLedWallMaterial(mesh.material, obj);
        }
        mesh.userData.isLedWall = true;
      } else if (obj.receivesProjection) {
        const sidesInt = supportsProjectionSides(obj.type)
          ? projectionSidesToInt(normalizeProjectionSides(obj))
          : 0;
        syncReceiverMeshHooks(
          obj3d,
          obj,
          sidesInt,
          (key, multi) => this.resolveOcclusionDepth(key, multi),
        );
      }
    }
  }

  private resolveOcclusionDepth(
    key: OcclusionDepthKey,
    multi: boolean,
  ): THREE.Texture | THREE.Texture[] | null {
    if (multi) {
      if (this.occlusionDepthMulti.has(key)) return this.occlusionDepthMulti.get(key) ?? null;
      return key === 'all' ? null : this.occlusionDepthMulti.get('all') ?? null;
    }
    if (this.occlusionDepthSingle.has(key)) return this.occlusionDepthSingle.get(key) ?? null;
    return key === 'all' ? null : this.occlusionDepthSingle.get('all') ?? null;
  }

  private blockerRoots(): { id: string; root: THREE.Object3D; blocksProjection: boolean }[] {
    return [...this.objectMeshes.entries()].map(([id, root]) => ({
      id,
      root,
      blocksProjection: Boolean(root.userData.blocksProjection),
    }));
  }

  private buildOcclusionDepthMaps(projectors: ProjectorConfig[]): boolean {
    this.occlusionDepthSingle.clear();
    this.occlusionDepthMulti.clear();

    const blockerEntries = this.blockerRoots().filter((entry) => entry.blocksProjection);
    if (blockerEntries.length === 0) return false;

    const receiverEntries = [...this.objectMeshes.entries()].map(([id, root]) => ({
      id,
      blocksProjection: Boolean(root.userData.blocksProjection),
      receivesProjection: Boolean(root.userData.receivesProjection),
    }));
    const keys = requiredOcclusionDepthKeys(receiverEntries);

    // v2: every projector count goes through the unified multi-projector shader.
    const texturesByKey = new Map<OcclusionDepthKey, THREE.Texture[]>();
    for (const key of keys) {
      const meshes = collectBlockerMeshes(
        blockerEntries,
        excludeObjectIdFromDepthKey(key),
      );
      if (meshes.length === 0) {
        this.occlusionDepthMulti.set(key, null);
        continue;
      }
      const textures: THREE.Texture[] = [];
      for (const projector of projectors.slice(0, 4)) {
        // One target per (projector, key): keys exclude different blockers, so they
        // must not overwrite each other's depth map within a frame.
        const passKey = `${projector.id}|${key}`;
        let pass = this.depthPassByProjector.get(passKey);
        if (!pass) {
          pass = new DepthPass(this.currentDepthResolution, this.currentDepthResolution);
          this.depthPassByProjector.set(passKey, pass);
        }
        const worldMatrix = getProjectorWorldMatrix(projector);
        const projectorCamera = buildProjectorCamera(projector.optics, worldMatrix);
        textures.push(pass.render(this.renderer!, this.editorScene, projectorCamera, meshes));
      }
      texturesByKey.set(key, textures);
      this.occlusionDepthMulti.set(key, textures);
    }
    return texturesByKey.size > 0;
  }

  /** UV health of an object's meshes (overlap / outside 0–1), cached per mesh build. */
  getUvReport(objectId: string): UvReport | null {
    const root = this.objectMeshes.get(objectId);
    if (!root) return null;
    if (!root.userData.uvReport) root.userData.uvReport = uvReportForMeshes(collectMeshes(root));
    return root.userData.uvReport as UvReport;
  }

  /** Canvas CSS-pixel position (top-left origin) of a world point in the editor view. For tests only. */
  worldToCanvas(x: number, y: number, z: number): { x: number; y: number } | null {
    if (!this.editorCamera) return null;
    this.editorCamera.updateMatrixWorld(true);
    const p = new THREE.Vector3(x, y, z).project(this.editorCamera);
    const rect = this.canvas.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * rect.width, y: ((1 - p.y) / 2) * rect.height };
  }

  /** Read one canvas pixel after rendering (bottom-left WebGL origin). For tests only. */
  readCanvasPixel(x: number, y: number): [number, number, number, number] | null {
    if (!this.renderer) return null;
    // The drawing buffer is not preserved between frames: render and read in one task.
    this.render();
    const gl = this.renderer.getContext();
    const ratio = this.renderer.getPixelRatio();
    const px = Math.floor(x * ratio);
    const py = Math.floor(this.renderer.domElement.height - y * ratio);
    const out = new Uint8Array(4);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0], out[1], out[2], out[3]];
  }

  private ensureProjectorVisual(id: string): { body: THREE.Mesh; frustum: FrustumHelper } {
    let visual = this.projectorVisuals.get(id);
    if (visual) return visual;

    const bodyGeo = new THREE.BoxGeometry(0.35, 0.18, 0.45);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    const frustum = new FrustumHelper();
    this.helpersGroup.add(body, frustum);
    visual = { body, frustum };
    this.projectorVisuals.set(id, visual);
    return visual;
  }

  private syncLookAtMarker(projector: ProjectorConfig): void {
    let marker = this.lookAtMarkers.get(projector.id);
    if (!projector.lookAtEnabled) {
      if (marker) marker.visible = false;
      return;
    }

    if (!marker) {
      const geo = new THREE.SphereGeometry(0.12, 12, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xff9800,
        emissive: 0xff9800,
        emissiveIntensity: 0.35,
      });
      marker = new THREE.Mesh(geo, mat);
      marker.userData.pickId = `lookat-${projector.id}`;
      this.lookAtMarkers.set(projector.id, marker);
      this.helpersGroup.add(marker);
    }

    const t = projector.lookAtTarget ?? { x: 0, y: 1.5, z: 0 };
    marker.position.set(t.x, t.y, t.z);
    marker.visible = projector.enabled;
  }

  private syncProjectors(
    projectors: ProjectorConfig[],
    selectedProjectorId: string,
    sceneObjects: SceneObject[],
    skipTransforms = false,
  ): void {
    this.allProjectors = projectors;
    this.selectedProjectorId = selectedProjectorId;
    const enabled = projectors.filter((p) => p.enabled);
    this.activeProjectors = enabled;
    const planarScreen = buildPlanarScreen(sceneObjects, this.calculationTargetId);
    const curvedScreen = buildCurvedScreenSurface(sceneObjects, this.calculationTargetId);

    const nextIds = new Set(projectors.map((p) => p.id));
    for (const [id, marker] of this.lookAtMarkers) {
      if (!nextIds.has(id)) {
        this.helpersGroup.remove(marker);
        marker.geometry.dispose();
        (marker.material as THREE.Material).dispose();
        this.lookAtMarkers.delete(id);
      }
    }
    for (const [id, visual] of this.projectorVisuals) {
      if (!nextIds.has(id)) {
        this.helpersGroup.remove(visual.body, visual.frustum);
        visual.body.geometry.dispose();
        (visual.body.material as THREE.Material).dispose();
        visual.frustum.dispose();
        this.projectorVisuals.delete(id);
        for (const [passKey, pass] of this.depthPassByProjector) {
          if (passKey.startsWith(`${id}|`)) {
            pass.dispose();
            this.depthPassByProjector.delete(passKey);
          }
        }
        this.feedPass.disposeProjector(id);
      }
    }

    for (const projector of projectors) {
      const visual = this.ensureProjectorVisual(projector.id);
      visual.body.userData.pickId = projector.id;

      const showInViewport =
        projector.enabled &&
        (this.projectionCompositeMode !== 'solo' || projector.id === selectedProjectorId);

      visual.body.visible = showInViewport;

      if (!projector.enabled || !showInViewport) {
        visual.frustum.visible = false;
        continue;
      }

      const worldMatrix = getProjectorWorldMatrix(projector);
      if (!skipTransforms) {
        const position = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(worldMatrix);
        visual.body.position.copy(position);
        visual.body.quaternion.copy(quaternion);
      }

      const cornerRays = CORNER_UV.map(([u, v]) => unprojectRasterRay(projector.optics, u, v, worldMatrix));

      let footprintCorners: { x: number; y: number; z: number }[] | null = null;
      let footprintOutline: { x: number; y: number; z: number }[] | undefined;
      let axialDistance: number | null = null;
      if (planarScreen) {
        const footprint = computePlanarFootprint(projector.optics, worldMatrix, planarScreen);
        axialDistance = footprint.axialDistance;
        if (footprint.corners.length === 4) {
          footprintCorners = offsetCornersAlongNormal(footprint.corners, planarScreen.normal, 0.01);
        }
      } else if (curvedScreen) {
        const footprint = computeCurvedFootprint(projector.optics, worldMatrix, curvedScreen);
        axialDistance = footprint.axialDistance;
        if (footprint.corners.length === 4) {
          footprintCorners = footprint.corners;
          footprintOutline = footprint.beamOutline;
        }
      }

      const previewLength = Math.max(
        2,
        axialDistance ??
          Math.hypot(
            projector.transform.position.x,
            projector.transform.position.y,
            projector.transform.position.z,
          ),
      );

      this.syncLookAtMarker(projector);

      visual.frustum.updateVisuals(cornerRays, projector.color, {
        footprintCorners,
        footprintOutline,
        showBeamRays: this.showProjectionBeam,
        shortFrustumLength: previewLength,
      });

      visual.frustum.visible = this.showProjectionBeam;
    }
  }

  start(): void {
    if (!this.webglAvailable || this.disposed) return;
    outputWindows.setFrameDriver(() => {
      if (!this.disposed && performance.now() - this.lastFrameAt > 45) this.render();
    });
    const loop = () => {
      if (this.disposed) return;
      this.animationId = requestAnimationFrame(loop);
      this.render();
    };
    loop();
  }

  private render(): void {
    if (!this.renderer || !this.editorCamera || !this.depthPass || this.disposed) return;

    const frameStart = performance.now();
    this.lastFrameAt = frameStart;

    this.controls?.update();
    this.resize();
    this.updateGizmoScale();
    this.editorScene.updateMatrixWorld(true);

    // v4: timeline → live layers → media sync → screen textures → content feeds.
    const track = activeTrack(this.show);
    // Section end actions, play modes and the end of the track.
    if (transport.playing) {
      const now = transport.time();
      const step = this.lastPlayhead === null ? ({ kind: 'none' } as const) : transportStep(track, this.lastPlayhead, now, this.playMode);
      const end = now >= track.durationSec;
      if (step.kind === 'seek') transport.seek(step.to);
      else if (step.kind === 'pause') {
        transport.pause();
        transport.seek(step.at);
      } else if (end) {
        transport.pause();
        transport.seek(track.durationSec);
      }
    }
    const t = transport.time();
    this.lastPlayhead = t;
    this.liveLayers = evaluate(track, t, (id) => mediaTextureCache.get(id)?.video?.duration ?? null, this.show.fps);
    this.mediaSync.setTime(t);
    // Pre-roll the next play() only when videos are involved.
    transport.prerollMs = track.layers.some((l) => l.enabled && l.media.kind === 'video') ? this.mediaSync.startupMs : 0;
    this.mediaSync.sync(this.liveLayers, track, transport.playing, transport.rate, this.show.fps, transport);
    mediaTextureCache.updateVideos();
    this.renderContent();

    const receivers = this.getReceiverRoots();
    let projectorsToRender = this.activeProjectors;

    if (this.projectionCompositeMode === 'solo') {
      const selected =
        this.allProjectors.find((p) => p.id === this.selectedProjectorId && p.enabled) ??
        projectorsToRender[0];
      projectorsToRender = selected ? [selected] : [];
    }

    const savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

    if (this.materialPreviewMode !== 'original' && projectorsToRender.length > 0) {
      const hasOcclusion = this.buildOcclusionDepthMaps(projectorsToRender);

      {
        const defaultDepths = this.occlusionDepthMulti.get('all');
        updateMultiProjectiveMaterial(
          this.multiProjectiveMaterial,
          projectorsToRender.slice(0, 4),
          defaultDepths ?? [],
          this.projectionCompositeMode,
          this.materialPreviewMode === 'projectionUv',
          this.materialPreviewMode === 'falloff',
          this.feedTexturesFor(projectorsToRender.slice(0, 4)),
        );
        applyAdvancedBlendUniforms(
          this.multiProjectiveMaterial,
          this.blendSettings,
          this.maxOverlap,
          this.previewKind(),
        );
        this.multiProjectiveMaterial.uniforms.feedIndex.value = -1;
        this.multiProjectiveMaterial.uniforms.useOcclusion.value = hasOcclusion ? 1 : 0;
        this.multiProjectiveMaterial.uniforms.depthMapSize.value.set(
          this.depthPass!.target.width,
          this.depthPass!.target.height,
        );

        for (const root of receivers) {
          const meshes = collectMeshes(root);
          if (meshes.length > 0) {
            (this.multiProjectiveMaterial.uniforms.surfaceBaseColor.value as THREE.Color).copy(
              meshBaseColor(meshes[0]),
            );
          }
          for (const mesh of meshes) {
            savedMaterials.set(mesh, mesh.material);
            mesh.material = this.multiProjectiveMaterial;
          }
        }
      }
    }

    this.renderer.render(this.editorScene, this.editorCamera);

    for (const [mesh, material] of savedMaterials) {
      mesh.material = material;
    }

    this.renderRasterPreviews();
    this.renderOutputWindows();

    this.callbacks.onFrameTime?.(performance.now() - frameStart);
  }

  /** Screens: visible projection receivers and LED walls. */
  private bakeSurfaces(): BakeSurface[] {
    const out: BakeSurface[] = [];
    for (const obj of this.sceneObjects) {
      const root = this.objectMeshes.get(obj.id);
      if (!root || !root.visible) continue;
      if (obj.type !== 'ledWall' && !obj.receivesProjection) continue;
      out.push({ obj, root, meshes: collectMeshes(root), frame: surfaceFrameOf(root) });
    }
    return out;
  }

  private readonly mediaOf = (layer: { id: string }) => this.mediaSync.media(layer.id);

  private screenTextureMax(): number {
    return Math.min(SCREEN_TEXTURE_MAX[getDeviceProfile()], this.maxTextureSize);
  }

  private contentFeedMax(): number {
    if (outputWindows.list().length > 0) return 4096;
    return getDeviceProfile() === 'phone' ? 1280 : 2048;
  }

  private feedTexturesFor(projectors: ProjectorConfig[]): (THREE.Texture | null)[] {
    return projectors.map((p) => this.feedPass.contentTexture(p.id));
  }

  private assignScreenTextures(surfaces: BakeSurface[]): void {
    for (const s of surfaces) {
      const tex = this.baker.texture(s.obj.id);
      for (const mesh of s.meshes) mesh.userData.screenTexture = tex;
    }
  }

  /**
   * Bake screen textures and render every active projector's content feed.
   * Projector-only mappings need that projector's own bake, so those projectors are
   * handled first; the shared bake runs last and stays on the screens (LED walls).
   */
  private renderContent(): void {
    if (!this.renderer) return;
    // Static content (no video playing, nothing changed) keeps last frame's textures.
    const hasVideo = this.liveLayers.some((l) => l.layer.media.kind === 'video');
    const key = [
      this.syncRevision,
      mediaTextureCache.version,
      outputWindows.list().length,
      getDeviceProfile(),
      this.liveLayers.map((l) => `${l.layer.id}:${l.opacity.toFixed(4)}`).join(','),
    ].join('|');
    if (!hasVideo && key === this.lastContentKey) return;
    this.lastContentKey = key;
    const surfaces = this.bakeSurfaces();
    this.baker.retain(new Set(surfaces.map((s) => s.obj.id)));
    const maxDim = this.screenTextureMax();
    const mappings = this.show.mappings;
    const projectors = this.activeProjectors.slice(0, 4);
    this.feedPass.retainContent(new Set(projectors.map((p) => p.id)));
    const exclusive = new Set<string>();
    for (const entry of this.liveLayers) {
      const m = mappings.find((mp) => mp.id === entry.layer.mappingId);
      const lock = m?.perspective?.lockToProjectorId;
      if (m && lock && !mappingVisibleTo(m, null)) exclusive.add(lock);
    }
    const receiverMeshes = this.getReceiverRoots().flatMap((root) => collectMeshes(root));
    const needFeeds = projectors.length > 0;
    if (needFeeds) this.buildOcclusionDepthMaps(projectors);
    const maxFeed = this.contentFeedMax();
    const renderFeed = (projector: ProjectorConfig, index: number) => {
      this.feedPass.renderContentFeed(
        this.renderer!,
        projector,
        index,
        receiverMeshes,
        (material) => this.prepareFeedMaterial(material, projectors, false, false),
        maxFeed,
      );
    };
    projectors.forEach((projector, index) => {
      if (!exclusive.has(projector.id)) return;
      this.baker.bake(this.renderer!, surfaces, this.liveLayers, mappings, this.allProjectors, projector.id, maxDim, this.mediaOf);
      this.assignScreenTextures(surfaces);
      renderFeed(projector, index);
    });
    this.baker.bake(this.renderer, surfaces, this.liveLayers, mappings, this.allProjectors, null, maxDim, this.mediaOf);
    this.assignScreenTextures(surfaces);
    projectors.forEach((projector, index) => {
      if (!exclusive.has(projector.id)) renderFeed(projector, index);
    });
    for (const s of surfaces) {
      if (s.obj.type !== 'ledWall') continue;
      const mat = (s.root as THREE.Mesh).material;
      if (mat instanceof THREE.ShaderMaterial) setLedWallTexture(mat, this.baker.texture(s.obj.id));
    }
  }

  private previewKind(): PreviewKind {
    if (this.materialPreviewMode === 'blendSum') return 'blendSum';
    if (this.materialPreviewMode === 'surfaceUv') return 'surfaceUv';
    return 'normal';
  }

  /** Projectors participating in compositing (same set as the viewport). */
  private compositedProjectors(): ProjectorConfig[] {
    if (this.projectionCompositeMode === 'solo') {
      const selected =
        this.allProjectors.find((p) => p.id === this.selectedProjectorId && p.enabled) ??
        this.activeProjectors[0];
      return selected ? [selected] : [];
    }
    return this.activeProjectors.slice(0, 4);
  }

  private prepareFeedMaterial(
    material: THREE.ShaderMaterial,
    projectors: ProjectorConfig[],
    forceBlend: boolean,
    withFeeds = true,
  ): void {
    const compositeMode = forceBlend ? 'blended' : this.projectionCompositeMode;
    updateMultiProjectiveMaterial(
      material,
      projectors,
      this.occlusionDepthMulti.get('all') ?? [],
      compositeMode === 'heatmap' ? 'blended' : compositeMode,
      false,
      false,
      withFeeds ? this.feedTexturesFor(projectors) : [],
    );
    applyAdvancedBlendUniforms(material, this.blendSettings, this.maxOverlap, 'normal');
    material.uniforms.depthMapSize.value.set(this.currentDepthResolution, this.currentDepthResolution);
  }

  private renderRasterPreviews(): void {
    if (!this.renderer) return;
    if (!this.rasterPreviewPanelVisible) {
      if (this.rasterPreviewWasVisible) this.feedPass.releaseTargets();
      this.rasterPreviewWasVisible = false;
      return;
    }

    const force = !this.rasterPreviewWasVisible;
    this.rasterPreviewWasVisible = true;
    const projectors = this.compositedProjectors();
    if (projectors.length === 0) return;
    this.buildOcclusionDepthMaps(projectors);
    const meshes = this.getReceiverRoots().flatMap((root) => collectMeshes(root));
    const updated = this.feedPass.renderPreviews(
      this.renderer,
      projectors,
      meshes,
      (material) => this.prepareFeedMaterial(material, projectors, false),
      force,
      getDeviceProfile(),
    );
    if (updated) this.callbacks.onRasterPreview?.();
  }

  /**
   * v2: stream projector feeds / masks to open output windows (other displays).
   * GPU → async readback (no pipeline stall) → the popup's canvas. A window whose
   * previous frame is still in flight skips this frame.
   */
  private renderOutputWindows(): void {
    const entries = outputWindows.list();
    this.collectOutputFrames();
    for (const id of [...this.outputTargets.keys()]) {
      if (!outputWindows.get(id)) this.disposeOutputSlot(id);
    }
    if (!this.renderer || entries.length === 0) return;
    const projectors = this.activeProjectors.slice(0, 4);
    let depthBuilt = false;
    let meshes: THREE.Mesh[] | null = null;
    for (const entry of entries) {
      if (entry.win.closed) continue;
      const projector = this.allProjectors.find((p) => p.id === entry.config.projectorId);
      if (!projector) continue;
      if (projector.name !== entry.title) outputWindows.update(entry.id, { title: projector.name });
      const scale = entry.config.scale;
      const width = Math.max(1, Math.round(projector.optics.resolution.width * scale));
      const height = Math.max(1, Math.round(projector.optics.resolution.height * scale));
      if (entry.config.content === 'grid') {
        if (!entry.frameSize || entry.frameSize.width !== width || entry.frameSize.height !== height) {
          outputWindows.drawGrid(entry, width, height);
        }
        continue;
      }
      if (entry.pending) continue;
      const index = projectors.findIndex((p) => p.id === projector.id);
      let slot = this.outputTargets.get(entry.id);
      if (!slot || slot.target.width !== width || slot.target.height !== height) {
        if (slot) this.disposeOutputSlot(entry.id);
        entry.pending = false;
        slot = {
          target: new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
          }),
          pixels: new Uint8Array(width * height * 4),
          pbo: null,
          sync: null,
          issuedAt: 0,
        };
        this.outputTargets.set(entry.id, slot);
      }
      const renderer = this.renderer;
      if (index < 0) {
        // Disabled projector: output black.
        const prev = renderer.getRenderTarget();
        const prevColor = renderer.getClearColor(new THREE.Color());
        const prevAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(slot.target);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.setRenderTarget(prev);
        renderer.setClearColor(prevColor, prevAlpha);
      } else {
        if (!depthBuilt) {
          this.buildOcclusionDepthMaps(projectors);
          depthBuilt = true;
        }
        meshes ??= this.getReceiverRoots().flatMap((root) => collectMeshes(root));
        this.feedPass.renderToTarget(
          renderer,
          projectors,
          index,
          entry.config.content === 'mask' ? 'mask' : 'color',
          meshes,
          (material) => this.prepareFeedMaterial(material, projectors, entry.config.content === 'mask'),
          slot.target,
        );
      }
      // Non-blocking readback: copy into a pixel-pack buffer now, collect it on a later
      // frame once the GPU fence has signalled (polled from whichever window animates).
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const prevTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(slot.target);
      if (!slot.pbo) slot.pbo = gl.createBuffer();
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, width * height * 4, gl.STREAM_READ);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      renderer.setRenderTarget(prevTarget);
      slot.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      slot.issuedAt = performance.now();
      gl.flush();
      entry.pending = true;
    }
  }

  private disposeOutputSlot(id: string): void {
    const slot = this.outputTargets.get(id);
    if (!slot) return;
    const gl = this.renderer?.getContext() as WebGL2RenderingContext | undefined;
    if (gl) {
      if (slot.sync) gl.deleteSync(slot.sync);
      if (slot.pbo) gl.deleteBuffer(slot.pbo);
    }
    slot.target.dispose();
    this.outputTargets.delete(id);
  }

  /** Collect finished output readbacks and paint them into their windows. */
  private collectOutputFrames(): void {
    if (!this.renderer || this.outputTargets.size === 0) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    for (const [id, slot] of this.outputTargets) {
      if (!slot.sync || !slot.pbo) continue;
      // Normally the fence has signalled by the next frame. Some browsers only update
      // fence status while the main window is presenting frames (not when it is hidden
      // behind a full-screen output), so after a short grace period read anyway —
      // getBufferSubData then waits for the copy, which is still just one frame late.
      const signalled = gl.getSyncParameter(slot.sync, gl.SYNC_STATUS) === gl.SIGNALED;
      if (!signalled && performance.now() - slot.issuedAt < 30) continue;
      gl.deleteSync(slot.sync);
      slot.sync = null;
      const { width, height } = slot.target;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, slot.pbo);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, slot.pixels, 0, width * height * 4);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      const entry = outputWindows.get(id);
      if (entry) {
        entry.pending = false;
        if (entry.config.content !== 'grid') outputWindows.pushFrame(id, slot.pixels, width, height);
      }
    }
  }

  /**
   * v2: render one projector's full-resolution feed or blend mask and return it as a
   * canvas (top-left origin). Masks are always computed with blending on.
   */
  renderProjectorFeed(projectorId: string, kind: FeedKind, maxLongEdge = 4096): HTMLCanvasElement | null {
    if (!this.renderer) return null;
    const projectors = this.activeProjectors.slice(0, 4);
    if (!projectors.some((p) => p.id === projectorId)) return null;
    this.editorScene.updateMatrixWorld(true);
    this.buildOcclusionDepthMaps(projectors);
    const meshes = this.getReceiverRoots().flatMap((root) => collectMeshes(root));
    return this.feedPass.renderFull(
      this.renderer,
      projectors,
      projectorId,
      kind,
      meshes,
      (material) => this.prepareFeedMaterial(material, projectors, kind === 'mask'),
      maxLongEdge,
    );
  }

  /**
   * v2: wireframe of a receiving object's raw surface UV layout for the UV editor
   * (segments in 0–1 surface UV, before region / flip / rotate).
   */
  getSurfaceUvSegments(objectId: string, projection: SurfaceUvProjection, maxSegments = 2500): [number, number, number, number][] {
    const root = this.objectMeshes.get(objectId);
    if (!root) return [];
    root.updateMatrixWorld(true);
    const frame = (root.userData.surfaceFrame as SurfaceUvFrame | undefined) ?? computeRootSurfaceFrame(root);
    root.userData.surfaceFrame = frame;
    const rootInv = root.matrixWorld.clone().invert();
    const out: [number, number, number, number][] = [];
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    for (const mesh of collectMeshes(root)) {
      const geo = mesh.geometry;
      const pos = geo.getAttribute('position');
      const uvAttr = geo.getAttribute('uv');
      if (!pos) continue;
      m.multiplyMatrices(rootInv, mesh.matrixWorld);
      const uvAt = (i: number): [number, number] => {
        if (projection === 'meshUv') {
          return uvAttr ? [uvAttr.getX(i), uvAttr.getY(i)] : [0, 0];
        }
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const p = projectSurfaceUv({ x: v.x, y: v.y, z: v.z }, projection, frame);
        return [p.x, p.y];
      };
      const index = geo.getIndex();
      const triCount = index ? index.count / 3 : pos.count / 3;
      const step = Math.max(1, Math.ceil((triCount * 3) / maxSegments));
      for (let t = 0; t < triCount; t += step) {
        const ids = [0, 1, 2].map((k) => (index ? index.getX(t * 3 + k) : t * 3 + k));
        const uvs = ids.map(uvAt);
        for (let k = 0; k < 3; k++) {
          const a = uvs[k];
          const b = uvs[(k + 1) % 3];
          // Skip seam-wrapping edges of cylindrical / spherical projections.
          if (projection !== 'meshUv' && projection !== 'planar' && Math.abs(a[0] - b[0]) > 0.5) continue;
          out.push([a[0], a[1], b[0], b[1]]);
        }
      }
    }
    return out;
  }

  /** v2: raster-UV points (0–1, bottom-left) of the calculation target's four corners. */
  projectTargetCornersToRaster(projectorId: string): ({ x: number; y: number } | null)[] | null {
    const projector = this.allProjectors.find((p) => p.id === projectorId);
    const target = getCalculationTargetObject(this.sceneObjects, this.calculationTargetId);
    if (!projector || !target) return null;
    const world = objectWorldMatrix(target.transform);
    const local: THREE.Vector3[] = [];
    if (target.type === 'curvedScreen' && target.curved) {
      const { radius, arcAngleDeg, height } = target.curved;
      const half = THREE.MathUtils.degToRad(arcAngleDeg) / 2;
      // Cylinder geometry azimuth: x = r·sin(θ), z = r·cos(θ).
      const pt = (theta: number, y: number) =>
        new THREE.Vector3(radius * Math.sin(theta), y, radius * Math.cos(theta));
      local.push(pt(-half, -height / 2), pt(half, -height / 2), pt(half, height / 2), pt(-half, height / 2));
    } else {
      const w = target.dimensions.width / 2;
      const h = target.dimensions.height / 2;
      local.push(
        new THREE.Vector3(-w, -h, 0),
        new THREE.Vector3(w, -h, 0),
        new THREE.Vector3(w, h, 0),
        new THREE.Vector3(-w, h, 0),
      );
    }
    const vp = getProjectorViewProjectionMatrix(projector.optics, getProjectorWorldMatrix(projector));
    const pts = local.map((p) => {
      const clip = new THREE.Vector4(p.x, p.y, p.z, 1).applyMatrix4(world).applyMatrix4(vp);
      if (clip.w <= 1e-6) return null;
      return { x: clip.x / clip.w * 0.5 + 0.5, y: clip.y / clip.w * 0.5 + 0.5 };
    });
    // Order corners left→right as seen by the projector so the warp is not mirrored.
    if (pts.every((p) => p !== null)) {
      const [a, b] = [pts[0]!, pts[1]!];
      if (a.x > b.x) return [pts[1], pts[0], pts[3], pts[2]];
    }
    return pts;
  }

  private getReceiverRoots(): THREE.Object3D[] {
    const roots: THREE.Object3D[] = [];
    for (const root of this.objectMeshes.values()) {
      if (root.userData.receivesProjection && root.visible) {
        roots.push(root);
      }
    }
    return roots;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    for (const obj3d of this.objectMeshes.values()) {
      disposeObject3D(obj3d);
    }
    this.objectMeshes.clear();

    for (const visual of this.projectorVisuals.values()) {
      visual.body.geometry.dispose();
      (visual.body.material as THREE.Material).dispose();
      visual.frustum.dispose();
    }
    this.projectorVisuals.clear();
    for (const pass of this.depthPassByProjector.values()) pass.dispose();
    this.depthPassByProjector.clear();
    this.multiProjectiveMaterial.dispose();
    this.baker.dispose();
    this.mediaSync.dispose();
    this.transportUnsub();
    this.feedPass.dispose();
    outputWindows.setFrameDriver(null);
    for (const id of [...this.outputTargets.keys()]) this.disposeOutputSlot(id);
    this.depthPass?.dispose();
    this.transformControls?.dispose();
    this.controls?.dispose();
    this.renderer?.dispose();

    this.renderer = null;
    this.editorCamera = null;
    this.controls = null;
    this.transformControls = null;
    this.depthPass = null;
  }
}

function deltaAngleDegreesForAxis(qDelta: THREE.Quaternion, axis: 'X' | 'Y' | 'Z'): number {
  const component = axis === 'X' ? qDelta.x : axis === 'Y' ? qDelta.y : qDelta.z;
  return THREE.MathUtils.radToDeg(2 * Math.atan2(component, qDelta.w));
}

function disposeObject3D(obj: THREE.Object3D): void {
  if (obj.userData.isModel) {
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material?.dispose();
      }
    });
    return;
  }
  const mesh = obj as THREE.Mesh;
  if (mesh.isMesh) {
    mesh.geometry?.dispose();
    if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
    else (mesh.material as THREE.Material)?.dispose();
  }
}
