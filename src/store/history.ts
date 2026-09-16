import type { ContentCanvas, MediaAssetRecord, ProjectorConfig, SceneObject } from '../types';

export const HISTORY_MAX = 50;

export interface SceneHistorySnapshot {
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: MediaAssetRecord[];
  contentCanvas: ContentCanvas;
  sharedContentSourceProjectorId: string | null;
  calculationTargetId: string | null;
}

export function captureSceneHistory(state: {
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: MediaAssetRecord[];
  contentCanvas: ContentCanvas;
  sharedContentSourceProjectorId: string | null;
  calculationTargetId: string | null;
}): SceneHistorySnapshot {
  return {
    sceneObjects: structuredClone(state.sceneObjects),
    projectors: structuredClone(state.projectors),
    mediaAssets: structuredClone(state.mediaAssets),
    contentCanvas: structuredClone(state.contentCanvas),
    sharedContentSourceProjectorId: state.sharedContentSourceProjectorId,
    calculationTargetId: state.calculationTargetId,
  };
}

export function historySnapshotsEqual(a: SceneHistorySnapshot, b: SceneHistorySnapshot): boolean {
  return (
    JSON.stringify(a.sceneObjects) === JSON.stringify(b.sceneObjects) &&
    JSON.stringify(a.projectors) === JSON.stringify(b.projectors) &&
    JSON.stringify(a.mediaAssets) === JSON.stringify(b.mediaAssets) &&
    JSON.stringify(a.contentCanvas) === JSON.stringify(b.contentCanvas) &&
    a.sharedContentSourceProjectorId === b.sharedContentSourceProjectorId &&
    a.calculationTargetId === b.calculationTargetId
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
