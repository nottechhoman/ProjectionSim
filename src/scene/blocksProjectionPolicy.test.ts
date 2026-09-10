import { describe, expect, it } from 'vitest';
import type { SceneObject } from '../types';
import {
  effectiveBlocksProjection,
  normalizeSceneObjectBlocksProjection,
  objectTypeCanBlockProjection,
} from './blocksProjectionPolicy';
import { eulerYXZToQuaternion } from '../utils/euler';

function baseObject(type: SceneObject['type']): SceneObject {
  return {
    id: 'obj-1',
    name: 'Obj',
    type,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
    visibleInEditor: true,
    receivesProjection: true,
    blocksProjection: false,
    dimensions: { width: 1, height: 1, depth: 1 },
  };
}

describe('blocksProjectionPolicy', () => {
  it('treats primitive surfaces as always blocking', () => {
    for (const type of ['box', 'floor', 'screen', 'curvedScreen'] as const) {
      expect(objectTypeCanBlockProjection(type)).toBe(true);
      expect(effectiveBlocksProjection(baseObject(type))).toBe(true);
    }
  });

  it('does not treat imported models as blockers', () => {
    expect(effectiveBlocksProjection(baseObject('model'))).toBe(false);
  });

  it('normalizes stored false to true for blockable types', () => {
    const normalized = normalizeSceneObjectBlocksProjection(baseObject('screen'));
    expect(normalized.blocksProjection).toBe(true);
  });
});
