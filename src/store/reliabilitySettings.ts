import type { SceneObject } from '../types';

export type CalculationReceiverType = 'screen' | 'curvedScreen';

export interface CalculationTargetInfo {
  id: string;
  name: string;
  type: CalculationReceiverType;
}

/** Receivers supported by the current overlap/footprint calculation engine. */
export function listCalculationTargets(sceneObjects: SceneObject[]): SceneObject[] {
  return sceneObjects.filter(
    (obj) =>
      (obj.type === 'screen' || obj.type === 'curvedScreen') && obj.receivesProjection,
  );
}

export function isCalculationTargetId(sceneObjects: SceneObject[], id: string | null): boolean {
  if (!id) return false;
  const obj = sceneObjects.find((o) => o.id === id);
  if (!obj) return false;
  return (obj.type === 'screen' || obj.type === 'curvedScreen') && obj.receivesProjection;
}

/** Legacy auto-target: curved screen before flat screen (matches pre-explicit behavior). */
export function legacyDefaultCalculationTargetId(sceneObjects: SceneObject[]): string | null {
  const curved = sceneObjects.find(
    (obj) => obj.type === 'curvedScreen' && obj.receivesProjection,
  );
  if (curved) return curved.id;
  const screen = sceneObjects.find((obj) => obj.type === 'screen' && obj.receivesProjection);
  return screen?.id ?? null;
}

/**
 * Deterministic fallback when the explicit calculation target is missing or ineligible:
 * flat screen first, then curved screen.
 */
export function fallbackCalculationTargetId(sceneObjects: SceneObject[]): string | null {
  const screen = sceneObjects.find((obj) => obj.type === 'screen' && obj.receivesProjection);
  if (screen) return screen.id;
  const curved = sceneObjects.find(
    (obj) => obj.type === 'curvedScreen' && obj.receivesProjection,
  );
  return curved?.id ?? null;
}

export function resolveCalculationTargetId(
  sceneObjects: SceneObject[],
  explicitId: string | null,
): string | null {
  if (isCalculationTargetId(sceneObjects, explicitId)) return explicitId;
  return fallbackCalculationTargetId(sceneObjects);
}

export function getCalculationTargetInfo(
  sceneObjects: SceneObject[],
  targetId: string | null,
): CalculationTargetInfo | null {
  if (!targetId) return null;
  const obj = sceneObjects.find((o) => o.id === targetId);
  if (!obj || (obj.type !== 'screen' && obj.type !== 'curvedScreen')) return null;
  return { id: obj.id, name: obj.name, type: obj.type };
}

export function getCalculationTargetObject(
  sceneObjects: SceneObject[],
  targetId: string | null,
): SceneObject | undefined {
  if (!targetId) return undefined;
  const obj = sceneObjects.find((o) => o.id === targetId);
  if (!obj || (obj.type !== 'screen' && obj.type !== 'curvedScreen')) return undefined;
  if (!obj.receivesProjection) return undefined;
  return obj;
}

export function reconcileReliabilityIds(state: {
  sceneObjects: SceneObject[];
  calculationTargetId: string | null;
}): { calculationTargetId: string | null } {
  return {
    calculationTargetId: resolveCalculationTargetId(state.sceneObjects, state.calculationTargetId),
  };
}
