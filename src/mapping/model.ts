import type {
  DirectFit,
  FeedRect,
  Layer,
  LayerBlendMode,
  LayerPlayMode,
  LayerRect,
  Mapping,
  MappingFiltering,
  MappingKind,
  MediaFitMode,
  MediaRef,
  ProjectorConfig,
  SceneObject,
  Show,
  SurfaceUvProjection,
  TestPattern,
  Track,
  UvWrapMode,
  Vec3,
} from '../types';
import { quaternionToEulerYXZ } from '../utils/euler';
import { normalizeKeyframes } from '../playback/keyframes';

/**
 * v4 content model: mappings (how a canvas lands on screens) and layers (what is
 * played, on which mapping, when). Pure helpers — no three.js, no DOM.
 */

export const MAPPING_KINDS: MappingKind[] = ['direct', 'perspective', 'parallel', 'feed', 'cylindrical', 'spherical'];
export const MAPPING_KIND_LABEL: Record<MappingKind, string> = {
  direct: 'Direct (screen UV)',
  perspective: 'Perspective',
  parallel: 'Parallel (orthographic)',
  feed: 'Feed (UV regions)',
  cylindrical: 'Cylindrical',
  spherical: 'Spherical',
};

export const DEFAULT_TRACK_DURATION_SEC = 60;
export const DEFAULT_FPS = 30;
export const FULL_RECT: LayerRect = { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 };

const PATTERNS: TestPattern[] = ['checkerboard', 'uvGrid', 'colorBars', 'white', 'projectorId', 'black', 'gray'];
const FITS: MediaFitMode[] = ['contain', 'cover', 'stretch'];
const DIRECT_FITS: DirectFit[] = ['crop', 'fit', 'stretch', 'pixel'];
const FILTERS: MappingFiltering[] = ['nearest', 'bilinear', 'msaa2x'];
export const LAYER_BLEND_MODES: LayerBlendMode[] = [
  'normal',
  'add',
  'screen',
  'multiply',
  'overlay',
  'softLight',
  'lighten',
  'darken',
  'difference',
];
const BLENDS = LAYER_BLEND_MODES;
const PLAY_MODES: LayerPlayMode[] = ['loop', 'once', 'holdLast', 'pingPong'];
const PROJECTIONS: SurfaceUvProjection[] = ['meshUv', 'planar', 'cylindrical', 'spherical'];
const WRAPS: UvWrapMode[] = ['clamp', 'repeat', 'mirror'];

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function vec3(v: unknown, fallback: Vec3): Vec3 {
  if (!isObject(v)) return { ...fallback };
  return { x: num(v.x, fallback.x), y: num(v.y, fallback.y), z: num(v.z, fallback.z) };
}
function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

/** Physical aspect (width / height) of a screen's texture layout. */
export function screenAspect(obj: SceneObject): number {
  if (obj.type === 'curvedScreen' && obj.curved) {
    const arcLen = obj.curved.radius * (obj.curved.arcAngleDeg * Math.PI) / 180;
    return arcLen / Math.max(1e-6, obj.curved.height);
  }
  if (obj.type === 'ledWall' && obj.ledWall) {
    return obj.ledWall.pixelResolution.width / Math.max(1, obj.ledWall.pixelResolution.height);
  }
  if (obj.type === 'model') return 1;
  // Boxes carry a 3×2 face atlas.
  if (obj.type === 'box') return 1.5;
  return obj.dimensions.width / Math.max(1e-6, obj.dimensions.height);
}

/** Objects that can show content: projection receivers and LED walls. */
export function isScreen(obj: SceneObject): boolean {
  return obj.type === 'ledWall' || obj.receivesProjection;
}

export function listScreens(sceneObjects: SceneObject[]): SceneObject[] {
  return sceneObjects.filter(isScreen);
}

function resolutionForAspect(aspect: number, longEdge = 1920): { w: number; h: number } {
  if (aspect >= 1) return { w: longEdge, h: Math.max(1, Math.round(longEdge / aspect)) };
  return { w: Math.max(1, Math.round(longEdge * aspect)), h: longEdge };
}

function baseMapping(kind: MappingKind, name: string, screenIds: string[], resolution: { w: number; h: number }): Mapping {
  return {
    id: newId('map'),
    name,
    kind,
    resolution,
    screenIds,
    filtering: 'bilinear',
    maskAssetId: null,
  };
}

