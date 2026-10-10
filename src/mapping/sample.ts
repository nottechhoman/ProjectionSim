import * as THREE from 'three';
import type {
  DirectFit,
  FeedRect,
  Layer,
  Mapping,
  MediaFitMode,
  ProjectorConfig,
  RotationDeg,
  TestPattern,
  Vec2,
  Vec3,
} from '../types';
import { getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';
import { eulerYXZToQuaternion } from '../utils/euler';
import { projectSurfaceUv, type SurfaceUvFrame } from '../uvmapping/surfaceUv';
import { mappingResolution } from './model';

/**
 * CPU mirror of the screen-texture bake shader (shaders/bake.frag.glsl).
 *
 * A screen texel is coloured by compositing the live layers (bottom → top). Each
 * layer is sampled through its mapping:
 *   texel (world position + surface UV) → mapping canvas UV → layer rect → fit → media UV.
 * Canvas UV is 0–1 with a bottom-left origin; layer rects are top-left.
 */

export const MAPPING_KIND_INT = {
  direct: 0,
  perspective: 1,
  parallel: 2,
  feed: 3,
  cylindrical: 4,
  spherical: 5,
} as const;

export const DIRECT_FIT_INT: Record<DirectFit, number> = { stretch: 0, fit: 1, crop: 2, pixel: 3 };
export const LAYER_FIT_INT: Record<MediaFitMode, number> = { contain: 0, cover: 1, stretch: 2 };
export const PATTERN_INT: Record<TestPattern, number> = {
  checkerboard: 0,
  uvGrid: 1,
  colorBars: 2,
  white: 3,
  projectorId: 4,
  black: 5,
  gray: 6,
};

export function rotationQuaternion(r: RotationDeg): THREE.Quaternion {
  return new THREE.Quaternion(...eulerYXZToQuaternion(r.y, r.x, r.z));
}

function frameInverse(center: Vec3, rotation: RotationDeg): THREE.Matrix4 {
  return new THREE.Matrix4()
    .compose(new THREE.Vector3(center.x, center.y, center.z), rotationQuaternion(rotation), new THREE.Vector3(1, 1, 1))
    .invert();
}

/**
 * The mapping's world matrix: view-projection for perspective, inverse frame for
 * parallel / cylindrical / spherical, identity otherwise.
 */
export function mappingMatrix(mapping: Mapping, projectors: ProjectorConfig[]): THREE.Matrix4 {
  switch (mapping.kind) {
    case 'perspective': {
      const p = mapping.perspective!;
      const locked = p.lockToProjectorId ? projectors.find((pr) => pr.id === p.lockToProjectorId) : undefined;
      if (locked) return getProjectorViewProjectionMatrix(locked.optics, getProjectorWorldMatrix(locked));
      const res = mappingResolution(mapping, projectors);
      const cam = new THREE.PerspectiveCamera(p.fovDeg, res.w / Math.max(1, res.h), 0.05, 2000);
      cam.position.set(p.eye.x, p.eye.y, p.eye.z);
      cam.quaternion.copy(rotationQuaternion(p.rotation));
      cam.updateMatrixWorld(true);
      return new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    }
    case 'parallel':
      return frameInverse(mapping.parallel!.center, mapping.parallel!.rotation);
    case 'cylindrical':
      return frameInverse(mapping.cylindrical!.center, mapping.cylindrical!.rotation);
    case 'spherical':
      return frameInverse(mapping.spherical!.center, mapping.spherical!.rotation);
    default:
      return new THREE.Matrix4();
  }
}

export interface TexelContext {
  world: Vec3;
  /** Mesh UV of the texel (the screen texture layout). */
  surfaceUv: Vec2;
  screenId: string;
  /** Physical width / height of the screen texture layout. */
  screenAspect: number;
  /** Screen texture size in pixels (used by Direct "pixel"). */
  screenTexSize: { w: number; h: number };
  /** Feed projections other than mesh UV: object-local point and fitted frame. */
  local?: Vec3;
  frame?: SurfaceUvFrame;
}

function fitUv(uv: Vec2, fit: DirectFit, canvasAspect: number, screenAspect: number, ctx: TexelContext, res: { w: number; h: number }): Vec2 | null {
  if (fit === 'stretch') return uv;
  if (fit === 'pixel') {
    return {
      x: (uv.x - 0.5) * (ctx.screenTexSize.w / res.w) + 0.5,
      y: (uv.y - 0.5) * (ctx.screenTexSize.h / res.h) + 0.5,
    };
  }
  // fit (contain): canvas letterboxed inside the screen; crop (cover): canvas fills it.
  let sx = 1;
  let sy = 1;
  const wider = canvasAspect > screenAspect;
  if (fit === 'fit') {
    if (wider) sy = screenAspect / canvasAspect;
    else sx = canvasAspect / screenAspect;
  } else if (wider) sx = canvasAspect / screenAspect;
  else sy = screenAspect / canvasAspect;
  return { x: (uv.x - 0.5) / sx + 0.5, y: (uv.y - 0.5) / sy + 0.5 };
}

function wrapScalar(x: number, mode: FeedRect['wrap']): number | null {
  if (mode === 'repeat') return x - Math.floor(x);
  if (mode === 'mirror') {
    const m = x - 2 * Math.floor(x / 2);
    return m > 1 ? 2 - m : m;
  }
  return x < -1e-4 || x > 1.0001 ? null : Math.min(1, Math.max(0, x));
}

export function feedRectUv(rect: FeedRect, s: Vec2): Vec2 | null {
  let u = rect.flipU ? 1 - s.x : s.x;
  let v = rect.flipV ? 1 - s.y : s.y;
  const a = (rect.rotationDeg * Math.PI) / 180;
  if (a !== 0) {
    const cx = u - 0.5;
    const cy = v - 0.5;
    u = Math.cos(a) * cx - Math.sin(a) * cy + 0.5;
    v = Math.sin(a) * cx + Math.cos(a) * cy + 0.5;
  }
  const wu = wrapScalar(u * rect.repeatU, rect.wrap);
  const wv = wrapScalar(v * rect.repeatV, rect.wrap);
  if (wu === null || wv === null) return null;
  const r = rect.region;
  return { x: r.x + wu * r.width, y: 1 - r.y - r.height + wv * r.height };
}

function wrapPi(a: number): number {
  return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
}

/** Texel → mapping canvas UV (bottom-left origin), or null when the mapping misses it. */
export function mappingCanvasUv(
  mapping: Mapping,
  ctx: TexelContext,
  projectors: ProjectorConfig[],
  matrix: THREE.Matrix4 = mappingMatrix(mapping, projectors),
): Vec2 | null {
  if (!mapping.screenIds.includes(ctx.screenId)) return null;
  const res = mappingResolution(mapping, projectors);
  const inside = (uv: Vec2 | null) =>
    uv && uv.x >= 0 && uv.x <= 1 && uv.y >= 0 && uv.y <= 1 ? uv : null;
  const world = new THREE.Vector3(ctx.world.x, ctx.world.y, ctx.world.z);
  switch (mapping.kind) {
    case 'direct':
      return inside(fitUv(ctx.surfaceUv, mapping.direct?.fit ?? 'stretch', res.w / res.h, ctx.screenAspect, ctx, res));
    case 'perspective': {
      const clip = new THREE.Vector4(world.x, world.y, world.z, 1).applyMatrix4(matrix);
      if (clip.w <= 1e-6) return null;
      const ndc = { x: clip.x / clip.w, y: clip.y / clip.w };
      return inside({ x: ndc.x * 0.5 + 0.5, y: ndc.y * 0.5 + 0.5 });
    }
    case 'parallel': {
      const l = world.applyMatrix4(matrix);
      const size = mapping.parallel!.size;
      return inside({ x: l.x / size.w + 0.5, y: l.y / size.h + 0.5 });
    }
    case 'cylindrical': {
      const l = world.applyMatrix4(matrix);
      const c = mapping.cylindrical!;
      const arc = (c.arcDeg * Math.PI) / 180;
      const t = wrapPi(Math.atan2(l.x, l.z));
      return inside({ x: 0.5 - t / arc, y: l.y / c.height + 0.5 });
    }
    case 'spherical': {
      const l = world.applyMatrix4(matrix);
      const s = mapping.spherical!;
      const arc = (s.arcDeg * Math.PI) / 180;
      const elev = (s.elevationDeg * Math.PI) / 180;
      const t = wrapPi(Math.atan2(l.x, l.z));
      const f = Math.atan2(l.y, Math.max(Math.hypot(l.x, l.z), 1e-6));
      return inside({ x: 0.5 - t / arc, y: f / elev + 0.5 });
    }
    case 'feed': {
      const rect = mapping.feed?.rects.find((r) => r.screenId === ctx.screenId);
      if (!rect) return null;
      const s =
        rect.projection === 'meshUv' || !ctx.local || !ctx.frame
          ? ctx.surfaceUv
          : projectSurfaceUv(ctx.local, rect.projection, ctx.frame, ctx.surfaceUv);
      return feedRectUv(rect, s);
    }
  }
}

/**
 * Canvas UV (bottom-left) → layer media UV (bottom-left), or null outside the
 * layer rect / letterbox. canvasRes is in pixels; mediaAspect = width / height.
 */
export function layerMediaUv(
  layer: Pick<Layer, 'rect' | 'fit'>,
  canvasUv: Vec2,
  canvasRes: { w: number; h: number },
  mediaAspect: number,
): Vec2 | null {
  const r = layer.rect;
  // Work in canvas pixels (top-left) so rotation is not skewed by the aspect.
  let px = canvasUv.x * canvasRes.w;
  let py = (1 - canvasUv.y) * canvasRes.h;
  const rw = r.width * canvasRes.w;
  const rh = r.height * canvasRes.h;
  const cx = r.x * canvasRes.w + rw / 2;
  const cy = r.y * canvasRes.h + rh / 2;
  if (r.rotationDeg !== 0) {
    const a = (-r.rotationDeg * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    px = cx + Math.cos(a) * dx - Math.sin(a) * dy;
    py = cy + Math.sin(a) * dx + Math.cos(a) * dy;
  }
  let lx = (px - (cx - rw / 2)) / rw;
  let ly = (py - (cy - rh / 2)) / rh;
  if (lx < 0 || lx > 1 || ly < 0 || ly > 1) return null;
  if (layer.fit !== 'stretch' && mediaAspect > 0) {
    const rectAspect = rw / rh;
    let sx = 1;
    let sy = 1;
    if (layer.fit === 'contain') {
      if (mediaAspect > rectAspect) sy = rectAspect / mediaAspect;
      else sx = mediaAspect / rectAspect;
    } else if (mediaAspect > rectAspect) sx = mediaAspect / rectAspect;
    else sy = rectAspect / mediaAspect;
    lx = (lx - 0.5) / sx + 0.5;
    ly = (ly - 0.5) / sy + 0.5;
    if (lx < 0 || lx > 1 || ly < 0 || ly > 1) return null;
  }
  return { x: lx, y: 1 - ly };
}

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/**
 * Mirror of patternColor() in the shaders. Pattern levels are signal (display)
 * values, e.g. Gray 50 % is code 128, so they are returned decoded to linear like
 * images; the tint is a decoded hex colour already.
 */
export function patternColor(pattern: TestPattern, uv: Vec2, tint: Rgb): Rgb {
  if (pattern === 'projectorId') return [...tint];
  return patternSignal(pattern, uv).map(srgbToLinear) as Rgb;
}

function patternSignal(pattern: Exclude<TestPattern, 'projectorId'>, uv: Vec2): Rgb {
  switch (pattern) {
    case 'checkerboard': {
      const c = Math.floor(uv.x * 16) + Math.floor(uv.y * 16);
      return c % 2 === 0 ? [0.1, 0.1, 0.1] : [0.9, 0.9, 0.9];
    }
    case 'uvGrid':
      return [uv.x, uv.y, 0];
    case 'colorBars':
      return [uv.x, uv.y, 0.5];
    case 'white':
      return [1, 1, 1];
    case 'black':
      return [0, 0, 0];
    case 'gray':
      return [0.5, 0.5, 0.5];
  }
}

export const LAYER_BLEND_INT: Record<Layer['blendMode'], number> = {
  normal: 0,
  add: 1,
  multiply: 2,
  screen: 3,
  overlay: 4,
  softLight: 5,
  lighten: 6,
  darken: 7,
  difference: 8,
};

export function linearToSrgb(c: number): number {
  const x = Math.max(0, c);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export function srgbToLinear(c: number): number {
  const x = Math.max(0, c);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

/** Mirror of blendChannel() in bake.frag.glsl: d (below) and s (layer) are sRGB-encoded 0–1. */
export function blendChannel(d: number, s: number, mode: Layer['blendMode']): number {
  switch (mode) {
    case 'screen':
      return 1 - (1 - d) * (1 - s);
    case 'overlay':
      return d <= 0.5 ? 2 * d * s : 1 - 2 * (1 - d) * (1 - s);
    case 'softLight': {
      if (s <= 0.5) return d - (1 - 2 * s) * d * (1 - d);
      const g = d <= 0.25 ? ((16 * d - 12) * d + 4) * d : Math.sqrt(d);
      return d + (2 * s - 1) * (g - d);
    }
    case 'lighten':
      return Math.max(d, s);
    case 'darken':
      return Math.min(d, s);
    case 'difference':
      return Math.abs(d - s);
    default:
      return s;
  }
}

/** Apply one layer colour (linear) with opacity and blend mode over dst (linear). */
export function blendOver(dst: Rgb, src: Rgb, alpha: number, mode: Layer['blendMode']): Rgb {
  if (mode === 'add') return dst.map((d, i) => d + src[i] * alpha) as Rgb;
  if (mode === 'multiply') return dst.map((d, i) => d * (1 - alpha + src[i] * alpha)) as Rgb;
  if (mode === 'normal') return dst.map((d, i) => d * (1 - alpha) + src[i] * alpha) as Rgb;
  // Read-below modes: the target is 8-bit, so dst is clamped to 0–1 like the GPU sees it.
  return dst.map((d, i) => {
    const below = Math.min(1, Math.max(0, d));
    const mixed = srgbToLinear(blendChannel(linearToSrgb(below), linearToSrgb(Math.min(1, src[i])), mode));
    return below * (1 - alpha) + mixed * alpha;
  }) as Rgb;
}

export interface LiveLayerLike {
  layer: Layer;
  opacity: number;
  /** Animated placement (defaults to the layer's rect). */
  rect?: Layer['rect'];
}

/**
 * Composite pattern / solid layers at one texel (media layers are skipped — they
 * need a decoded image). projectorIndex filters projector-only mappings like the
 * per-projector bake does; null = the shared texture.
 */
export function compositeTexel(
  live: LiveLayerLike[],
  mappings: Mapping[],
  projectors: ProjectorConfig[],
  ctx: TexelContext,
  forProjectorId: string | null,
): Rgb {
  let color: Rgb = [0, 0, 0];
  for (const { layer, opacity, rect } of live) {
    const mapping = mappings.find((m) => m.id === layer.mappingId);
    if (!mapping || opacity <= 0) continue;
    if (!mappingVisibleTo(mapping, forProjectorId)) continue;
    const uv = mappingCanvasUv(mapping, ctx, projectors);
    if (!uv) continue;
    const media = layer.media;
    if (media.kind !== 'pattern' && media.kind !== 'solid') continue;
    const res = mappingResolution(mapping, projectors);
    const c = mapping.filtering === 'nearest' ? snapToCanvasPixel(uv, res) : uv;
    const mUv = layerMediaUv({ rect: rect ?? layer.rect, fit: 'stretch' }, c, res, 0);
    if (!mUv) continue;
    const src = media.kind === 'solid' ? hexToRgb(media.color) : patternColor(media.pattern, mUv, hexToRgb(media.color));
    color = blendOver(color, src, opacity, layer.blendMode);
  }
  return color;
}

/** Projector-only mappings are composited only into their projector's textures. */
export function mappingVisibleTo(mapping: Mapping, forProjectorId: string | null): boolean {
  const p = mapping.kind === 'perspective' ? mapping.perspective : undefined;
  if (!p?.projectorOnly || !p.lockToProjectorId) return true;
  return p.lockToProjectorId === forProjectorId;
}

/** Nearest filtering: the centre of the mapping-canvas pixel containing uv. */
export function snapToCanvasPixel(uv: Vec2, res: { w: number; h: number }): Vec2 {
  return { x: (Math.floor(uv.x * res.w) + 0.5) / res.w, y: (Math.floor(uv.y * res.h) + 0.5) / res.h };
}
