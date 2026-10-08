import * as THREE from 'three';
import type { Layer, Track } from '../types';
import { clipLength, layerMediaTimeAt, type LiveLayer } from './evaluate';
import type { TransportClock } from './clock';
import { mediaTextureCache } from '../media';
import { PRELOAD_SEC, syncDecision, updateLatency, updateSeekLead } from './syncMath';

/** One <video> element with its texture and sync state. */
interface Player {
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  aspect: number;
  pendingPlay: boolean;
  /** EMA of seek latency (s): seeks while playing land this far ahead. */
  seekLead: number;
  seekStartedAt: number;
  /** Wall time until which the video is settling after a seek / play. */
  settleUntil: number;
  /** Last presented frame (requestVideoFrameCallback): media time and display wall time. */
  lastFrame: { mediaTime: number; displayWall: number } | null;
  /** Rate-nudge hysteresis state. */
  correcting: boolean;
  /** performance.now() of the last play() call, until its first frame shows. */
  playCalledAt: number;
  /** That play() was a loop hand-off (measured separately from transport starts). */
  handoff: boolean;
  disposed: boolean;
}

/**
 * Everything one video layer plays through. Looping layers get a second player
 * parked at the in-point: it is started a start-up latency before the wrap and
 * takes over exactly at it, so loops are seamless (a seek at the wrap stalls).
 */
interface Deck {
  assetId: string;
  players: Player[];
  active: number;
  /** Standby started for the wrap into this loop cycle. */
  armedForCycle: number | null;
}

/** Frame data older than this is not trusted for drift. */
const FRAME_INFO_MAX_AGE_MS = 250;
/** Until measured; low so short-GOP media keeps the plain 2-frame threshold. */
const INITIAL_SEEK_LEAD = 0.03;
const SETTLE_MS = 400;

let host: HTMLDivElement | null = null;

/** Attached (Chrome deprioritises detached <video>) but invisible container. */
function mediaHost(): HTMLDivElement {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';
  document.body.appendChild(host);
  return host;
}

/**
 * Video layers follow the master clock. One deck per layer (two layers may play
 * the same file at different times). Audio plays by default with the layer's
 * volume / mute.
 */
export class MediaSync {
  private readonly decks = new Map<string, Deck>();
  /** True when the browser refused unmuted playback and we fell back to muted. */
  audioBlocked = false;
  /** Learned common presentation latency of playing videos (seconds behind the clock). */
  latency = 0.04;
  /** Learned time from play() to a video's first new frame on screen (ms) — the transport pre-roll. */
  startupMs = 100;
  /** Same for a parked standby player taking over a loop (no seek involved). */
  handoffMs = 80;
  /** Clock time for preload windows; set before sync(). */
  private lastTime: number | null = null;

  media(layerId: string): { texture: THREE.Texture; aspect: number } | null {
    const deck = this.decks.get(layerId);
    const p = deck?.players[deck.active];
    if (!p || p.video.readyState < 2) return null;
    return { texture: p.texture, aspect: p.aspect };
  }

  /** The element currently shown for a layer (tests / debugging). */
  activeVideo(layerId: string): HTMLVideoElement | null {
    const deck = this.decks.get(layerId);
    return deck ? deck.players[deck.active].video : null;
  }

  setTime(t: number): void {
    this.lastTime = t;
  }

