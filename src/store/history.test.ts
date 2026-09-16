import { describe, it, expect } from 'vitest';
import { appendHistory, captureSceneHistory, historySnapshotsEqual } from '../store/history';
import { DEFAULT_CONTENT_CANVAS } from '../projection/contentCanvas';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';

describe('scene history', () => {
  it('captures and compares scene snapshots', () => {
    const base = {
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      projectors: DEFAULT_PROJECTORS,
      mediaAssets: [],
      contentCanvas: DEFAULT_CONTENT_CANVAS,
      sharedContentSourceProjectorId: 'proj-1',
      calculationTargetId: 'screen-1',
    };
    const a = captureSceneHistory(base);
    const b = captureSceneHistory(base);
    expect(historySnapshotsEqual(a, b)).toBe(true);
  });

  it('deduplicates consecutive identical snapshots', () => {
    const base = {
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      projectors: DEFAULT_PROJECTORS,
      mediaAssets: [],
      contentCanvas: DEFAULT_CONTENT_CANVAS,
      sharedContentSourceProjectorId: 'proj-1',
      calculationTargetId: 'screen-1',
    };
    const snapshot = captureSceneHistory(base);
    const next = appendHistory([], snapshot);
    const again = appendHistory(next, snapshot);
    expect(again).toHaveLength(1);
  });
});
