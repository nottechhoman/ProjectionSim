import * as THREE from 'three';
import type { CalculationTargetSide, ProjectionSides, SceneObject, SceneObjectType } from '../types';

/** Small offset (m) when sampling front/back faces separately. */
export const SURFACE_SIDE_OFFSET = 1e-4;

const SURFACE_TYPES = new Set<SceneObjectType>(['screen', 'floor', 'curvedScreen', 'ledWall']);

export function supportsProjectionSides(type: SceneObjectType): boolean {
  return SURFACE_TYPES.has(type);
}

export function normalizeProjectionSides(obj: SceneObject): ProjectionSides {
  if (!supportsProjectionSides(obj.type)) return 'front';
  if (!obj.receivesProjection && obj.type !== 'ledWall') return 'front';
  if (obj.projectionSides === 'back' || obj.projectionSides === 'both') return obj.projectionSides;
  return 'front';
}

export function projectionSidesToInt(sides: ProjectionSides): number {
  if (sides === 'back') return 1;
  if (sides === 'both') return 2;
  return 0;
}

export function calculationTargetSideToInt(side: CalculationTargetSide): number {
  if (side === 'back') return 1;
  if (side === 'both') return 2;
  return 0;
}

/** Local-space front normal before world transform (receiving face). */
export function localFrontNormal(type: SceneObjectType): THREE.Vector3 {
  if (type === 'floor') return new THREE.Vector3(0, 1, 0);
  if (type === 'screen') return new THREE.Vector3(0, 0, 1);
  return new THREE.Vector3(1, 0, 0);
}

export function worldFaceNormal(
  type: SceneObjectType,
  worldMatrix: THREE.Matrix4,
  side: 'front' | 'back',
): THREE.Vector3 {
  const normal = localFrontNormal(type).transformDirection(worldMatrix).normalize();
  return side === 'back' ? normal.multiplyScalar(-1) : normal;
}

export function projectorIlluminatesFace(
  projectorPosition: THREE.Vector3,
  samplePosition: THREE.Vector3,
  faceNormal: THREE.Vector3,
): boolean {
  const toProjector = projectorPosition.clone().sub(samplePosition);
  return toProjector.dot(faceNormal) > 1e-6;
}