export function createDirectMapping(screen: SceneObject): Mapping {
  const resolution =
    screen.type === 'ledWall' && screen.ledWall
      ? { w: screen.ledWall.pixelResolution.width, h: screen.ledWall.pixelResolution.height }
      : resolutionForAspect(screenAspect(screen));
  return { ...baseMapping('direct', screen.name, [screen.id], resolution), direct: { fit: 'stretch' } };
}

export function createPerspectiveMapping(projector: ProjectorConfig, screenIds: string[]): Mapping {
  const e = quaternionToEulerYXZ(projector.transform.quaternion);
  return {
    ...baseMapping(
      'perspective',
      `${projector.name} view`,
      screenIds,
      { w: projector.optics.resolution.width, h: projector.optics.resolution.height },
    ),
    perspective: {
      eye: { ...projector.transform.position },
      rotation: { x: e.pitch, y: e.yaw, z: e.roll },
      fovDeg: 40,
      lockToProjectorId: projector.id,
      projectorOnly: false,
    },
  };
}

export function createMapping(kind: MappingKind, screenIds: string[], projectors: ProjectorConfig[], name?: string): Mapping {
  const label = name ?? `${MAPPING_KIND_LABEL[kind].split(' ')[0]} mapping`;
  const m = baseMapping(kind, label, screenIds, { w: 1920, h: 1080 });
  return normalizeMapping({ ...m, ...defaultParams(kind, projectors) });
}

