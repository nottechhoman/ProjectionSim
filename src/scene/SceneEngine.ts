import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { useAppStore } from '../store';
import { buildProjectorCamera, getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { createProjectiveMaterial, fitModeToInt, patternToInt } from '../projection/ProjectiveMaterial';
import {
  createMultiProjectiveMaterial,
  updateMultiProjectiveMaterial,
} from '../projection/MultiProjectiveMaterial';
import { DepthPass } from '../visibility/DepthPass';
import type {
  MaterialPreviewMode,
  ProjectionCompositeMode,
  ProjectorConfig,
  SceneObject,
  Transform,
  TransformMode,
  ViewPreset,
} from '../types';
import { createScreen } from './objects/createScreen';
import { createFloor } from './objects/createFloor';
import { createBox } from './objects/createBox';
import { createCurvedScreen } from './objects/createCurvedScreen';
import { FrustumHelper } from './helpers/FrustumHelper';
import { mediaTextureCache, modelCache } from '../media';
import { cloneModelGroup } from './ModelLoader';
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
}

function dimensionsKey(obj: SceneObject): string {
  const depth = obj.dimensions.depth ?? 0;
  const curved = obj.curved
    ? `${obj.curved.radius}:${obj.curved.arcAngleDeg}:${obj.curved.height}`
    : '';
  const model = obj.modelAssetId ? `${obj.modelAssetId}:${obj.modelScale ?? 1}` : '';
  return `${obj.type}:${obj.dimensions.width}:${obj.dimensions.height}:${depth}:${curved}:${model}`;
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
    case 'model': {
      if (!obj.modelAssetId) return createBox(obj);
      const prototype = modelCache.get(obj.modelAssetId);
      if (!prototype) return createBox(obj);
      const group = cloneModelGroup(prototype);
      group.userData.isModel = true;
      return group;
    }
    default:
      return createScreen(obj);
  }
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

