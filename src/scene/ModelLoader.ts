import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import type { Transform } from '../types';

export interface ModelLoadResult {
  object: THREE.Group;
  bbox: THREE.Box3;
  size: THREE.Vector3;
}

const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();

function finalizeLoadedObject(object: THREE.Object3D): ModelLoadResult {
  const root = object instanceof THREE.Group ? object : new THREE.Group().add(object);
  root.updateMatrixWorld(true);
  const bbox = new THREE.Box3().setFromObject(root);
  const size = bbox.getSize(new THREE.Vector3());
  return { object: root, bbox, size };
}

function isObjFile(filename: string): boolean {
  return filename.toLowerCase().endsWith('.obj');
}

export async function loadGltfFromBlob(blob: Blob): Promise<ModelLoadResult> {
  const url = URL.createObjectURL(blob);
  try {
    const gltf = await gltfLoader.loadAsync(url);
    return finalizeLoadedObject(gltf.scene);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadObjFromBlob(blob: Blob): Promise<ModelLoadResult> {
  const text = await blob.text();
  const object = objLoader.parse(text);
  return finalizeLoadedObject(object);
}

export async function loadModelFromBlob(blob: Blob, filename: string): Promise<ModelLoadResult> {
  if (isObjFile(filename)) {
    return loadObjFromBlob(blob);
  }
  return loadGltfFromBlob(blob);
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