function defaultParams(kind: MappingKind, projectors: ProjectorConfig[]): Partial<Mapping> {
  switch (kind) {
    case 'direct':
      return { direct: { fit: 'stretch' } };
    case 'perspective': {
      const p = projectors[0];
      const e = p ? quaternionToEulerYXZ(p.transform.quaternion) : { yaw: 0, pitch: 0, roll: 0 };
      return {
        perspective: {
          eye: p ? { ...p.transform.position } : { x: 0, y: 1.5, z: 6 },
          rotation: { x: e.pitch, y: e.yaw, z: e.roll },
          fovDeg: 40,
          lockToProjectorId: null,
          projectorOnly: false,
        },
      };
    }
    case 'parallel':
      return { parallel: { center: { x: 0, y: 1.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, size: { w: 6, h: 3.375 } } };
    case 'feed':
      return { feed: { rects: [] } };
    case 'cylindrical':
      return { cylindrical: { center: { x: 0, y: 1.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, arcDeg: 90, height: 3.375 } };
    case 'spherical':
      return { spherical: { center: { x: 0, y: 1.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, arcDeg: 360, elevationDeg: 180 } };
  }
}

export function defaultFeedRect(screenId: string, projection: SurfaceUvProjection = 'meshUv'): FeedRect {
  return {
    screenId,
    projection,
    region: { x: 0, y: 0, width: 1, height: 1 },
    rotationDeg: 0,
    flipU: false,
    flipV: false,
    repeatU: 1,
    repeatV: 1,
    wrap: 'clamp',
  };
}

export function normalizeFeedRect(raw: unknown): FeedRect | null {
  if (!isObject(raw) || typeof raw.screenId !== 'string') return null;
  const region = isObject(raw.region) ? raw.region : {};
  const rep = (v: unknown) => clamp(num(v, 1), 0.05, 32);
  return {
    screenId: raw.screenId,
    projection: pick(raw.projection, PROJECTIONS, 'meshUv'),
    region: {
      x: clamp(num(region.x, 0), -2, 2),
      y: clamp(num(region.y, 0), -2, 2),
      width: clamp(num(region.width, 1), 0.01, 4),
      height: clamp(num(region.height, 1), 0.01, 4),
    },
    rotationDeg: num(raw.rotationDeg, 0),
    flipU: raw.flipU === true,
    flipV: raw.flipV === true,
    repeatU: rep(raw.repeatU),
    repeatV: rep(raw.repeatV),
    wrap: pick(raw.wrap, WRAPS, 'clamp'),
  };
}

export function normalizeMapping(raw: unknown): Mapping {
  const d = isObject(raw) ? raw : {};
  const kind = pick(d.kind, MAPPING_KINDS, 'direct');
  const res = isObject(d.resolution) ? d.resolution : {};
  const zero = { x: 0, y: 0, z: 0 };
  const m: Mapping = {
    id: typeof d.id === 'string' ? d.id : newId('map'),
    name: typeof d.name === 'string' ? d.name : 'Mapping',
    kind,
    resolution: {
      w: Math.round(clamp(num(res.w, 1920), 1, 16384)),
      h: Math.round(clamp(num(res.h, 1080), 1, 16384)),
    },
    screenIds: Array.isArray(d.screenIds) ? d.screenIds.filter((s): s is string => typeof s === 'string') : [],
    filtering: pick(d.filtering, FILTERS, 'bilinear'),
    maskAssetId: typeof d.maskAssetId === 'string' ? d.maskAssetId : null,
  };
  const src = (key: string) => (isObject(d[key]) ? (d[key] as Record<string, unknown>) : {});
  switch (kind) {
    case 'direct':
      m.direct = { fit: pick(src('direct').fit, DIRECT_FITS, 'stretch') };
      break;
    case 'perspective': {
      const p = src('perspective');
      m.perspective = {
        eye: vec3(p.eye, { x: 0, y: 1.5, z: 6 }),
        rotation: vec3(p.rotation, zero),
        fovDeg: clamp(num(p.fovDeg, 40), 1, 170),
        lockToProjectorId: typeof p.lockToProjectorId === 'string' ? p.lockToProjectorId : null,
        projectorOnly: p.projectorOnly === true,
      };
      break;
    }
    case 'parallel': {
      const p = src('parallel');
      const size = isObject(p.size) ? p.size : {};
      m.parallel = {
        center: vec3(p.center, { x: 0, y: 1.5, z: 0 }),
        rotation: vec3(p.rotation, zero),
        size: { w: Math.max(0.001, num(size.w, 6)), h: Math.max(0.001, num(size.h, 3.375)) },
      };
      break;
    }
    case 'feed': {
      const p = src('feed');
      m.feed = {
        rects: Array.isArray(p.rects)
          ? p.rects.map(normalizeFeedRect).filter((r): r is FeedRect => r !== null)
          : [],
      };
      break;
    }
    case 'cylindrical': {
      const p = src('cylindrical');
      m.cylindrical = {
        center: vec3(p.center, { x: 0, y: 1.5, z: 0 }),
        rotation: vec3(p.rotation, zero),
        arcDeg: clamp(num(p.arcDeg, 90), 1, 360),
        height: Math.max(0.001, num(p.height, 3.375)),
      };
      break;
    }
    case 'spherical': {
      const p = src('spherical');
      m.spherical = {
        center: vec3(p.center, { x: 0, y: 1.5, z: 0 }),
        rotation: vec3(p.rotation, zero),
        arcDeg: clamp(num(p.arcDeg, 360), 1, 360),
        elevationDeg: clamp(num(p.elevationDeg, 180), 1, 180),
      };
      break;
    }
  }
  return m;
}

/** Switch a mapping's kind, keeping id/name/screens/resolution. */
export function changeMappingKind(mapping: Mapping, kind: MappingKind, projectors: ProjectorConfig[]): Mapping {
  const base: Mapping = {
    id: mapping.id,
    name: mapping.name,
    kind,
    resolution: mapping.resolution,
    screenIds: mapping.screenIds,
    filtering: mapping.filtering,
    maskAssetId: mapping.maskAssetId,
  };
  const next = normalizeMapping({ ...base, ...defaultParams(kind, projectors) });
  if (kind === 'feed') next.feed = { rects: mapping.screenIds.map((id) => defaultFeedRect(id)) };
  return next;
}

// ---------------------------------------------------------------------------
// Layers / tracks / show
// ---------------------------------------------------------------------------

export function defaultMediaName(media: MediaRef): string {
  switch (media.kind) {
    case 'video':
      return 'Video';
    case 'image':
      return 'Image';
    case 'pattern':
      return 'Pattern';
    case 'solid':
      return 'Solid';
  }
}

export function createLayer(media: MediaRef, mappingId: string | null, patch: Partial<Layer> = {}): Layer {
  return {
    id: newId('layer'),
    name: defaultMediaName(media),
    media,
    mappingId,
    opacity: 1,
    blendMode: 'normal',
    startSec: 0,
    durationSec: DEFAULT_TRACK_DURATION_SEC,
    inSec: 0,
    outSec: null,
    playMode: 'loop',
    speed: 1,
    fadeInSec: 0,
    fadeOutSec: 0,
    rect: { ...FULL_RECT },
    fit: 'contain',
    volume: 1,
    muted: false,
    enabled: true,
    ...patch,
  };
}

export function normalizeMediaRef(raw: unknown): MediaRef {
  if (!isObject(raw)) return { kind: 'pattern', pattern: 'uvGrid', color: '#ffffff' };
  const color = typeof raw.color === 'string' ? raw.color : '#ffffff';
  switch (raw.kind) {
    case 'video':
    case 'image':
      return { kind: raw.kind, assetId: typeof raw.assetId === 'string' ? raw.assetId : null };
    case 'solid':
      return { kind: 'solid', color };
    default:
      return { kind: 'pattern', pattern: pick(raw.pattern, PATTERNS, 'uvGrid'), color };
  }
}

export function normalizeLayer(raw: unknown, index: number): Layer | null {
  if (!isObject(raw)) return null;
  const rect = isObject(raw.rect) ? raw.rect : {};
  return {
    id: typeof raw.id === 'string' ? raw.id : `layer-${index}`,
    name: typeof raw.name === 'string' ? raw.name : `Layer ${index + 1}`,
    media: normalizeMediaRef(raw.media),
    mappingId: typeof raw.mappingId === 'string' ? raw.mappingId : null,
    opacity: clamp(num(raw.opacity, 1), 0, 1),
    blendMode: pick(raw.blendMode, BLENDS, 'normal'),
    startSec: Math.max(0, num(raw.startSec, 0)),
    durationSec: Math.max(0.01, num(raw.durationSec, DEFAULT_TRACK_DURATION_SEC)),
    inSec: Math.max(0, num(raw.inSec, 0)),
    outSec: typeof raw.outSec === 'number' && Number.isFinite(raw.outSec) ? Math.max(0, raw.outSec) : null,
    playMode: pick(raw.playMode, PLAY_MODES, 'loop'),
    speed: clamp(num(raw.speed, 1), 0.01, 16),
    fadeInSec: Math.max(0, num(raw.fadeInSec, 0)),
    fadeOutSec: Math.max(0, num(raw.fadeOutSec, 0)),
    rect: {
      x: num(rect.x, 0),
      y: num(rect.y, 0),
      width: Math.max(1e-4, num(rect.width, 1)),
      height: Math.max(1e-4, num(rect.height, 1)),
      rotationDeg: num(rect.rotationDeg, 0),
    },
    fit: pick(raw.fit, FITS, 'contain'),
    volume: clamp(num(raw.volume, 1), 0, 1),
    muted: raw.muted === true,
    enabled: raw.enabled !== false,
    ...(normalizeKeyframes(raw.keyframes) ? { keyframes: normalizeKeyframes(raw.keyframes) } : {}),
  };
}

export function createTrack(name = 'Track 1', layers: Layer[] = []): Track {
  return { id: newId('track'), name, durationSec: DEFAULT_TRACK_DURATION_SEC, layers, sections: [], cues: [] };
}

export function createShow(mappings: Mapping[] = [], layers: Layer[] = []): Show {
  const track = createTrack('Track 1', layers);
  return { fps: DEFAULT_FPS, mappings, tracks: [track], activeTrackId: track.id };
}

export function normalizeShow(raw: unknown): Show {
  if (!isObject(raw)) return createShow();
  const mappings = Array.isArray(raw.mappings) ? raw.mappings.map(normalizeMapping) : [];
  const tracks: Track[] = Array.isArray(raw.tracks)
    ? raw.tracks.filter(isObject).map((t, ti) => ({
        id: typeof t.id === 'string' ? t.id : `track-${ti}`,
        name: typeof t.name === 'string' ? t.name : `Track ${ti + 1}`,
        durationSec: Math.max(1, num(t.durationSec, DEFAULT_TRACK_DURATION_SEC)),
        layers: Array.isArray(t.layers)
          ? t.layers.map(normalizeLayer).filter((l): l is Layer => l !== null)
          : [],
        sections: Array.isArray(t.sections)
          ? t.sections.filter(isObject).map((s, si) => ({
              id: typeof s.id === 'string' ? s.id : `section-${si}`,
              name: typeof s.name === 'string' ? s.name : `Section ${si + 1}`,
              startSec: Math.max(0, num(s.startSec, 0)),
              endSec: Math.max(0, num(s.endSec, 0)),
              endAction: pick(s.endAction, ['continue', 'stop', 'hold', 'loop'] as const, 'continue'),
            }))
          : [],
        cues: Array.isArray(t.cues)
          ? t.cues.filter(isObject).map((c, ci) => ({
              id: typeof c.id === 'string' ? c.id : `cue-${ci}`,
              name: typeof c.name === 'string' ? c.name : `Cue ${ci + 1}`,
              timeSec: Math.max(0, num(c.timeSec, 0)),
            }))
          : [],
      }))
    : [];
  if (tracks.length === 0) tracks.push(createTrack());
  const activeTrackId =
    typeof raw.activeTrackId === 'string' && tracks.some((t) => t.id === raw.activeTrackId)
      ? raw.activeTrackId
      : tracks[0].id;
  return { fps: clamp(Math.round(num(raw.fps, DEFAULT_FPS)), 1, 240), mappings, tracks, activeTrackId };
}

export function activeTrack(show: Show): Track {
  return show.tracks.find((t) => t.id === show.activeTrackId) ?? show.tracks[0];
}

/** Replace the active track via an updater. */
export function updateActiveTrack(show: Show, fn: (track: Track) => Track): Show {
  const id = activeTrack(show).id;
  return { ...show, tracks: show.tracks.map((t) => (t.id === id ? fn(t) : t)) };
}

/** Effective canvas resolution (a locked perspective mapping follows its projector). */
export function mappingResolution(mapping: Mapping, projectors: ProjectorConfig[]): { w: number; h: number } {
  const lock = mapping.kind === 'perspective' ? mapping.perspective?.lockToProjectorId : null;
  if (lock) {
    const p = projectors.find((pr) => pr.id === lock);
    if (p) return { w: p.optics.resolution.width, h: p.optics.resolution.height };
  }
  return mapping.resolution;
}

/** Mappings no longer referencing deleted screens / projectors. */
export function pruneMappingRefs(
  mappings: Mapping[],
  sceneObjects: SceneObject[],
  projectors: ProjectorConfig[],
): Mapping[] {
  const screenIds = new Set(sceneObjects.map((o) => o.id));
  const projIds = new Set(projectors.map((p) => p.id));
  let changed = false;
  const next = mappings.map((m) => {
    let out = m;
    if (m.screenIds.some((id) => !screenIds.has(id))) {
      out = { ...out, screenIds: out.screenIds.filter((id) => screenIds.has(id)) };
    }
    if (out.feed && out.feed.rects.some((r) => !screenIds.has(r.screenId))) {
      out = { ...out, feed: { rects: out.feed.rects.filter((r) => screenIds.has(r.screenId)) } };
    }
    const lock = out.perspective?.lockToProjectorId;
    if (out.perspective && lock && !projIds.has(lock)) {
      out = { ...out, perspective: { ...out.perspective, lockToProjectorId: null, projectorOnly: false } };
    }
    if (out !== m) changed = true;
    return out;
  });
  return changed ? next : mappings;
}

export function mediaAssetIdOf(media: MediaRef): string | null {
  return media.kind === 'video' || media.kind === 'image' ? media.assetId : null;
}

// ---------------------------------------------------------------------------
// Setlist (tracks) — pure helpers
// ---------------------------------------------------------------------------

export function addTrackToShow(show: Show, name?: string): Show {
  const track = createTrack(name ?? `Track ${show.tracks.length + 1}`);
  return { ...show, tracks: [...show.tracks, track], activeTrackId: track.id };
}

/** Copy a track (new ids for it, its layers, sections and cues) right after it, and make it active. */
export function duplicateTrackInShow(show: Show, id: string): Show {
  const index = show.tracks.findIndex((t) => t.id === id);
  if (index < 0) return show;
  const src = show.tracks[index];
  const copy: Track = {
    ...structuredClone(src),
    id: newId('track'),
    name: `${src.name} copy`,
    layers: src.layers.map((l) => ({ ...structuredClone(l), id: newId('layer') })),
    sections: src.sections.map((s) => ({ ...s, id: newId('section') })),
    cues: src.cues.map((c) => ({ ...c, id: newId('cue') })),
  };
  const tracks = [...show.tracks];
  tracks.splice(index + 1, 0, copy);
  return { ...show, tracks, activeTrackId: copy.id };
}

export function renameTrackInShow(show: Show, id: string, name: string): Show {
  const trimmed = name.trim();
  if (!trimmed) return show;
  return { ...show, tracks: show.tracks.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) };
}

/** Remove a track; the last remaining track cannot be removed. */
export function removeTrackFromShow(show: Show, id: string): Show {
  if (show.tracks.length <= 1) return show;
  const index = show.tracks.findIndex((t) => t.id === id);
  if (index < 0) return show;
  const tracks = show.tracks.filter((t) => t.id !== id);
  const activeTrackId = show.activeTrackId === id ? tracks[Math.min(index, tracks.length - 1)].id : show.activeTrackId;
  return { ...show, tracks, activeTrackId };
}

export function moveTrackInShow(show: Show, id: string, direction: -1 | 1): Show {
  const index = show.tracks.findIndex((t) => t.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= show.tracks.length) return show;
  const tracks = [...show.tracks];
  const [item] = tracks.splice(index, 1);
  tracks.splice(target, 0, item);
  return { ...show, tracks };
}

export function setActiveTrackInShow(show: Show, id: string): Show {
  return show.tracks.some((t) => t.id === id) ? { ...show, activeTrackId: id } : show;
}