  /**
   * @param clock used to know where the show was when the last video frame was
   *   displayed: drift = that frame's media time − the clock's media time at its
   *   display time. currentTime alone lags by the presentation pipeline.
   */
  sync(live: LiveLayer[], track: Track, playing: boolean, rate: number, fps: number, clock?: TransportClock): void {
    const keep = new Set<string>();
    const lags: number[] = [];
    for (const entry of live) {
      const { layer } = entry;
      if (layer.media.kind !== 'video' || !layer.media.assetId || entry.mediaTimeSec === null) continue;
      const deck = this.ensure(layer);
      if (!deck) continue;
      keep.add(layer.id);
      const baseRate = layer.speed * rate;
      const duration = this.durationOf(deck);
      const loopLen = layer.playMode === 'loop' ? clipLength(layer, duration) : null;
      const wraps = loopLen !== null && loopLen > 0 && loopLen < layer.durationSec * layer.speed - 1e-3;
      if (wraps) this.handleLoop(deck, layer, entry, loopLen!, playing, baseRate);
      const p = deck.players[deck.active];
      this.applyAudio(p, layer);
      if (p.video.seeking) continue;
      const now = performance.now();
      let current = p.video.currentTime;
      let target = entry.mediaTimeSec;
      const f = p.lastFrame;
      if (playing && clock && f && now - f.displayWall < FRAME_INFO_MAX_AGE_MS) {
        const expected = layerMediaTimeAt(layer, clock.timeAtWall(f.displayWall), duration, fps);
        if (expected !== null) {
          current = f.mediaTime;
          target = expected;
        }
      }
      // Looping clips: compare on the loop circle so the wrap is not a 'drift'.
      if (loopLen && loopLen > 0) {
        const diff = current - target;
        current = target + (diff - Math.round(diff / loopLen) * loopLen);
      }
      const settling = now < p.settleUntil;
      const d = syncDecision(current, target, playing, baseRate, fps, {
        seekLeadSec: p.seekLead,
        settling,
        latencySec: this.latency,
        correcting: p.correcting,
      });
      p.correcting = d.correcting;
      if (playing && !settling && f && current !== p.video.currentTime) lags.push(target - current);
      if (d.seekTo !== null) {
        p.seekStartedAt = playing ? now : 0;
        p.settleUntil = now + SETTLE_MS;
        p.lastFrame = null;
        // Seek relative to the live target (the drift may be measured on an older frame).
        p.video.currentTime = entry.mediaTimeSec + (d.seekTo - target);
      }
      if (Math.abs(p.video.playbackRate - d.playbackRate) > 1e-3) p.video.playbackRate = d.playbackRate;
      if (d.shouldPlay) this.play(p);
      else if (!p.video.paused) p.video.pause();
    }
    if (playing) this.latency = updateLatency(this.latency, lags);

    // Preload clips that start soon: create, park at the in-point, stay paused.
    const now = this.lastTime;
    for (const layer of track.layers) {
      if (keep.has(layer.id) || !layer.enabled || layer.media.kind !== 'video' || !layer.media.assetId) continue;
      if (now === null) continue;
      const until = layer.startSec - now;
      if (until > 0 && until <= PRELOAD_SEC) {
        const deck = this.ensure(layer);
        if (!deck) continue;
        keep.add(layer.id);
        for (const p of deck.players) this.park(p, layer.inSec);
      }
    }
    const layerIds = new Set(track.layers.map((l) => l.id));
    for (const [id, deck] of this.decks) {
      if (keep.has(id)) continue;
      for (const p of deck.players) if (!p.video.paused) p.video.pause();
      if (!layerIds.has(id)) this.release(id);
    }
  }

  pauseAll(): void {
    for (const deck of this.decks.values()) for (const p of deck.players) if (!p.video.paused) p.video.pause();
  }

  dispose(): void {
    for (const id of [...this.decks.keys()]) this.release(id);
  }

  /** Seamless loop hand-off between the two players of a deck. */
  private handleLoop(deck: Deck, layer: Layer, entry: LiveLayer, loopLen: number, playing: boolean, baseRate: number): void {
    if (deck.players.length < 2) deck.players.push(this.createPlayer(deck.assetId));
    const standbyIndex = 1 - deck.active;
    const standby = deck.players[standbyIndex];
    const elapsed = entry.localSec * layer.speed;
    const cycle = Math.floor(elapsed / loopLen + 1e-9);
    if (!playing) {
      deck.armedForCycle = null;
      this.park(standby, layer.inSec);
      return;
    }
    if (deck.armedForCycle !== null && cycle >= deck.armedForCycle) {
      // The wrap: the standby (already running from the in-point) takes over.
      const old = deck.players[deck.active];
      deck.active = standbyIndex;
      deck.armedForCycle = null;
      const now = performance.now();
      standby.settleUntil = now + SETTLE_MS;
      if (!old.video.paused) old.video.pause();
      this.park(old, layer.inSec);
      return;
    }
    const remainingMs = ((loopLen - (elapsed - cycle * loopLen)) / Math.max(1e-3, baseRate)) * 1000;
    if (deck.armedForCycle === null && remainingMs <= this.handoffMs) {
      // Parked at the in-point since the last wrap: start it so its first new frame
      // lands on the wrap.
      this.applyAudio(standby, layer);
      standby.video.playbackRate = baseRate;
      this.play(standby, true);
      deck.armedForCycle = cycle + 1;
    } else if (deck.armedForCycle === null) {
      this.park(standby, layer.inSec);
    }
  }

