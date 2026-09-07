import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Transform } from '../types';

export interface ModelLoadResult {
  object: THREE.Group;
  bbox: THREE.Box3;
  size: THREE.Vector3;
}

const loader = new GLTFLoader();

export async function loadGltfFromBlob(blob: Blob): Promise<ModelLoadResult> {
  const url = URL.createObjectURL(blob);
  try {
    const gltf = await loader.loadAsync(url);
    const object = gltf.scene;
    object.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(object);
    const size = bbox.getSize(new THREE.Vector3());
    return { object, bbox, size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function cloneModelGroup(source: THREE.Group): THREE.Group {
  return source.clone(true);
}

export function applyModelToMesh(
  mesh: THREE.Object3D,
  transform: Transform,
  scale: number,
): void {
  mesh.position.set(transform.position.x, transform.position.y, transform.position.z);
  mesh.quaternion.set(...transform.quaternion);
  mesh.scale.setScalar(scale);
}

export interface CurvedScreenParams {
  radius: number;
  arcAngleDeg: number;
  height: number;
}

export function createCurvedScreenGeometry(params: CurvedScreenParams): THREE.BufferGeometry {
  const arcRad = THREE.MathUtils.degToRad(params.arcAngleDeg);
  const segments = Math.max(16, Math.ceil(params.arcAngleDeg / 5));
  return new THREE.CylinderGeometry(
    params.radius,
    params.radius,
    params.height,
    segments,
    1,
    true,
    -arcRad / 2,
    arcRad,
  );
}
