import { saveAssetBlob, loadAssetBlob } from '../persistence/assetStore';
import { MediaTextureCache } from './MediaTextureCache';
import { modelCache } from './modelCache';
import { loadModelFromBlob } from '../scene/ModelLoader';
import type { MediaAssetRecord } from '../types';

export const mediaTextureCache = new MediaTextureCache();

export async function importMediaBlob(
  blob: Blob,
  name: string,
  kind: 'image' | 'video' | 'model',
  mimeType: string,
): Promise<MediaAssetRecord> {
  const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await saveAssetBlob(id, blob);

  if (kind === 'image') {
    await mediaTextureCache.loadImage(id, blob);
  } else if (kind === 'video') {
    await mediaTextureCache.loadVideo(id, blob);
  } else {
    const { object, size } = await loadModelFromBlob(blob, name);
    object.userData.bboxSize = size;
    modelCache.set(id, object);
  }

  return { id, name, kind, mimeType };
}

export async function hydrateAssetsFromRecords(records: MediaAssetRecord[]): Promise<string[]> {
  const missing: string[] = [];
  for (const record of records) {
    if (record.kind === 'model' && modelCache.has(record.id)) continue;
    if (record.kind !== 'model' && mediaTextureCache.get(record.id)) continue;

    const blob = await loadAssetBlob(record.id);
    if (!blob) {
      missing.push(record.name);
      continue;
    }

    try {
      if (record.kind === 'image') {
        await mediaTextureCache.loadImage(record.id, blob);
      } else if (record.kind === 'video') {
        await mediaTextureCache.loadVideo(record.id, blob);
      } else {
        const { object, size } = await loadModelFromBlob(blob, record.name);
        object.userData.bboxSize = size;
        modelCache.set(record.id, object);
      }
    } catch {
      missing.push(record.name);
    }
  }
  return missing;
}

export function detectFileKind(file: File): 'image' | 'video' | 'model' | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (
    file.name.endsWith('.glb') ||
    file.name.endsWith('.gltf') ||
    file.name.endsWith('.obj') ||
    file.type === 'model/gltf-binary' ||
    file.type === 'model/gltf+json'
  ) {
    return 'model';
  }
  return null;
}