  /** Paused at a media time (seeks only when off by more than half a frame). */
  private park(p: Player, at: number): void {
    if (!p.video.paused) p.video.pause();
    if (!p.video.seeking && Math.abs(p.video.currentTime - at) > 0.015) p.video.currentTime = at;
  }

  private durationOf(deck: Deck): number | null {
    const d = deck.players[0].video.duration;
    return Number.isFinite(d) ? d : null;
  }

  private ensure(layer: Layer): Deck | null {
    if (layer.media.kind !== 'video' || !layer.media.assetId) return null;
    const assetId = layer.media.assetId;
    const existing = this.decks.get(layer.id);
    if (existing && existing.assetId === assetId) return existing;
    if (existing) this.release(layer.id);
    if (!mediaTextureCache.get(assetId)?.video) return null;
    const deck: Deck = { assetId, players: [this.createPlayer(assetId)], active: 0, armedForCycle: null };
    this.decks.set(layer.id, deck);
    return deck;
  }

  private createPlayer(assetId: string): Player {
    const source = mediaTextureCache.get(assetId)!.video!;
    const video = document.createElement('video');
    mediaHost().appendChild(video);
    video.src = source.src;
    video.preload = 'auto';
    video.playsInline = true;
    video.loop = false;
    video.crossOrigin = 'anonymous';
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    const p: Player = {
      video,
      texture,
      aspect: source.videoWidth / Math.max(1, source.videoHeight) || 16 / 9,
      pendingPlay: false,
      seekLead: INITIAL_SEEK_LEAD,
      seekStartedAt: 0,
      settleUntil: 0,
      lastFrame: null,
      correcting: false,
      playCalledAt: 0,
      handoff: false,
      disposed: false,
    };
    if ('requestVideoFrameCallback' in video) {
      const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
        if (p.disposed) return;
        p.lastFrame = { mediaTime: meta.mediaTime, displayWall: meta.expectedDisplayTime };
        if (p.playCalledAt > 0) {
          const startup = meta.expectedDisplayTime - p.playCalledAt;
          if (startup > 0 && startup < 1000) {
            if (p.handoff) this.handoffMs = this.handoffMs * 0.7 + startup * 0.3;
            else this.startupMs = this.startupMs * 0.7 + startup * 0.3;
          }
          p.playCalledAt = 0;
        }
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    }
    video.addEventListener('seeked', () => {
      if (p.seekStartedAt > 0) p.seekLead = updateSeekLead(p.seekLead, (performance.now() - p.seekStartedAt) / 1000);
      p.seekStartedAt = 0;
    });
    video.addEventListener('loadedmetadata', () => {
      p.aspect = video.videoWidth / Math.max(1, video.videoHeight) || p.aspect;
    });
    return p;
  }

  private applyAudio(p: Player, layer: Layer): void {
    const muted = layer.muted || this.audioBlocked;
    if (p.video.muted !== muted) p.video.muted = muted;
    const vol = Math.min(1, Math.max(0, layer.volume));
    if (Math.abs(p.video.volume - vol) > 1e-3) p.video.volume = vol;
  }

  private play(p: Player, handoff = false): void {
    if (!p.video.paused || p.pendingPlay) return;
    p.pendingPlay = true;
    p.settleUntil = performance.now() + SETTLE_MS;
    p.playCalledAt = performance.now();
    p.handoff = handoff;
    p.video
      .play()
      .catch((err: unknown) => {
        // Autoplay with sound needs a user gesture; keep the show running muted.
        if (err instanceof DOMException && err.name === 'NotAllowedError' && !p.video.muted) {
          this.audioBlocked = true;
          p.video.muted = true;
          return p.video.play().catch(() => undefined);
        }
        return undefined;
      })
      .finally(() => {
        p.pendingPlay = false;
      });
  }

  private release(id: string): void {
    const deck = this.decks.get(id);
    if (!deck) return;
    for (const p of deck.players) {
      p.disposed = true;
      p.video.pause();
      p.video.removeAttribute('src');
      p.video.load();
      p.video.remove();
      p.texture.dispose();
    }
    this.decks.delete(id);
  }
}
