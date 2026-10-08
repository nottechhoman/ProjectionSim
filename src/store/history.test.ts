import { describe, it, expect } from 'vitest';
import { appendHistory, captureSceneHistory, historySnapshotsEqual } from '../store/history';
import { defaultShow, DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';

describe('scene history', () => {
  it('captures and compares scene snapshots', () => {
    const base = {
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      projectors: DEFAULT_PROJECTORS,
      mediaAssets: [],
      show: defaultShow(),
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
      show: defaultShow(),
      calculationTargetId: 'screen-1',
    };
    const snapshot = captureSceneHistory(base);
    const next = appendHistory([], snapshot);
    const again = appendHistory(next, snapshot);
    expect(again).toHaveLength(1);
  });
});

describe('scene history (v4 show)', () => {
  it('treats a changed layer as a different snapshot', () => {
    const show = defaultShow();
    const base = { sceneObjects: DEFAULT_SCENE_OBJECTS, projectors: DEFAULT_PROJECTORS, mediaAssets: [], show, calculationTargetId: 'screen-1' };
    const a = captureSceneHistory(base);
    const changed = structuredClone(show);
    changed.tracks[0].layers[0].opacity = 0.5;
    const b = captureSceneHistory({ ...base, show: changed });
    expect(historySnapshotsEqual(a, b)).toBe(false);
  });
});
