import type { SceneObject, SceneObjectType } from '../types';

const BLOCKABLE_TYPES = new Set<SceneObjectType>(['box', 'floor', 'screen', 'curvedScreen', 'ledWall']);

export function objectTypeCanBlockProjection(type: SceneObjectType): boolean {
  return BLOCKABLE_TYPES.has(type);
}

/** Blockable geometry always occludes projection; not user-toggleable. */
export function effectiveBlocksProjection(obj: SceneObject): boolean {
  return objectTypeCanBlockProjection(obj.type);
}

export function normalizeSceneObjectBlocksProjection(obj: SceneObject): SceneObject {
  if (!objectTypeCanBlockProjection(obj.type) || obj.blocksProjection) return obj;
  return { ...obj, blocksProjection: true };
}
