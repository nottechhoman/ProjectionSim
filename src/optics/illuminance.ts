import * as THREE from 'three';
import type { PrevizSettings, ProjectorConfig } from '../types';
import { DEFAULT_PROJECTOR_LUMENS } from './projectorCatalog';
import { getProjectorWorldMatrix } from './projectorWorldMatrix';

/**
 * v5 previz: absolute illuminance from a projector.
 *
 * A projector spreads its light evenly over its image. At 1 m along the axis the
 * image is (1/T) × (1/(T·A)) m, so flux per m² there is Φ / A1 with
 * A1 = 1 / (T² · A). A patch of that plane at off-axis angle α subtends
 * cos³α more solid angle per m², so luminous intensity in that direction is
 * I = (Φ / A1) / cos³α (cd). A surface at distance r, tilted by θ to the ray,
 * then receives E = I · cosθ / r² (lux).
 *
 * Mirrored in the viewport shader (multiProjection.frag.glsl, previewKind 3).
 */

/** Image area (m²) at 1 m throw distance. */
export function unitImageArea(throwRatio: number, aspectRatio: number): number {
  return 1 / (throwRatio * throwRatio * aspectRatio);
}

export function projectorLumens(projector: ProjectorConfig): number {
  const lm = projector.lumens ?? DEFAULT_PROJECTOR_LUMENS;
  return Math.max(0, lm) * Math.max(0, projector.brightness);
}

/**
 * Illuminance (lux) at `point` with surface normal `normal`, from a projector at
 * `origin` looking along `forward` (unit). Does not test the frustum or occlusion.
 */
export function illuminanceAt(
  lumens: number,
  a1: number,
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  point: THREE.Vector3,
  normal: THREE.Vector3,
): number {
  const ray = new THREE.Vector3().subVectors(point, origin);
  const r2 = ray.lengthSq();
  if (r2 < 1e-8) return 0;
  ray.normalize();
  const cosA = ray.dot(forward);
  if (cosA <= 1e-4) return 0;
  const cosT = Math.abs(ray.dot(normal));
  const intensity = lumens / a1 / (cosA * cosA * cosA);
  return (intensity * cosT) / r2;
}

/**
 * Projected pixel density (pixels per metre along the surface) at `point`.
 *
 * One pixel covers (1 / (T · resW))² m² at 1 m on axis. Off axis by α its solid
 * angle shrinks by cos³α, and a surface tilted by θ to the ray stretches it by
 * 1 / cosθ, so the pixel's area on the surface is cos³α · r² / (T² · resW² · cosθ).
 * Density is one over the square root of that. On axis and square-on this is the
 * familiar resW / image width. Mirrored in the viewport shader (previewKind 4).
 */
export function pixelDensityAt(
  pixelsPerUnitAt1m: number,
  origin: THREE.Vector3,
  forward: THREE.Vector3,
  point: THREE.Vector3,
  normal: THREE.Vector3,
): number {
  const ray = new THREE.Vector3().subVectors(point, origin);
  const r = ray.length();
  if (r < 1e-4) return 0;
  ray.divideScalar(r);
  const cosA = ray.dot(forward);
  if (cosA <= 1e-4) return 0;
  const cosT = Math.abs(ray.dot(normal));
  return (pixelsPerUnitAt1m * Math.sqrt(cosT / (cosA * cosA * cosA))) / r;
}

/** Pixels across 1 m of image at 1 m throw distance: throw ratio × horizontal resolution. */
export function pixelsPerMetreAt1m(projector: ProjectorConfig): number {
  return projector.optics.throwRatio * projector.optics.resolution.width;
}

/** Luminance (cd/m², "nits") of a Lambertian screen with `gain` under `lux`. */
export function luxToNits(lux: number, gain: number): number {
  return (lux * gain) / Math.PI;
}

/** Foot-lamberts (cinema unit) from nits. */
export function nitsToFootLamberts(nits: number): number {
  return nits / 3.426;
}

export interface ProjectorLightModel {
  lumens: number;
  /** Throw ratio × horizontal resolution (pixels per metre of image at 1 m). */
  pixelsAt1m: number;
  a1: number;
  origin: THREE.Vector3;
  forward: THREE.Vector3;
}

export function projectorLightModel(projector: ProjectorConfig): ProjectorLightModel {
  const world = getProjectorWorldMatrix(projector);
  const origin = new THREE.Vector3().setFromMatrixPosition(world);
  const forward = new THREE.Vector3(0, 0, -1).transformDirection(world).normalize();
  return {
    lumens: projectorLumens(projector),
    pixelsAt1m: pixelsPerMetreAt1m(projector),
    a1: unitImageArea(projector.optics.throwRatio, projector.optics.aspectRatio),
    origin,
    forward,
  };
}

export const DEFAULT_PREVIZ_SETTINGS: PrevizSettings = {
  unit: 'nits',
  scaleMax: 500,
  screenGain: 1,
  spillEverywhere: true,
  densityScaleMax: 1000,
};

export function normalizePrevizSettings(raw: Partial<PrevizSettings> | undefined): PrevizSettings {
  const unit = raw?.unit === 'lux' ? 'lux' : raw?.unit === 'nits' ? 'nits' : DEFAULT_PREVIZ_SETTINGS.unit;
  const scaleMax =
    typeof raw?.scaleMax === 'number' && Number.isFinite(raw.scaleMax) && raw.scaleMax > 0
      ? raw.scaleMax
      : DEFAULT_PREVIZ_SETTINGS.scaleMax;
  const screenGain =
    typeof raw?.screenGain === 'number' && Number.isFinite(raw.screenGain) && raw.screenGain > 0
      ? Math.min(10, raw.screenGain)
      : DEFAULT_PREVIZ_SETTINGS.screenGain;
  const spillEverywhere =
    typeof raw?.spillEverywhere === 'boolean' ? raw.spillEverywhere : DEFAULT_PREVIZ_SETTINGS.spillEverywhere;
  const densityScaleMax =
    typeof raw?.densityScaleMax === 'number' && Number.isFinite(raw.densityScaleMax) && raw.densityScaleMax > 0
      ? raw.densityScaleMax
      : DEFAULT_PREVIZ_SETTINGS.densityScaleMax;
  return { unit, scaleMax, screenGain, spillEverywhere, densityScaleMax };
}
