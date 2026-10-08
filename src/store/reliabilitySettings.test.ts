import { describe, it, expect } from 'vitest';
import { DEFAULT_SCENE_OBJECTS } from './defaultScene';
import {
  fallbackCalculationTargetId,
  legacyDefaultCalculationTargetId,
  listCalculationTargets,
  reconcileReliabilityIds,
  resolveCalculationTargetId,
} from './reliabilitySettings';
import type { SceneObject } from '../types';
import { eulerYXZToQuaternion } from '../utils/euler';

describe('reliabilitySettings', () => {
  it('lists only flat and curved receivers that receive projection', () => {
    const targets = listCalculationTargets(DEFAULT_SCENE_OBJECTS);
    expect(targets).toHaveLength(1);
    expect(targets[0].type).toBe('screen');
  });

  it('legacy calculation default prefers curved over flat', () => {
    const scene: SceneObject[] = [
      ...DEFAULT_SCENE_OBJECTS,
      {
        id: 'curved-1',
        name: 'Curved Screen',
        type: 'curvedScreen',
        transform: {
          position: { x: 0, y: 1.5, z: -1 },
          quaternion: eulerYXZToQuaternion(0, 0, 0),
        },
        visibleInEditor: true,
        receivesProjection: true,
        blocksProjection: false,
        dimensions: { width: 6, height: 3.375 },
        curved: { radius: 4, arcAngleDeg: 90, height: 3.375 },
      },
    ];
    expect(legacyDefaultCalculationTargetId(scene)).toBe('curved-1');
  });

  it('fallback calculation target prefers flat then curved', () => {
    const scene: SceneObject[] = [
      ...DEFAULT_SCENE_OBJECTS,
      {
        id: 'curved-1',
        name: 'Curved Screen',
        type: 'curvedScreen',
        transform: {
          position: { x: 0, y: 1.5, z: -1 },
          quaternion: eulerYXZToQuaternion(0, 0, 0),
        },
        visibleInEditor: true,
        receivesProjection: true,
        blocksProjection: false,
        dimensions: { width: 6, height: 3.375 },
        curved: { radius: 4, arcAngleDeg: 90, height: 3.375 },
      },
    ];
    expect(fallbackCalculationTargetId(scene)).toBe('screen-1');
  });

  it('keeps explicit calculation target when curved screen is added', () => {
    const scene: SceneObject[] = [
      ...DEFAULT_SCENE_OBJECTS,
      {
        id: 'curved-1',
        name: 'Curved Screen',
        type: 'curvedScreen',
        transform: {
          position: { x: 0, y: 1.5, z: -1 },
          quaternion: eulerYXZToQuaternion(0, 0, 0),
        },
        visibleInEditor: true,
        receivesProjection: true,
        blocksProjection: false,
        dimensions: { width: 6, height: 3.375 },
        curved: { radius: 4, arcAngleDeg: 90, height: 3.375 },
      },
    ];
    expect(resolveCalculationTargetId(scene, 'screen-1')).toBe('screen-1');
  });

  it('reconciles deleted calculation target using flat-first fallback', () => {
    const next = reconcileReliabilityIds({
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      calculationTargetId: 'missing',
    });
    expect(next.calculationTargetId).toBe('screen-1');
  });

});
