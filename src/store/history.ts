import type { BlendSettings, MediaAssetRecord, ProjectorConfig, SceneObject, Show } from '../types';
import { DEFAULT_BLEND_SETTINGS } from '../types';

export const HISTORY_MAX = 50;

export interface SceneHistorySnapshot {
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: MediaAssetRecord[];
  show: Show;
  calculationTargetId: string | null;
  blendSettings: BlendSettings;
}

export function captureSceneHistory(state: {
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: MediaAssetRecord[];
  show: Show;
  calculationTargetId: string | null;
  blendSettings?: BlendSettings;
}): SceneHistorySnapshot {
  return {
    sceneObjects: structuredClone(state.sceneObjects),
    projectors: structuredClone(state.projectors),
    mediaAssets: structuredClone(state.mediaAssets),
    show: structuredClone(state.show),
    calculationTargetId: state.calculationTargetId,
    blendSettings: structuredClone(state.blendSettings ?? DEFAULT_BLEND_SETTINGS),
  };
}

export function historySnapshotsEqual(a: SceneHistorySnapshot, b: SceneHistorySnapshot): boolean {
  return (
    JSON.stringify(a.sceneObjects) === JSON.stringify(b.sceneObjects) &&
    JSON.stringify(a.projectors) === JSON.stringify(b.projectors) &&
    JSON.stringify(a.mediaAssets) === JSON.stringify(b.mediaAssets) &&
    JSON.stringify(a.show) === JSON.stringify(b.show) &&
    a.calculationTargetId === b.calculationTargetId &&
    JSON.stringify(a.blendSettings) === JSON.stringify(b.blendSettings)
  );
}

export function appendHistory(
  past: SceneHistorySnapshot[],
  snapshot: SceneHistorySnapshot,
): SceneHistorySnapshot[] {
  const last = past[past.length - 1];
  if (last && historySnapshotsEqual(last, snapshot)) return past;
  return [...past.slice(-(HISTORY_MAX - 1)), snapshot];
}
