import type { ProjectorConfig } from '../types';
import { mediaTextureCache } from './assetImport';

export interface VideoSourceRef {
  assetId: string;
  label: string;
}

export function videoElement(assetId: string): HTMLVideoElement | null {
  return mediaTextureCache.get(assetId)?.video ?? null;
}

export function isVideoPlaying(assetId: string): boolean {
  const video = videoElement(assetId);
  return video ? !video.paused : false;
}

export function listProjectorVideoSources(projectors: ProjectorConfig[]): VideoSourceRef[] {
  const byAsset = new Map<string, string>();
  for (const projector of projectors) {
    if (projector.mediaSource !== 'video' || !projector.mediaAssetId) continue;
    const existing = byAsset.get(projector.mediaAssetId);
    byAsset.set(
      projector.mediaAssetId,
      existing ? `${existing}, ${projector.name}` : projector.name,
    );
  }
  return [...byAsset.entries()].map(([assetId, label]) => ({ assetId, label }));
}

export function listSceneVideoSources(projectors: ProjectorConfig[]): VideoSourceRef[] {
  return listProjectorVideoSources(projectors);
}

export function playVideo(assetId: string): boolean {
  const video = videoElement(assetId);
  if (!video) return false;
  void video.play();
  return true;
}

export function pauseVideo(assetId: string): void {
  videoElement(assetId)?.pause();
}

export function toggleVideo(assetId: string): boolean {
  const video = videoElement(assetId);
  if (!video) return false;
  if (video.paused) {
    void video.play();
    return true;
  }
  video.pause();
  return false;
}

export function playVideos(assetIds: string[]): number {
  let started = 0;
  for (const assetId of assetIds) {
    if (playVideo(assetId)) started += 1;
  }
  return started;
}

export function pauseVideos(assetIds: string[]): void {
  for (const assetId of assetIds) {
    pauseVideo(assetId);
  }
}
