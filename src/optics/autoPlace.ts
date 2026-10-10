import * as THREE from 'three';
import type { ProjectorConfig, SceneObject, Vec3 } from '../types';
import type { CatalogLens } from './projectorCatalog';

/**
 * v6 previz: place a projector so its image covers a screen.
 *
 * The projector faces the screen square-on (no keystone). Its distance comes from the
 * throw ratio and the image width needed to cover the screen. With `keepHeight`, it
 * stays at its current height and vertical lens shift moves the image onto the screen
 * instead, as far as the lens allows.
 */

export interface ScreenFrame {
  /** Centre of the projected area. */
  center: THREE.Vector3;
  /** Unit normal pointing from the screen toward the audience / projector. */
  normal: THREE.Vector3;
  /** Unit "up" along the screen. */
  up: THREE.Vector3;
  width: number;
  height: number;
  /** Quaternion a projector needs to face the screen square-on (its -Z along -normal). */
  facing: THREE.Quaternion;
}

/** Flat screens face local +Z. Curved screens are lit from the inside, so use the chord. */
export function screenFrame(target: SceneObject): ScreenFrame | null {
  const q = new THREE.Quaternion(...target.transform.quaternion);
  const pos = new THREE.Vector3(target.transform.position.x, target.transform.position.y, target.transform.position.z);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  if (target.type === 'curvedScreen') {
    const c = target.curved ?? { radius: 4, arcAngleDeg: 90, height: 3.375 };
    const half = THREE.MathUtils.degToRad(c.arcAngleDeg) / 2;
    const chord = 2 * c.radius * Math.sin(half);
    const center = new THREE.Vector3(0, 0, c.radius * Math.cos(half)).applyQuaternion(q).add(pos);
    const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const facing = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    return { center, normal, up, width: chord, height: c.height, facing };
  }
  if (target.type !== 'screen' && target.type !== 'wall' && target.type !== 'ledWall') return null;
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  return { center: pos, normal, up, width: target.dimensions.width, height: target.dimensions.height, facing: q };
}

export interface PlacementOptions {
  /** Zoom range to stay inside; defaults to the projector's own throw range or its current throw. */
  lens?: Pick<CatalogLens, 'throwMin' | 'throwMax' | 'shiftV'> | null;
  /** Keep the projector at its current world height and use vertical lens shift. */
  keepHeight?: boolean;
}

export interface Placement {
  position: Vec3;
  quaternion: [number, number, number, number];
  throwRatio: number;
  lensShiftH: number;
  lensShiftV: number;
  /** Throw distance to the screen plane (m). */
  distance: number;
  /** Projected image size (m). */
  imageWidth: number;
  imageHeight: number;
  /** keepHeight wanted more shift than the lens has; the projector was moved to fit. */
  shiftLimited: boolean;
}

export function placeToFill(projector: ProjectorConfig, target: SceneObject, opts: PlacementOptions = {}): Placement | null {
  const frame = screenFrame(target);
  if (!frame || frame.width <= 0 || frame.height <= 0) return null;
  const optics = projector.optics;
  const aspect = optics.aspectRatio > 0 ? optics.aspectRatio : optics.resolution.width / optics.resolution.height;

  const tMin = opts.lens?.throwMin ?? optics.throwRatioMin ?? optics.throwRatio;
  const tMax = opts.lens?.throwMax ?? optics.throwRatioMax ?? optics.throwRatio;
  const throwRatio = Math.min(Math.max(optics.throwRatio, Math.min(tMin, tMax)), Math.max(tMin, tMax));

  // Cover the whole screen: fit width, or height when the screen is taller than the image.
  const imageWidth = Math.max(frame.width, frame.height * aspect);
  const imageHeight = imageWidth / aspect;
  const distance = throwRatio * imageWidth;

  let offsetUp = 0;
  let shiftLimited = false;
  if (opts.keepHeight && Math.abs(frame.up.y) > 0.2) {
    // Solve centre.y + offsetUp·up.y + distance·normal.y = current y.
    const wanted = (projector.transform.position.y - frame.center.y - distance * frame.normal.y) / frame.up.y;
    // The image moves opposite to the projector: projector below centre → shift up.
    const range = opts.lens ? opts.lens.shiftV : null;
    let shift = -wanted / imageHeight;
    if (range) {
      const clamped = Math.min(range[1], Math.max(range[0], shift));
      shiftLimited = Math.abs(clamped - shift) > 1e-6;
      shift = clamped;
    }
    offsetUp = -shift * imageHeight;
  }

  const position = frame.center
    .clone()
    .addScaledVector(frame.normal, distance)
    .addScaledVector(frame.up, offsetUp);
  const lensShiftV = imageHeight > 0 ? -offsetUp / imageHeight : 0;

  return {
    position: { x: position.x, y: position.y, z: position.z },
    quaternion: [frame.facing.x, frame.facing.y, frame.facing.z, frame.facing.w],
    throwRatio,
    lensShiftH: 0,
    lensShiftV: Math.abs(lensShiftV) < 1e-9 ? 0 : lensShiftV,
    distance,
    imageWidth,
    imageHeight,
    shiftLimited,
  };
}

/** Throw ratio the projector needs at its current distance to cover the screen. */
export function throwForCurrentDistance(projector: ProjectorConfig, target: SceneObject): number | null {
  const frame = screenFrame(target);
  if (!frame) return null;
  const p = new THREE.Vector3(projector.transform.position.x, projector.transform.position.y, projector.transform.position.z);
  const distance = p.sub(frame.center).dot(frame.normal);
  if (distance <= 0.05) return null;
  const aspect = projector.optics.aspectRatio > 0 ? projector.optics.aspectRatio : 16 / 9;
  const imageWidth = Math.max(frame.width, frame.height * aspect);
  return distance / imageWidth;
}
