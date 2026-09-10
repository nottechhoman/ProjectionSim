import type { ProjectorConfig, Vec3 } from '../types';

const DEFAULT_TARGET: Vec3 = { x: 0, y: 1.5, z: 0 };

/** Reference throw distance for normalizing inverse-square falloff (meters). */
export function falloffReferenceDistance(projector: ProjectorConfig): number {
  const pos = projector.transform.position;
  const target = projector.lookAtEnabled && projector.lookAtTarget
    ? projector.lookAtTarget
    : DEFAULT_TARGET;
  return Math.max(
    Math.hypot(pos.x - target.x, pos.y - target.y, pos.z - target.z),
    0.5,
  );
}

/** Relative illuminance ~ (refDist / dist)^2, clamped to [0, 1]. */
export function falloffIntensity(distM: number, refDistM: number): number {
  const ratio = refDistM / Math.max(distM, 0.05);
  return Math.min(ratio * ratio, 1);
}
