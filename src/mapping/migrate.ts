import type {
  FeedRect,
  Layer,
  Mapping,
  MediaFitMode,
  MediaRef,
  ProjectorConfig,
  SceneObject,
  Show,
  TestPattern,
} from '../types';
import { quaternionToEulerYXZ } from '../utils/euler';
import {
  createDirectMapping,
  createLayer,
  createShow,
  defaultFeedRect,
  newId,
  normalizeFeedRect,
} from './model';

/**
 * v1–v3 → v4 content migration.
 *
 * Old projects kept content on projectors (raw mapping: each projector its own
 * raster) or on one shared source / content canvas mapped to the receiving
 * surfaces. v4 keeps content only on layers, each sampled through a mapping:
 *
 *  - Raw → one layer per projector on a Perspective mapping locked to that
 *    projector and marked projector-only, so overlaps still show each projector's
 *    own image.
 *  - Shared / canvas → the canvas (or source projector's media) as layers on a
 *    Direct mapping; surfaces that had their own UV region go on a Feed mapping;
 *    extra flat surfaces that followed the primary screen's frame go on a Parallel
 *    mapping in that frame.
 *  - LED wall media → a layer on a Direct mapping for that wall.
 */

type Raw = Record<string, unknown>;

interface LegacyCanvasLayer {
  id?: string;
  name?: string;
  kind?: 'image' | 'video' | 'pattern' | 'solid';
  mediaAssetId?: string | null;
  pattern?: TestPattern | null;
  color?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotationDeg?: number;
  opacity?: number;
  fit?: MediaFitMode;
  visible?: boolean;
}

interface LegacyCanvas {
  enabled?: boolean;
  widthPx?: number;
  heightPx?: number;
  layers?: LegacyCanvasLayer[];
}

export interface LegacyContent {
  sceneObjects: Raw[];
  projectors: Raw[];
  mappingMode?: unknown;
  contentCanvas?: unknown;
  sharedContentSourceProjectorId?: unknown;
}

const PATTERNS: TestPattern[] = ['checkerboard', 'uvGrid', 'colorBars', 'white', 'projectorId', 'black', 'gray'];
const FITS: MediaFitMode[] = ['contain', 'cover', 'stretch'];