function buildPlanarScreen(sceneObjects: SceneObject[]): {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
  height: number;
} | null {
  const screen = sceneObjects.find((obj) => obj.type === 'screen' && obj.receivesProjection);
  if (!screen) return null;
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

function buildCurvedScreenSurface(sceneObjects: SceneObject[]): CurvedScreenSurface | null {
  const screen = sceneObjects.find((obj) => obj.type === 'curvedScreen' && obj.receivesProjection);
  if (!screen?.curved) return null;
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

function projectorWorldMatrix(projector: ProjectorConfig): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(
    projector.transform.position.x,
    projector.transform.position.y,
    projector.transform.position.z,
  );
  const quaternion = new THREE.Quaternion(...projector.transform.quaternion);
  matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return matrix;
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
  private readonly projectiveMaterial = createProjectiveMaterial();
  private readonly multiProjectiveMaterial = createMultiProjectiveMaterial();
  private readonly projectorVisuals = new Map<string, { body: THREE.Mesh; frustum: FrustumHelper }>();
  private readonly objectMeshes = new Map<string, THREE.Object3D>();
  private allProjectors: ProjectorConfig[] = [];
  private activeProjectors: ProjectorConfig[] = [];
  private selectedProjectorId = 'proj-1';
  private materialPreviewMode: MaterialPreviewMode = 'projectionPreview';
  private projectionCompositeMode: ProjectionCompositeMode = 'unblended';
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
  private currentTransformMode: TransformMode = 'translate';
  private showProjectionBeam = false;
  private measureMode = false;
  private readonly measureGroup = new THREE.Group();
  private measureLine: THREE.Line | null = null;
  private readonly measureMarkers: THREE.Mesh[] = [];

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
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

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

      if (this.gizmoDragging && this.transformControls?.mode === 'rotate') {
        const obj = this.transformControls.object;
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
        }
      } else if (!this.gizmoDragging) {
        this.gizmoRotateStartEuler = null;
        this.gizmoRotateStartQuat = null;
      }
    });
    this.transformControls.addEventListener('change', () => {
      this.handleGizmoChange();
    });
    this.helpersGroup.add(this.transformControls.getHelper());

    canvas.addEventListener('pointerdown', this.onPointerDown);

    this.depthPass = new DepthPass();
    this.projectiveMaterial.uniforms.depthMapSize.value.set(
      this.depthPass.target.width,
      this.depthPass.target.height,
    );

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
    const parent = this.canvas.parentElement;
    const width = parent?.clientWidth ?? this.canvas.clientWidth;
    const height = parent?.clientHeight ?? this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.editorCamera.aspect = width / height;
    this.editorCamera.updateProjectionMatrix();
  }

  sync(state: AppState): void {
    if (!this.webglAvailable || this.disposed) return;

    if (state.viewPreset !== this.currentViewPreset) {
      this.setViewPreset(state.viewPreset);
    }

    if (state.transformMode !== this.currentTransformMode) {
      this.currentTransformMode = state.transformMode;
      this.transformControls?.setMode(state.transformMode);
    }

    this.syncSceneObjects(state.sceneObjects, this.gizmoDragging);
    this.materialPreviewMode = state.materialPreviewMode;
    this.projectionCompositeMode = state.projectionCompositeMode;
    this.showProjectionBeam = state.showProjectionBeam;
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

  private handleGizmoChange(): void {
    const tc = this.transformControls;
    const obj = tc?.object;
    if (!obj || !tc) return;

    let q = obj.quaternion;

    const isProjector = [...this.projectorVisuals.values()].some((visual) => visual.body === obj);

    // Projectors use YXZ yaw/pitch/roll — map gizmo rings to single inspector fields.
    // Scene objects use the gizmo quaternion directly (YXZ remapping breaks their rotation).
    if (
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
    }
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
    const planarScreen = buildPlanarScreen(sceneObjects);
    const curvedScreen = buildCurvedScreenSurface(sceneObjects);

    const nextIds = new Set(projectors.map((p) => p.id));
    for (const [id, visual] of this.projectorVisuals) {
      if (!nextIds.has(id)) {
        this.helpersGroup.remove(visual.body, visual.frustum);
        visual.body.geometry.dispose();
        (visual.body.material as THREE.Material).dispose();
        visual.frustum.dispose();
        this.projectorVisuals.delete(id);
        this.depthPassByProjector.get(id)?.dispose();
        this.depthPassByProjector.delete(id);
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

      const worldMatrix = projectorWorldMatrix(projector);
      if (!skipTransforms) {
        const position = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(worldMatrix);
        visual.body.position.copy(position);
        visual.body.quaternion.copy(quaternion);
      }

      const cornerRays = CORNER_UV.map(([u, v]) => unprojectRasterRay(projector.optics, u, v, worldMatrix));

      let footprintCorners: { x: number; y: number; z: number }[] | null = null;
      let footprintOutline: { x: number; y: number; z: number }[] | undefined;
      if (planarScreen) {
        const footprint = computePlanarFootprint(projector.optics, worldMatrix, planarScreen);
        if (footprint.corners.length === 4) {
          footprintCorners = offsetCornersAlongNormal(footprint.corners, planarScreen.normal, 0.01);
        }
      } else if (curvedScreen) {
        const footprint = computeCurvedFootprint(projector.optics, worldMatrix, curvedScreen);
        if (footprint.corners.length === 4) {
          footprintCorners = footprint.corners;
          footprintOutline = footprint.beamOutline;
        }
      }

      const previewLength = Math.max(
        2,
        Math.hypot(
          projector.transform.position.x,
          projector.transform.position.y,
          projector.transform.position.z,
        ) * 0.5,
      );

      visual.frustum.updateVisuals(cornerRays, projector.color, {
        footprintCorners,
        footprintOutline,
        showBeamRays: this.showProjectionBeam,
        shortFrustumLength: previewLength,
      });

      visual.frustum.visible = true;
    }

    if (enabled.length === 1) {
      this.applyProjectiveUniforms(enabled[0]);
    } else if (this.projectionCompositeMode === 'solo') {
      const solo =
        projectors.find((p) => p.id === selectedProjectorId && p.enabled) ?? enabled[0];
      if (solo) this.applyProjectiveUniforms(solo);
    }
  }

  private applyProjectiveUniforms(projector: ProjectorConfig): void {
    const worldMatrix = projectorWorldMatrix(projector);
    const forceUv = this.materialPreviewMode === 'projectionUv' ? 1 : 0;
    this.projectiveMaterial.uniforms.forceUvPreview.value = forceUv;
    this.projectiveMaterial.uniforms.projectorMatrix.value.copy(
      getProjectorViewProjectionMatrix(projector.optics, worldMatrix),
    );
    this.projectiveMaterial.uniforms.patternType.value = patternToInt(projector.testPattern);
    this.projectiveMaterial.uniforms.brightness.value = projector.brightness;
    this.projectiveMaterial.uniforms.rasterAspect.value = projector.optics.aspectRatio;
    (this.projectiveMaterial.uniforms.projectorColor.value as THREE.Color).set(projector.color);

    const useMedia =
      (projector.mediaSource === 'image' || projector.mediaSource === 'video') &&
      projector.mediaAssetId;
    if (useMedia) {
      const entry = mediaTextureCache.get(projector.mediaAssetId!);
      if (entry) {
        this.projectiveMaterial.uniforms.useMediaTexture.value = 1;
        this.projectiveMaterial.uniforms.mediaMap.value = entry.texture;
        this.projectiveMaterial.uniforms.mediaAspect.value = entry.aspect;
        this.projectiveMaterial.uniforms.fitMode.value = fitModeToInt(projector.mediaFit);
      } else {
        this.projectiveMaterial.uniforms.useMediaTexture.value = 0;
      }
    } else {
      this.projectiveMaterial.uniforms.useMediaTexture.value = 0;
    }
  }

  start(): void {
    if (!this.webglAvailable || this.disposed) return;
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

    mediaTextureCache.updateVideos();
    this.controls?.update();
    this.resize();
    this.updateGizmoScale();
    this.editorScene.updateMatrixWorld(true);

    const depthMeshes = this.getDepthMeshes();
    const receivers = this.getReceiverRoots();
    let projectorsToRender = this.activeProjectors;

    if (this.projectionCompositeMode === 'solo') {
      const selected =
        this.allProjectors.find((p) => p.id === this.selectedProjectorId && p.enabled) ??
        projectorsToRender[0];
      projectorsToRender = selected ? [selected] : [];
    }

    const savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

    if (
      (this.materialPreviewMode === 'projectionPreview' || this.materialPreviewMode === 'projectionUv') &&
      projectorsToRender.length > 0 &&
      depthMeshes.length > 0
    ) {
      if (projectorsToRender.length === 1) {
        const projector = projectorsToRender[0];
        this.applyProjectiveUniforms(projector);
        const worldMatrix = projectorWorldMatrix(projector);
        const projectorCamera = buildProjectorCamera(projector.optics, worldMatrix);
        const depthMap = this.depthPass.render(
          this.renderer,
          this.editorScene,
          projectorCamera,
          depthMeshes,
        );
        this.projectiveMaterial.uniforms.depthMap.value = depthMap;

        for (const root of receivers) {
          const meshes = collectMeshes(root);
          if (meshes.length > 0) {
            (this.projectiveMaterial.uniforms.surfaceBaseColor.value as THREE.Color).copy(
              meshBaseColor(meshes[0]),
            );
          }
          for (const mesh of meshes) {
            savedMaterials.set(mesh, mesh.material);
            mesh.material = this.projectiveMaterial;
          }
        }
      } else {
        const depthTextures: THREE.Texture[] = [];
        for (const projector of projectorsToRender.slice(0, 4)) {
          let pass = this.depthPassByProjector.get(projector.id);
          if (!pass) {
            pass = new DepthPass();
            this.depthPassByProjector.set(projector.id, pass);
          }
          const worldMatrix = projectorWorldMatrix(projector);
          const projectorCamera = buildProjectorCamera(projector.optics, worldMatrix);
          depthTextures.push(pass.render(this.renderer, this.editorScene, projectorCamera, depthMeshes));
        }

        updateMultiProjectiveMaterial(
          this.multiProjectiveMaterial,
          projectorsToRender.slice(0, 4),
          depthTextures,
          this.projectionCompositeMode,
          this.materialPreviewMode === 'projectionUv',
        );
        this.multiProjectiveMaterial.uniforms.depthMapSize.value.set(
          this.depthPass.target.width,
          this.depthPass.target.height,
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

    this.callbacks.onFrameTime?.(performance.now() - frameStart);
  }

  private getDepthMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const root of this.objectMeshes.values()) {
      if (root.userData.blocksProjection) {
        meshes.push(...collectMeshes(root));
      }
    }
    return meshes;
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
    this.projectiveMaterial.dispose();
    this.multiProjectiveMaterial.dispose();
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
