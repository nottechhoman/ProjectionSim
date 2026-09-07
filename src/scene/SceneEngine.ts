import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { useAppStore } from '../store';
import { buildProjectorCamera, getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { createProjectiveMaterial, fitModeToInt, patternToInt } from '../projection/ProjectiveMaterial';
import { DepthPass } from '../visibility/DepthPass';
import type { MaterialPreviewMode, ProjectorConfig, SceneObject, Transform, TransformMode, ViewPreset } from '../types';
import { createScreen } from './objects/createScreen';
import { createFloor } from './objects/createFloor';
import { createBox } from './objects/createBox';
import { createCurvedScreen } from './objects/createCurvedScreen';
import { FrustumHelper } from './helpers/FrustumHelper';
import { mediaTextureCache, modelCache } from '../media';
import { cloneModelGroup } from './ModelLoader';

type AppState = ReturnType<typeof useAppStore.getState>;

export interface SceneEngineCallbacks {
  onFrameTime?: (ms: number) => void;
  onWebglStatus?: (available: boolean) => void;
  onSelect?: (id: string) => void;
  onTransformChange?: (id: string, patch: { position?: Transform['position']; quaternion?: Transform['quaternion'] }) => void;
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
  private readonly projectiveMaterial = createProjectiveMaterial();
  private readonly frustumHelper = new FrustumHelper();
  private readonly projectorBody: THREE.Mesh;
  private readonly objectMeshes = new Map<string, THREE.Object3D>();
  private activeProjector: ProjectorConfig | null = null;
  private materialPreviewMode: MaterialPreviewMode = 'projectionPreview';
  private animationId: number | null = null;
  private disposed = false;
  private currentViewPreset: ViewPreset = 'persp';
  private callbacks: SceneEngineCallbacks = {};
  private readonly viewTarget = new THREE.Vector3(0, 1.5, 0);
  private readonly pointer = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private gizmoDragging = false;
  private selectedProjectorId: string | null = null;
  private currentTransformMode: TransformMode = 'translate';

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
      this.projectorBody = new THREE.Mesh();
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
    this.helpersGroup.add(grid, axes, this.frustumHelper);

    const bodyGeo = new THREE.BoxGeometry(0.35, 0.18, 0.45);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    this.projectorBody = new THREE.Mesh(bodyGeo, bodyMat);
    this.helpersGroup.add(this.projectorBody);

    this.editorCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.editorCamera.position.set(8, 6, 12);
    this.editorCamera.lookAt(0, 1.5, 0);

    this.controls = new OrbitControls(this.editorCamera, canvas);
    this.controls.target.set(0, 1.5, 0);
    this.controls.update();

    this.transformControls = new TransformControls(this.editorCamera, canvas);
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.gizmoDragging = event.value as boolean;
      if (this.controls) this.controls.enabled = !this.gizmoDragging;
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

    this.syncSceneObjects(state.sceneObjects);
    this.syncProjector(state.projectors);
    this.materialPreviewMode = state.materialPreviewMode;
    this.syncSelectionGizmo(state.selectedObjectId, state.projectors);
  }

  private syncSelectionGizmo(selectedId: string | null, projectors: ProjectorConfig[]): void {
    if (!this.transformControls) return;

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
    if (projector && this.selectedProjectorId === projector.id) {
      if (this.transformControls.object !== this.projectorBody) {
        this.transformControls.attach(this.projectorBody);
      }
      this.transformControls.setMode(this.currentTransformMode);
      return;
    }

    this.transformControls.detach();
  }

  private handleGizmoChange(): void {
    const obj = this.transformControls?.object;
    if (!obj) return;

    let id: string | undefined;
    if (obj === this.projectorBody) {
      id = this.selectedProjectorId ?? undefined;
    } else {
      id = obj.userData.id as string | undefined;
    }
    if (!id) return;

    const q = obj.quaternion;
    this.callbacks.onTransformChange?.(id, {
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      quaternion: [q.x, q.y, q.z, q.w],
    });
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!this.editorCamera || this.gizmoDragging || event.button !== 0) return;

    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.editorCamera);

    const pickables: THREE.Object3D[] = [];
    for (const mesh of this.objectMeshes.values()) {
      if (mesh.visible) pickables.push(mesh);
    }
    if (this.projectorBody.visible) pickables.push(this.projectorBody);

    const hits = this.raycaster.intersectObjects(pickables, false);
    if (hits.length === 0) return;

    const hit = hits[0].object;
    const id =
      hit === this.projectorBody
        ? (this.projectorBody.userData.pickId as string | undefined)
        : (hit.userData.id as string | undefined);
    if (id) this.callbacks.onSelect?.(id);
  };

  private syncSceneObjects(sceneObjects: SceneObject[]): void {
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

      obj3d.position.set(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z);
      obj3d.quaternion.set(...obj.transform.quaternion);
      if (obj.type === 'model') {
        const scale = obj.modelScale ?? 1;
        obj3d.scale.setScalar(scale);
      }
      obj3d.visible = obj.visibleInEditor;
      obj3d.userData.id = obj.id;
      obj3d.userData.receivesProjection = obj.receivesProjection;
      obj3d.userData.blocksProjection = obj.blocksProjection;
    }
  }

  private syncProjector(projectors: ProjectorConfig[]): void {
    const projector = projectors.find((p) => p.enabled) ?? null;
    this.activeProjector = projector;
    this.selectedProjectorId = projector?.id ?? null;

    if (!projector) {
      this.frustumHelper.visible = false;
      this.projectorBody.visible = false;
      this.projectorBody.userData.pickId = null;
      return;
    }

    this.projectorBody.userData.pickId = projector.id;

    const worldMatrix = projectorWorldMatrix(projector);
    const position = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(worldMatrix);

    this.projectorBody.position.copy(position);
    this.projectorBody.quaternion.copy(quaternion);
    this.projectorBody.visible = true;

    const throwDistance = Math.max(
      2,
      Math.hypot(
        projector.transform.position.x,
        projector.transform.position.y,
        projector.transform.position.z,
      ),
    );
    this.frustumHelper.updateFromProjector(projector.optics, worldMatrix, throwDistance);
    this.frustumHelper.visible = true;
    (this.frustumHelper.material as THREE.LineBasicMaterial).color.set(projector.color);

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
    this.editorScene.updateMatrixWorld(true);

    const depthMeshes = this.getDepthMeshes();
    const receivers = this.getReceiverRoots();

    if (this.activeProjector && depthMeshes.length > 0) {
      const worldMatrix = projectorWorldMatrix(this.activeProjector);
      const projectorCamera = buildProjectorCamera(this.activeProjector.optics, worldMatrix);
      const depthMap = this.depthPass.render(
        this.renderer,
        this.editorScene,
        projectorCamera,
        depthMeshes,
      );
      this.projectiveMaterial.uniforms.depthMap.value = depthMap;
    } else {
      this.projectiveMaterial.uniforms.depthMap.value = null;
    }

    const savedMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    if (this.materialPreviewMode === 'projectionPreview') {
      for (const root of receivers) {
        for (const mesh of collectMeshes(root)) {
          savedMaterials.set(mesh, mesh.material);
          mesh.material = this.projectiveMaterial;
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
      if (root.userData.blocksProjection || root.userData.receivesProjection) {
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

    this.frustumHelper.dispose();
    this.projectorBody.geometry.dispose();
    (this.projectorBody.material as THREE.Material).dispose();
    this.projectiveMaterial.dispose();
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
