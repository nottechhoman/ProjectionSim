import type { MediaAssetRecord, ProjectorConfig, SceneObject, TestPattern } from '../types';
import { isVideoPlaying } from './videoPlayback';

export interface SceneContentEntry {
  id: string;
  ownerLabel: string;
  ownerKind: 'projector' | 'ledWall';
  mediaSummary: string;
  videoAssetId: string | null;
  isPlaying: boolean;
}

const PATTERN_LABELS: Record<TestPattern, string> = {
  checkerboard: 'Checkerboard',
  uvGrid: 'UV Grid',
  colorBars: 'Color Bars',
  white: 'White',
  projectorId: 'Projector ID',
};

function assetName(assets: MediaAssetRecord[], assetId: string | null): string | null {
  if (!assetId) return null;
  return assets.find((asset) => asset.id === assetId)?.name ?? assetId;
}

export function listSceneContent(
  projectors: ProjectorConfig[],
  sceneObjects: SceneObject[],
  mediaAssets: MediaAssetRecord[],
): SceneContentEntry[] {
  const entries: SceneContentEntry[] = [];

  for (const projector of projectors) {
    let mediaSummary = PATTERN_LABELS[projector.testPattern] ?? projector.testPattern;
    let videoAssetId: string | null = null;

    if (projector.mediaSource === 'image' && projector.mediaAssetId) {
      mediaSummary = `Image: ${assetName(mediaAssets, projector.mediaAssetId) ?? '—'}`;
    } else if (projector.mediaSource === 'video' && projector.mediaAssetId) {
      videoAssetId = projector.mediaAssetId;
      mediaSummary = `Video: ${assetName(mediaAssets, projector.mediaAssetId) ?? '—'}`;
    } else if (projector.mediaSource === 'pattern') {
      mediaSummary = `Pattern: ${mediaSummary}`;
    }

    entries.push({
      id: `projector:${projector.id}`,
      ownerLabel: projector.name,
      ownerKind: 'projector',
      mediaSummary,
      videoAssetId,
      isPlaying: videoAssetId ? isVideoPlaying(videoAssetId) : false,
    });
  }

  for (const obj of sceneObjects) {
    if (obj.type !== 'ledWall' || !obj.ledWall) continue;
    const videoAssetId =
      obj.ledWall.mediaSource === 'video' ? obj.ledWall.mediaAssetId : null;
    const mediaSummary =
      obj.ledWall.mediaSource === 'video'
        ? `Video: ${assetName(mediaAssets, obj.ledWall.mediaAssetId) ?? '—'}`
        : `Image: ${assetName(mediaAssets, obj.ledWall.mediaAssetId) ?? '—'}`;

    entries.push({
      id: `ledWall:${obj.id}`,
      ownerLabel: obj.name,
      ownerKind: 'ledWall',
      mediaSummary,
      videoAssetId,
      isPlaying: videoAssetId ? isVideoPlaying(videoAssetId) : false,
    });
  }

  return entries;
}
