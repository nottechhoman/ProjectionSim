import * as THREE from 'three';
import type { Layer, Track } from '../types';
import type { LiveLayer } from './evaluate';
import { mediaTextureCache } from '../media';
import { PRELOAD_SEC, syncDecision } from './syncMath';

interface LayerVideo {
  assetId: string;
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  aspect: number;
  pendingPlay: boolean;
}

/**
 * One <video> per video layer (two layers may play the same file at different
 * times), kept in step with the master clock. Audio plays by default with the
 * layer's volume / mute.
 */
export class MediaSync {
  private readonly videos = new Map<string, LayerVideo>();
  /** True when the browser refused unmuted playback and we fell back to muted. */
  audioBlocked = false;

  media(layerId: string): { texture: THREE.Texture; aspect: number } | null {
    const v = this.videos.get(layerId);
    if (!v || v.video.readyState < 2) return null;
    return { texture: v.texture, aspect: v.aspect };
  }

  sync(live: LiveLayer[], track: Track, playing: boolean, rate: number, fps: number): void {
    const keep = new Set<string>();
    for (const entry of live) {
      const { layer } = entry;
      if (layer.media.kind !== 'video' || !layer.media.assetId || entry.mediaTimeSec === null) continue;
      const lv = this.ensure(layer);
      if (!lv) continue;
      keep.add(layer.id);
      this.applyAudio(lv, layer);
      const d = syncDecision(lv.video.currentTime, entry.mediaTimeSec, playing, layer.speed * rate, fps);
      if (d.seekTo !== null && !lv.video.seeking) lv.video.currentTime = d.seekTo;
      if (Math.abs(lv.video.playbackRate - d.playbackRate) > 1e-3) lv.video.playbackRate = d.playbackRate;
      if (d.shouldPlay) this.play(lv);
      else if (!lv.video.paused) lv.video.pause();
    }
    // Preload clips that start soon: create, seek to the in-point, stay paused.
    const now = this.lastTime;
    for (const layer of track.layers) {
      if (keep.has(layer.id) || !layer.enabled || layer.media.kind !== 'video' || !layer.media.assetId) continue;
      if (now === null) continue;
      const until = layer.startSec - now;
      if (until > 0 && until <= PRELOAD_SEC) {
        const lv = this.ensure(layer);
        if (!lv) continue;
        keep.add(layer.id);
        if (!lv.video.paused) lv.video.pause();
        if (Math.abs(lv.video.currentTime - layer.inSec) > 0.05 && !lv.video.seeking) lv.video.currentTime = layer.inSec;
      }
    }
    const layerIds = new Set(track.layers.map((l) => l.id));
    for (const [id, lv] of this.videos) {
      if (keep.has(id)) continue;
      if (!lv.video.paused) lv.video.pause();
      if (!layerIds.has(id)) this.release(id);
    }
  }

  /** Clock time for preload windows; set before sync(). */
  private lastTime: number | null = null;
  setTime(t: number): void {
    this.lastTime = t;
  }

  pauseAll(): void {
    for (const lv of this.videos.values()) if (!lv.video.paused) lv.video.pause();
  }

  dispose(): void {
    for (const id of [...this.videos.keys()]) this.release(id);
  }

  private ensure(layer: Layer): LayerVideo | null {
    if (layer.media.kind !== 'video' || !layer.media.assetId) return null;
    const assetId = layer.media.assetId;
    const existing = this.videos.get(layer.id);
    if (existing && existing.assetId === assetId) return existing;
    if (existing) this.release(layer.id);
    const source = mediaTextureCache.get(assetId)?.video;
    if (!source) return null;
    const video = document.createElement('video');
    video.src = source.src;
    video.preload = 'auto';
    video.playsInline = true;
    video.loop = false;
    video.crossOrigin = 'anonymous';
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    const lv: LayerVideo = {
      assetId,
      video,
      texture,
      aspect: source.videoWidth / Math.max(1, source.videoHeight) || 16 / 9,
      pendingPlay: false,
    };
    video.addEventListener('loadedmetadata', () => {
      lv.aspect = video.videoWidth / Math.max(1, video.videoHeight) || lv.aspect;
    });
    this.videos.set(layer.id, lv);
    return lv;
  }

  private applyAudio(lv: LayerVideo, layer: Layer): void {
    const muted = layer.muted || this.audioBlocked;
    if (lv.video.muted !== muted) lv.video.muted = muted;
    const vol = Math.min(1, Math.max(0, layer.volume));
    if (Math.abs(lv.video.volume - vol) > 1e-3) lv.video.volume = vol;
  }

  private play(lv: LayerVideo): void {
    if (!lv.video.paused || lv.pendingPlay) return;
    lv.pendingPlay = true;
    lv.video
      .play()
      .catch((err: unknown) => {
        // Autoplay with sound needs a user gesture; keep the show running muted.
        if (err instanceof DOMException && err.name === 'NotAllowedError' && !lv.video.muted) {
          this.audioBlocked = true;
          lv.video.muted = true;
          return lv.video.play().catch(() => undefined);
        }
        return undefined;
      })
      .finally(() => {
        lv.pendingPlay = false;
      });
  }

  private release(id: string): void {
    const lv = this.videos.get(id);
    if (!lv) return;
    lv.video.pause();
    lv.video.removeAttribute('src');
    lv.video.load();
    lv.texture.dispose();
    this.videos.delete(id);
  }
}
