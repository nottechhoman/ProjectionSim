import * as THREE from 'three';
import type { SceneObject } from '../types';

export type ScreenMapKind = 'none' | 'planar' | 'curved' | 'meshUv';

export interface SharedCanvasSupport {
  supported: boolean;
  reason: string | null;
  primaryReceiver: SceneObject | null;
  mapKind: ScreenMapKind;
}

export interface ScreenMapUniforms {
  mapKind: number;
  matrixInv: THREE.Matrix4;
  params: THREE.Vector4;
}

const MAP_KIND_INT: Record<ScreenMapKind, number> = {
  none: 0,
  planar: 1,
  curved: 2,
  meshUv: 3,
};

export function mapKindToInt(kind: ScreenMapKind): number {
  return MAP_KIND_INT[kind];
}

export function findPrimaryReceiver(sceneObjects: SceneObject[]): SceneObject | null {
  const curved = sceneObjects.find(
    (obj) => obj.type === 'curvedScreen' && obj.receivesProjection,
  );
  if (curved) return curved;
  const screen = sceneObjects.find((obj) => obj.type === 'screen' && obj.receivesProjection);
  if (screen) return screen;
  return sceneObjects.find((obj) => obj.type === 'model' && obj.receivesProjection) ?? null;
}

export function resolveSharedCanvasSupport(sceneObjects: SceneObject[]): SharedCanvasSupport {
  const primary = findPrimaryReceiver(sceneObjects);
  if (!primary) {
    return {
      supported: false,
      reason: 'Add a screen or curved screen that receives projection.',
      primaryReceiver: null,
      mapKind: 'none',
    };
  }

  if (primary.type === 'screen') {
    return { supported: true, reason: null, primaryReceiver: primary, mapKind: 'planar' };
  }

  if (primary.type === 'curvedScreen' && primary.curved) {
    return { supported: true, reason: null, primaryReceiver: primary, mapKind: 'curved' };
  }

  if (primary.type === 'model') {
    return {
      supported: true,
      reason: null,
      primaryReceiver: primary,
      mapKind: 'meshUv',
    };
  }

  return {
    supported: false,
    reason: 'Shared canvas needs a planar screen, curved screen, or imported mesh receiver.',
    primaryReceiver: primary,
    mapKind: 'none',
  };
}

export function buildScreenMapUniforms(
  receiver: SceneObject,
  mapKind: ScreenMapKind,
): ScreenMapUniforms {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(
    receiver.transform.position.x,
    receiver.transform.position.y,
    receiver.transform.position.z,
  );
  const quaternion = new THREE.Quaternion(...receiver.transform.quaternion);
  matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));

  const params = new THREE.Vector4(1, 1, 90, 0);
  if (mapKind === 'planar') {
    params.set(receiver.dimensions.width, receiver.dimensions.height, 0, 0);
  } else if (mapKind === 'curved' && receiver.curved) {
    params.set(receiver.curved.radius, receiver.curved.height, receiver.curved.arcAngleDeg, 0);
  }

  return {
    mapKind: mapKindToInt(mapKind),
    matrixInv: matrix.clone().invert(),
    params,
  };
}

/** Planar screen-local content UV (0–1) from a world-space point. */
export function worldToPlanarContentUv(
  world: THREE.Vector3,
  receiver: SceneObject,
): THREE.Vector2 | null {
  if (receiver.type !== 'screen') return null;
  const { matrixInv, params } = buildScreenMapUniforms(receiver, 'planar');
  const local = world.clone().applyMatrix4(matrixInv);
  const u = local.x / params.x + 0.5;
  const v = local.y / params.y + 0.5;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
  return new THREE.Vector2(u, v);
}
