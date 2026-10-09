import * as THREE from 'three';
import type { CalculationResults, PrevizSettings, ProjectorConfig, SceneObject } from '../../types';
import { luxToNits } from '../../optics/illuminance';
import { screenFrame } from '../../optics/autoPlace';
import { DEFAULT_PROJECTOR_LUMENS, findCatalogLens, findCatalogProjector } from '../../optics/projectorCatalog';

/** v6 phone viewer: the numbers people ask about, per target and per projector. */

export interface TargetSummary {
  name: string;
  width: number;
  height: number;
  /** Share of the target that some projector reaches (0–100). */
  coveredPct: number | null;
  nits: { min: number; avg: number; max: number } | null;
  pxPerM: { min: number; avg: number; max: number } | null;
}

export interface ProjectorSummary {
  id: string;
  name: string;
  color: string;
  enabled: boolean;
  model: string | null;
  lens: string | null;
  lumens: number;
  throwRatio: number;
  /** Throw distance to the target plane (m); null without a target or when behind it. */
  distance: number | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** Share of this projector's light landing on the target (0–100). */
  onTargetPct: number | null;
}

export interface ViewerSummary {
  target: TargetSummary | null;
  projectors: ProjectorSummary[];
}

export function buildViewerSummary(
  projectors: ProjectorConfig[],
  target: SceneObject | undefined,
  results: CalculationResults,
  previz: PrevizSettings,
): ViewerSummary {
  const analysis = results.coverageAnalysis;
  const frame = target ? screenFrame(target) : null;

  let targetSummary: TargetSummary | null = null;
  if (target && frame) {
    const lux = analysis?.illuminance;
    const px = analysis?.pixelDensity;
    targetSummary = {
      name: target.name,
      width: frame.width,
      height: frame.height,
      coveredPct:
        analysis && analysis.receiverArea > 0 ? (analysis.visibleCoveredArea / analysis.receiverArea) * 100 : null,
      nits: lux
        ? {
            min: luxToNits(lux.minLux, previz.screenGain),
            avg: luxToNits(lux.avgLux, previz.screenGain),
            max: luxToNits(lux.maxLux, previz.screenGain),
          }
        : null,
      pxPerM: px ? { min: px.minPxPerM, avg: px.avgPxPerM, max: px.maxPxPerM } : null,
    };
  }

  const summaries = projectors.map((p): ProjectorSummary => {
    const model = findCatalogProjector(p.catalog?.modelId);
    const lens = findCatalogLens(model, p.catalog?.lensId);
    let distance: number | null = null;
    if (frame) {
      const pos = new THREE.Vector3(p.transform.position.x, p.transform.position.y, p.transform.position.z);
      const d = pos.sub(frame.center).dot(frame.normal);
      distance = d > 0.01 ? d : null;
    }
    const imageWidth = distance != null ? distance / p.optics.throwRatio : null;
    const metrics = analysis?.perProjector.find((m) => m.projectorId === p.id);
    const total = metrics?.lumensTotal ?? 0;
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      enabled: p.enabled,
      model: model ? `${model.brand} ${model.model}` : null,
      lens: lens ? lens.name : null,
      lumens: p.lumens ?? DEFAULT_PROJECTOR_LUMENS,
      throwRatio: p.optics.throwRatio,
      distance,
      imageWidth,
      imageHeight: imageWidth != null ? imageWidth / p.optics.aspectRatio : null,
      onTargetPct: total > 0 ? (Math.min(total, metrics?.lumensOnTarget ?? 0) / total) * 100 : null,
    };
  });

  return { target: targetSummary, projectors: summaries };
}
