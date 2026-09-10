import * as THREE from 'three';

/** Depth bias for projector-space occlusion (NDC depth units). */
export const PROJECTION_DEPTH_BIAS = 0.002;

export type OcclusionDepthKey = 'all' | `exclude:${string}`;

export function occlusionDepthKeyForReceiver(
  objectId: string,
  blocksProjection: boolean,
): OcclusionDepthKey {
  return blocksProjection ? `exclude:${objectId}` : 'all';
}

export function excludeObjectIdFromDepthKey(key: OcclusionDepthKey): string | undefined {
  return key === 'all' ? undefined : key.slice('exclude:'.length);
}

export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
  });
  return meshes;
}

export interface BlockerRoot {
  id: string;
  root: THREE.Object3D;
  blocksProjection: boolean;
}

export function collectBlockerMeshes(
  roots: Iterable<BlockerRoot>,
  excludeObjectId?: string,
): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  for (const entry of roots) {
    if (!entry.blocksProjection) continue;
    if (excludeObjectId && entry.id === excludeObjectId) continue;
    meshes.push(...collectMeshes(entry.root));
  }
  return meshes;
}

export function requiredOcclusionDepthKeys(
  roots: Iterable<{ id: string; blocksProjection: boolean; receivesProjection: boolean }>,
): OcclusionDepthKey[] {
  const keys = new Set<OcclusionDepthKey>(['all']);
  for (const entry of roots) {
    if (entry.blocksProjection && entry.receivesProjection) {
      keys.add(occlusionDepthKeyForReceiver(entry.id, true));
    }
  }
  return [...keys];
}

/** Same projector raster UV for collinear world points along the optical axis. */
export function projectorRasterUv(
  worldPos: THREE.Vector3,
  projectorMatrix: THREE.Matrix4,
): { uv: THREE.Vector2; inFrustum: boolean; ndcDepth: number } | null {
  const clip = new THREE.Vector4(worldPos.x, worldPos.y, worldPos.z, 1).applyMatrix4(projectorMatrix);
  if (clip.w <= 0) return null;
  const ndc = new THREE.Vector3(clip.x / clip.w, clip.y / clip.w, clip.z / clip.w);
  const inFrustum =
    Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && Math.abs(ndc.z) <= 1;
  return {
    uv: new THREE.Vector2(ndc.x * 0.5 + 0.5, ndc.y * 0.5 + 0.5),
    inFrustum,
    ndcDepth: ndc.z * 0.5 + 0.5,
  };
}