function isObject(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fitOf(v: unknown): MediaFitMode {
  return FITS.includes(v as MediaFitMode) ? (v as MediaFitMode) : 'contain';
}

/** Projector media (pattern / image / video) as a MediaRef — media without an asset falls back to the pattern, as before. */
export function legacyProjectorMedia(p: Raw): MediaRef {
  const source = p.mediaSource;
  const asset = typeof p.mediaAssetId === 'string' ? p.mediaAssetId : null;
  if ((source === 'image' || source === 'video') && asset) return { kind: source, assetId: asset };
  const pattern = PATTERNS.includes(p.testPattern as TestPattern) ? (p.testPattern as TestPattern) : 'checkerboard';
  return { kind: 'pattern', pattern, color: typeof p.color === 'string' ? p.color : '#ffffff' };
}

/** Same primary receiver choice as v1–v3 shared mapping: curved, then flat screen, then model. */
export function legacyPrimaryReceiver(objects: SceneObject[]): SceneObject | null {
  return (
    objects.find((o) => o.type === 'curvedScreen' && o.receivesProjection) ??
    objects.find((o) => o.type === 'screen' && o.receivesProjection) ??
    objects.find((o) => o.type === 'model' && o.receivesProjection) ??
    null
  );
}

function canvasLayers(canvas: LegacyCanvas): Omit<Layer, 'id' | 'mappingId'>[] {
  const w = Math.max(1, canvas.widthPx ?? 3840);
  const h = Math.max(1, canvas.heightPx ?? 1080);
  const out: Omit<Layer, 'id' | 'mappingId'>[] = [];
  for (const l of canvas.layers ?? []) {
    if (typeof l !== 'object' || l === null) continue;
    let media: MediaRef;
    const color = typeof l.color === 'string' ? l.color : '#ffffff';
    if (l.kind === 'image' || l.kind === 'video') media = { kind: l.kind, assetId: typeof l.mediaAssetId === 'string' ? l.mediaAssetId : null };
    else if (l.kind === 'solid') media = { kind: 'solid', color };
    else if (l.kind === 'pattern') media = { kind: 'pattern', pattern: PATTERNS.includes(l.pattern as TestPattern) ? (l.pattern as TestPattern) : 'uvGrid', color };
    else continue;
    const { id: _id, mappingId: _m, ...rest } = createLayer(media, null, {
      name: typeof l.name === 'string' ? l.name : undefined,
      opacity: typeof l.opacity === 'number' ? Math.min(1, Math.max(0, l.opacity)) : 1,
      enabled: l.visible !== false,
      fit: fitOf(l.fit),
      rect: {
        x: (l.x ?? 0) / w,
        y: (l.y ?? 0) / h,
        width: Math.max(1, l.width ?? w) / w,
        height: Math.max(1, l.height ?? h) / h,
        rotationDeg: l.rotationDeg ?? 0,
      },
    });
    if (!rest.name) rest.name = media.kind;
    out.push(rest);
  }
  return out;
}

function withMapping(layers: Omit<Layer, 'id' | 'mappingId'>[], mapping: Mapping, suffix: string): Layer[] {
  return layers.map((l) => ({ ...l, id: newId('layer'), mappingId: mapping.id, name: suffix ? `${l.name} (${suffix})` : l.name }));
}

export interface MigratedContent {
  show: Show;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
}

export function stripLegacyProjector(p: Raw): ProjectorConfig {
  const { testPattern: _t, mediaSource: _s, mediaAssetId: _a, mediaFit: _f, ...rest } = p;
  return rest as unknown as ProjectorConfig;
}

export function stripLegacySceneObject(o: Raw): SceneObject {
  const { uvMapping: _uv, ledWall, ...rest } = o;
  const out = rest as unknown as SceneObject;
  if (isObject(ledWall)) {
    const res = isObject(ledWall.pixelResolution) ? ledWall.pixelResolution : {};
    out.ledWall = {
      pixelResolution: {
        width: typeof res.width === 'number' ? res.width : 1920,
        height: typeof res.height === 'number' ? res.height : 1080,
      },
    };
  }
  return out;
}

export function migrateLegacyContent(data: LegacyContent): MigratedContent {
  const rawObjects = data.sceneObjects.filter(isObject);
  const rawProjectors = data.projectors.filter(isObject);
  const sceneObjects = rawObjects.map(stripLegacySceneObject);
  const projectors = rawProjectors.map(stripLegacyProjector);
  const mappings: Mapping[] = [];
  const layers: Layer[] = [];

  // LED walls: their own media on a Direct mapping.
  rawObjects.forEach((raw, i) => {
    const obj = sceneObjects[i];
    if (obj.type !== 'ledWall') return;
    const mapping = createDirectMapping(obj);
    mappings.push(mapping);
    const led = isObject(raw.ledWall) ? raw.ledWall : null;
    const asset = led && typeof led.mediaAssetId === 'string' ? led.mediaAssetId : null;
    if (led && asset) {
      const kind = led.mediaSource === 'video' ? 'video' : 'image';
      layers.push(createLayer({ kind, assetId: asset }, mapping.id, { name: `${obj.name} media`, fit: fitOf(led.mediaFit) }));
    }
  });

  const receivers = sceneObjects.filter((o) => o.receivesProjection && o.type !== 'ledWall');
  const receiverIds = receivers.map((o) => o.id);
  const canvas: LegacyCanvas = isObject(data.contentCanvas) ? (data.contentCanvas as LegacyCanvas) : {};
  const primary = legacyPrimaryReceiver(sceneObjects);
  const shared = primary !== null && (data.mappingMode === 'sharedCanvas' || canvas.enabled === true);

  if (!shared) {
    rawProjectors.forEach((raw, i) => {
      const p = projectors[i];
      const e = quaternionToEulerYXZ(p.transform.quaternion);
      const mapping: Mapping = {
        id: newId('map'),
        name: `${p.name} raster`,
        kind: 'perspective',
        resolution: { w: p.optics.resolution.width, h: p.optics.resolution.height },
        screenIds: [...receiverIds],
        filtering: 'bilinear',
        maskAssetId: null,
        perspective: {
          eye: { ...p.transform.position },
          rotation: { x: e.pitch, y: e.yaw, z: e.roll },
          fovDeg: 40,
          lockToProjectorId: p.id,
          projectorOnly: true,
        },
      };
      mappings.push(mapping);
      layers.push(createLayer(legacyProjectorMedia(raw), mapping.id, { name: `${p.name} content`, fit: fitOf(raw.mediaFit) }));
    });
    return { show: createShow(mappings, layers), sceneObjects, projectors };
  }

  // Shared content: the canvas, else the source projector's media.
  let content: Omit<Layer, 'id' | 'mappingId'>[];
  let resolution: { w: number; h: number };
  if (canvas.enabled === true) {
    content = canvasLayers(canvas);
    resolution = { w: Math.max(1, Math.round(canvas.widthPx ?? 3840)), h: Math.max(1, Math.round(canvas.heightPx ?? 1080)) };
  } else {
    const sourceId = typeof data.sharedContentSourceProjectorId === 'string' ? data.sharedContentSourceProjectorId : null;
    const index = Math.max(0, rawProjectors.findIndex((p) => p.id === sourceId));
    const raw = rawProjectors[index];
    const p = projectors[index];
    const { id: _id, mappingId: _m, ...layer } = createLayer(legacyProjectorMedia(raw), null, {
      name: `${p.name} content`,
      fit: fitOf(raw.mediaFit),
    });
    content = [layer];
    resolution = { w: p.optics.resolution.width, h: p.optics.resolution.height };
  }

  const feedRects: FeedRect[] = [];
  const plain: SceneObject[] = [];
  rawObjects.forEach((raw, i) => {
    const obj = sceneObjects[i];
    if (!obj.receivesProjection || obj.type === 'ledWall') return;
    const uv = isObject(raw.uvMapping) ? raw.uvMapping : null;
    if (uv && uv.enabled === true) {
      const rect = normalizeFeedRect({ ...uv, screenId: obj.id }) ?? defaultFeedRect(obj.id);
      feedRects.push(rect);
    } else {
      plain.push(obj);
    }
  });

  const groups: { mapping: Mapping; label: string }[] = [];
  if (feedRects.length > 0) {
    groups.push({
      label: 'feed',
      mapping: {
        id: newId('map'),
        name: 'Shared canvas (feed)',
        kind: 'feed',
        resolution,
        screenIds: feedRects.map((r) => r.screenId),
        filtering: 'bilinear',
        maskAssetId: null,
        feed: { rects: feedRects },
      },
    });
  }
  if (plain.length > 0) {
    const onlyPrimary = plain.length === 1 && plain[0].id === primary!.id;
    let mapping: Mapping;
    if (primary!.type === 'screen' && !onlyPrimary) {
      // Every surface followed the primary screen's planar frame.
      const e = quaternionToEulerYXZ(primary!.transform.quaternion);
      mapping = {
        id: newId('map'),
        name: `Shared canvas (${primary!.name} frame)`,
        kind: 'parallel',
        resolution,
        screenIds: plain.map((o) => o.id),
        filtering: 'bilinear',
        maskAssetId: null,
        parallel: {
          center: { ...primary!.transform.position },
          rotation: { x: e.pitch, y: e.yaw, z: e.roll },
          size: { w: primary!.dimensions.width, h: primary!.dimensions.height },
        },
      };
    } else {
      mapping = {
        id: newId('map'),
        name: 'Shared canvas',
        kind: 'direct',
        resolution,
        screenIds: plain.map((o) => o.id),
        filtering: 'bilinear',
        maskAssetId: null,
        direct: { fit: 'stretch' },
      };
    }
    groups.unshift({ label: '', mapping });
  }
  for (const { mapping, label } of groups) {
    mappings.push(mapping);
    layers.push(...withMapping(content, mapping, groups.length > 1 ? label || 'surfaces' : ''));
  }
  return { show: createShow(mappings, layers), sceneObjects, projectors };
}
