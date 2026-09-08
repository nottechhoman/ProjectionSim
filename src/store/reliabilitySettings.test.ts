import { describe, it, expect } from 'vitest';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';
import {
  fallbackCalculationTargetId,
  legacyDefaultCalculationTargetId,
  legacyDefaultSharedContentSourceId,
  listCalculationTargets,
  reconcileReliabilityIds,
  resolveCalculationTargetId,
  resolveSharedContentSourceId,
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

  it('resolves shared content source independently of enabled state', () => {
    const projectors = [
      { ...DEFAULT_PROJECTORS[0], id: 'p1', enabled: false },
      { ...DEFAULT_PROJECTORS[0], id: 'p2', name: 'Projector 2', enabled: true },
    ];
    expect(resolveSharedContentSourceId(projectors, 'p1')).toBe('p1');
  });

  it('reconciles deleted shared source to first projector', () => {
    const next = reconcileReliabilityIds({
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      projectors: DEFAULT_PROJECTORS,
      sharedContentSourceProjectorId: 'missing',
      calculationTargetId: 'screen-1',
    });
    expect(next.sharedContentSourceProjectorId).toBe('proj-1');
  });

  it('reconciles deleted calculation target using flat-first fallback', () => {
    const next = reconcileReliabilityIds({
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      projectors: DEFAULT_PROJECTORS,
      sharedContentSourceProjectorId: 'proj-1',
      calculationTargetId: 'missing',
    });
    expect(next.calculationTargetId).toBe('screen-1');
  });

  it('legacy shared source uses selected projector then first projector', () => {
    expect(legacyDefaultSharedContentSourceId(DEFAULT_PROJECTORS, 'proj-1')).toBe('proj-1');
    expect(legacyDefaultSharedContentSourceId(DEFAULT_PROJECTORS, 'missing')).toBe('proj-1');
  });
});
