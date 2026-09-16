import type { DeviceProfile } from '../ui/deviceProfile';
import type {
  ContentCanvas,
  ContentCanvasLayer,
  ContentLayerKind,
  MediaFitMode,
  TestPattern,
} from '../types';

export const DEFAULT_CONTENT_CANVAS: ContentCanvas = {
  enabled: false,
  widthPx: 3840,
  heightPx: 1080,
  layers: [],
};

export const CONTENT_CANVAS_MAX_DIM: Record<DeviceProfile, number> = {
  phone: 2048,
  tablet: 3072,
  desktop: 4096,
};

export interface CanvasUv {
  u: number;
  v: number;
}

export interface CanvasPixel {
  x: number;
  y: number;
}

export interface ClampedCanvasSize {
  widthPx: number;
  heightPx: number;
  clamped: boolean;
  maxDimension: number;
}

export interface LayerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Authoring pixels are top-left origin; surface UV is bottom-left. */
export function canvasPixelToSurfaceUv(
  x: number,
  y: number,
  widthPx: number,
  heightPx: number,
): CanvasUv {
  return {
    u: widthPx === 0 ? 0 : x / widthPx,
    v: heightPx === 0 ? 0 : 1 - y / heightPx,
  };
}

export function surfaceUvToCanvasPixel(
  u: number,
  v: number,
  widthPx: number,
  heightPx: number,
): CanvasPixel {
  return {
    x: u * widthPx,
    y: (1 - v) * heightPx,
  };
}

export function contentCanvasMaxDimension(profile: DeviceProfile): number {
  return CONTENT_CANVAS_MAX_DIM[profile];
}

export function clampContentCanvasSize(
  widthPx: number,
  heightPx: number,
  profile: DeviceProfile,
  maxTextureSize: number,
): ClampedCanvasSize {
  const requestedW = Math.max(1, Math.round(widthPx));
  const requestedH = Math.max(1, Math.round(heightPx));
  const maxDimension = Math.max(1, Math.min(contentCanvasMaxDimension(profile), maxTextureSize));
  const longest = Math.max(requestedW, requestedH);
  if (longest <= maxDimension) {
    return { widthPx: requestedW, heightPx: requestedH, clamped: false, maxDimension };
  }
  const scale = maxDimension / longest;
  return {
    widthPx: Math.max(1, Math.round(requestedW * scale)),
    heightPx: Math.max(1, Math.round(requestedH * scale)),
    clamped: true,
    maxDimension,
  };
}

export function fittedLayerRect(layer: LayerRect & { fit: MediaFitMode }, mediaAspect: number): LayerRect {
  if (layer.fit === 'stretch' || mediaAspect <= 0) {
    return { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
  }
  const layerAspect = layer.width / layer.height;
  if (layer.fit === 'contain') {
    if (mediaAspect > layerAspect) {
      const height = layer.width / mediaAspect;
      return {
        x: layer.x,
        y: layer.y + (layer.height - height) / 2,
        width: layer.width,
        height,
      };
    }
    const width = layer.height * mediaAspect;
    return {
      x: layer.x + (layer.width - width) / 2,
      y: layer.y,
      width,
      height: layer.height,
    };
  }
  if (mediaAspect > layerAspect) {
    const width = layer.height * mediaAspect;
    return {
      x: layer.x + (layer.width - width) / 2,
      y: layer.y,
      width,
      height: layer.height,
    };
  }
  const height = layer.width / mediaAspect;
  return {
    x: layer.x,
    y: layer.y + (layer.height - height) / 2,
    width: layer.width,
    height,
  };
}

export function createContentLayer(
  kind: ContentLayerKind,
  canvas: Pick<ContentCanvas, 'widthPx' | 'heightPx'>,
  patch: Partial<ContentCanvasLayer> = {},
): ContentCanvasLayer {
  const names: Record<ContentLayerKind, string> = {
    image: 'Image',
    video: 'Video',
    pattern: 'Pattern',
    solid: 'Solid',
  };
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: names[kind],
    kind,
    mediaAssetId: null,
    pattern: kind === 'pattern' ? 'uvGrid' : null,
    color: '#ffffff',
    x: 0,
    y: 0,
    width: canvas.widthPx,
    height: canvas.heightPx,
    rotationDeg: 0,
    opacity: 1,
    fit: 'contain',
    visible: true,
    ...patch,
  };
}

export function normalizeContentCanvas(raw: unknown): ContentCanvas {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_CONTENT_CANVAS);
  const data = raw as Record<string, unknown>;
  const widthPx =
    typeof data.widthPx === 'number' && Number.isFinite(data.widthPx) && data.widthPx > 0
      ? Math.round(data.widthPx)
      : DEFAULT_CONTENT_CANVAS.widthPx;
  const heightPx =
    typeof data.heightPx === 'number' && Number.isFinite(data.heightPx) && data.heightPx > 0
      ? Math.round(data.heightPx)
      : DEFAULT_CONTENT_CANVAS.heightPx;
  const layers = Array.isArray(data.layers)
    ? data.layers.map((layer, index) => normalizeLayer(layer, index, widthPx, heightPx)).filter((l): l is ContentCanvasLayer => l !== null)
    : [];
  return {
    enabled: data.enabled === true,
    widthPx,
    heightPx,
    layers,
  };
}

const LAYER_KINDS: ContentLayerKind[] = ['image', 'video', 'pattern', 'solid'];
const FITS: MediaFitMode[] = ['contain', 'cover', 'stretch'];
const PATTERNS: TestPattern[] = ['checkerboard', 'uvGrid', 'colorBars', 'white', 'projectorId'];

function normalizeLayer(
  raw: unknown,
  index: number,
  canvasW: number,
  canvasH: number,
): ContentCanvasLayer | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  const kind = LAYER_KINDS.includes(data.kind as ContentLayerKind)
    ? (data.kind as ContentLayerKind)
    : null;
  if (!kind) return null;
  const fit = FITS.includes(data.fit as MediaFitMode) ? (data.fit as MediaFitMode) : 'contain';
  const pattern =
    kind === 'pattern' && PATTERNS.includes(data.pattern as TestPattern)
      ? (data.pattern as TestPattern)
      : kind === 'pattern'
        ? 'uvGrid'
        : null;
  const num = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return {
    id: typeof data.id === 'string' ? data.id : `layer-${index}`,
    name: typeof data.name === 'string' ? data.name : `Layer ${index + 1}`,
    kind,
    mediaAssetId: typeof data.mediaAssetId === 'string' ? data.mediaAssetId : null,
    pattern,
    color: typeof data.color === 'string' ? data.color : '#ffffff',
    x: num(data.x, 0),
    y: num(data.y, 0),
    width: Math.max(1, num(data.width, canvasW)),
    height: Math.max(1, num(data.height, canvasH)),
    rotationDeg: num(data.rotationDeg, 0),
    opacity: Math.min(1, Math.max(0, num(data.opacity, 1))),
    fit,
    visible: data.visible !== false,
  };
}
