import * as THREE from 'three';

export interface LoadedMedia {
  texture: THREE.Texture;
  video: HTMLVideoElement | null;
  aspect: number;
}

export class MediaTextureCache {
  private readonly entries = new Map<string, LoadedMedia>();

  get(assetId: string): LoadedMedia | undefined {
    return this.entries.get(assetId);
  }

  async loadImage(assetId: string, blob: Blob): Promise<LoadedMedia> {
    this.dispose(assetId);
    const url = URL.createObjectURL(blob);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.src = url;
    });
    URL.revokeObjectURL(url);

    const texture = new THREE.Texture(image);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const aspect = image.width / image.height;
    const entry: LoadedMedia = { texture, video: null, aspect };
    this.entries.set(assetId, entry);
    return entry;
  }

  async loadVideo(assetId: string, blob: Blob): Promise<LoadedMedia> {
    this.dispose(assetId);
    const url = URL.createObjectURL(blob);
    const video = document.createElement('video');
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Failed to decode video'));
    });

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    const aspect = video.videoWidth / video.videoHeight;
    const entry: LoadedMedia = { texture, video, aspect };
    this.entries.set(assetId, entry);
    return entry;
  }

  updateVideos(): void {
    for (const entry of this.entries.values()) {
      if (entry.video && !entry.video.paused) {
        entry.texture.needsUpdate = true;
      }
    }
  }

  dispose(assetId: string): void {
    const entry = this.entries.get(assetId);
    if (!entry) return;
    entry.texture.dispose();
    if (entry.video) {
      entry.video.pause();
      URL.revokeObjectURL(entry.video.src);
    }
    this.entries.delete(assetId);
  }

  disposeAll(): void {
    for (const id of [...this.entries.keys()]) {
      this.dispose(id);
    }
  }
}

/** Map raster UV to media UV with contain/cover/stretch */
export function applyMediaFit(
  uv: { x: number; y: number },
  fit: 'contain' | 'cover' | 'stretch',
  mediaAspect: number,
  rasterAspect: number,
): THREE.Vector2 {
  if (fit === 'stretch' || mediaAspect <= 0) {
    return new THREE.Vector2(uv.x, uv.y);
  }

  let scaleX = 1;
  let scaleY = 1;
  if (fit === 'contain') {
    if (mediaAspect > rasterAspect) {
      scaleY = rasterAspect / mediaAspect;
    } else {
      scaleX = mediaAspect / rasterAspect;
    }
  } else {
    // cover
    if (mediaAspect > rasterAspect) {
      scaleX = mediaAspect / rasterAspect;
    } else {
      scaleY = rasterAspect / mediaAspect;
    }
  }

  return new THREE.Vector2(
    (uv.x - 0.5) / scaleX + 0.5,
    (uv.y - 0.5) / scaleY + 0.5,
  );
}

export const FIT_MODE_INT = { contain: 0, cover: 1, stretch: 2 } as const;
