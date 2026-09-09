import * as THREE from 'three';
import type {
  AnalysisQuality,
  CalculationTargetSide,
  ProjectorConfig,
  SampledCoverageAnalysis,
  SampledCoverageSideMetrics,
  SceneObject,
} from '../types';
import { getProjectorViewProjectionMatrix } from '../optics/projectionMatrix';
import { validateOptics } from '../optics/validate';
import {
  projectorIlluminatesFace,
  SURFACE_SIDE_OFFSET,
  worldFaceNormal,
} from '../projection/projectionSides';
import {
  buildWorldMatrixFromTransform,
  isOccludedAlongSegment,
  listBlockerDescriptors,
  type BlockerDescriptor,
} from './occlusion';

export const ANALYSIS_QUALITY_PRESETS: Record<
  AnalysisQuality,
  { planarU: number; planarV: number; curvedU: number; curvedV: number }
> = {
  draft: { planarU: 32, planarV: 18, curvedU: 32, curvedV: 18 },
  high: { planarU: 64, planarV: 36, curvedU: 64, curvedV: 36 },
};

const FRUSTUM_EPSILON = 1e-4;

export interface CoverageAnalysisInput {
  receiver: SceneObject;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  quality: AnalysisQuality;
  targetSide: CalculationTargetSide;
}

interface SurfaceSample {
  position: THREE.Vector3;
  faceNormal: THREE.Vector3;
  area: number;
}

interface SideAggregate {
  receiverArea: number;
  geometricCoveredArea: number;
  visibleCoveredArea: number;
  uncoveredArea: number;
  visibleOverlapArea: number;
  occlusionLossArea: number;
  perProjector: Map<string, { geometric: number; visible: number; blocked: number }>;
}

function isEligibleProjector(projector: ProjectorConfig): boolean {
  return projector.enabled && validateOptics(projector.optics).valid;
}

function quaternionIsUnit(quaternion: [number, number, number, number]): boolean {
  const [x, y, z, w] = quaternion;
  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  return Math.abs(len - 1) < 1e-3;
}

function assertSupportedTransform(obj: SceneObject): string | null {
  if (!quaternionIsUnit(obj.transform.quaternion)) {
    return `Object "${obj.name}" has a non-unit quaternion; only rigid transforms are supported.`;
  }
  return null;
}

function buildPlanarSamples(
  receiver: SceneObject,
  nu: number,
  nv: number,
  side: 'front' | 'back',
): { samples: SurfaceSample[]; error: string | null } {
  const transformError = assertSupportedTransform(receiver);
  if (transformError) return { samples: [], error: transformError };

  const worldMatrix = buildWorldMatrixFromTransform(receiver.transform);
  const origin = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
  const right = new THREE.Vector3(1, 0, 0).transformDirection(worldMatrix);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(worldMatrix);
  const faceNormal = worldFaceNormal(receiver.type, worldMatrix, side);
  const offset = side === 'front' ? SURFACE_SIDE_OFFSET : -SURFACE_SIDE_OFFSET;

  const width = receiver.dimensions.width;
  const height = receiver.dimensions.height;
  const du = width / nu;
  const dv = height / nv;
  const sampleArea = du * dv;

  const samples: SurfaceSample[] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const u = (i + 0.5) / nu;
      const v = (j + 0.5) / nv;
      const lx = (u - 0.5) * width;
      const ly = (v - 0.5) * height;
      const position = origin
        .clone()
        .add(right.clone().multiplyScalar(lx))
        .add(up.clone().multiplyScalar(ly))
        .add(faceNormal.clone().multiplyScalar(offset));
      samples.push({ position, faceNormal: faceNormal.clone(), area: sampleArea });
    }
  }
  return { samples, error: null };
}

function buildCurvedSamples(
  receiver: SceneObject,
  nu: number,
  nv: number,
  side: 'front' | 'back',
): { samples: SurfaceSample[]; error: string | null } {
  const transformError = assertSupportedTransform(receiver);
  if (transformError) return { samples: [], error: transformError };
  if (!receiver.curved) return { samples: [], error: 'Curved receiver is missing curved parameters.' };

  const worldMatrix = buildWorldMatrixFromTransform(receiver.transform);
  const { radius, arcAngleDeg, height } = receiver.curved;
  const arcRad = THREE.MathUtils.degToRad(arcAngleDeg);
  const dTheta = arcRad / nu;
  const dv = height / nv;
  const sampleArea = radius * dTheta * dv;
  // Front = concave interior (typical cinema screen); back = convex exterior.
  const radialSign = side === 'front' ? -1 : 1;
  const sampleRadius = radius + radialSign * SURFACE_SIDE_OFFSET;

  const samples: SurfaceSample[] = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const theta = -arcRad / 2 + (i + 0.5) * dTheta;
      const y = -height / 2 + (j + 0.5) * dv;
      const local = new THREE.Vector3(
        sampleRadius * Math.cos(theta),
        y,
        sampleRadius * Math.sin(theta),
      );
      const position = local.clone().applyMatrix4(worldMatrix);
      const localNormal = new THREE.Vector3(-Math.cos(theta), 0, -Math.sin(theta)).multiplyScalar(
        side === 'front' ? 1 : -1,
      );
      const faceNormal = localNormal.transformDirection(worldMatrix).normalize();
      samples.push({ position, faceNormal, area: sampleArea });
    }
  }
  return { samples, error: null };
}

function buildSamplesForSide(
  receiver: SceneObject,
  preset: (typeof ANALYSIS_QUALITY_PRESETS)[AnalysisQuality],
  side: 'front' | 'back',
): { samples: SurfaceSample[]; samplingResolution: { u: number; v: number }; error: string | null } {
  if (receiver.type === 'screen' || receiver.type === 'floor') {
    const built = buildPlanarSamples(receiver, preset.planarU, preset.planarV, side);
    return {
      samples: built.samples,
      samplingResolution: { u: preset.planarU, v: preset.planarV },
      error: built.error,
    };
  }
  const built = buildCurvedSamples(receiver, preset.curvedU, preset.curvedV, side);
  return {
    samples: built.samples,
    samplingResolution: { u: preset.curvedU, v: preset.curvedV },
    error: built.error,
  };
}

function pointInProjectorFrustum(
  worldPoint: THREE.Vector3,
  projector: ProjectorConfig,
  worldMatrix: THREE.Matrix4,
): boolean {
  const vp = getProjectorViewProjectionMatrix(projector.optics, worldMatrix);
  const clip = new THREE.Vector4(worldPoint.x, worldPoint.y, worldPoint.z, 1).applyMatrix4(vp);
  const w = clip.w;
  if (w <= FRUSTUM_EPSILON) return false;
  const invW = 1 / w;
  const x = clip.x * invW;
  const y = clip.y * invW;
  const z = clip.z * invW;
  return (
    x >= -1 - FRUSTUM_EPSILON &&
    x <= 1 + FRUSTUM_EPSILON &&
    y >= -1 - FRUSTUM_EPSILON &&
    y <= 1 + FRUSTUM_EPSILON &&
    z >= -1 - FRUSTUM_EPSILON &&
    z <= 1 + FRUSTUM_EPSILON
  );
}

function aggregateSamples(
  samples: SurfaceSample[],
  eligible: ProjectorConfig[],
  blockers: BlockerDescriptor[],
  receiverId: string,
): SideAggregate {
  const perProjector = new Map<string, { geometric: number; visible: number; blocked: number }>();
  for (const proj of eligible) {
    perProjector.set(proj.id, { geometric: 0, visible: 0, blocked: 0 });
  }

  let receiverArea = 0;
  let geometricCoveredArea = 0;
  let visibleCoveredArea = 0;
  let visibleOverlapArea = 0;
  let occlusionLossArea = 0;

  for (const sample of samples) {
    receiverArea += sample.area;

    const geometricHits: string[] = [];
    const visibleHits: string[] = [];

    for (const proj of eligible) {
      const worldMatrix = buildWorldMatrixFromTransform(proj.transform);
      const origin = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
      if (!pointInProjectorFrustum(sample.position, proj, worldMatrix)) continue;
      if (!projectorIlluminatesFace(origin, sample.position, sample.faceNormal)) continue;

      geometricHits.push(proj.id);
      const metrics = perProjector.get(proj.id)!;
      metrics.geometric += sample.area;

      if (!isOccludedAlongSegment(origin, sample.position, blockers, receiverId)) {
        visibleHits.push(proj.id);
        metrics.visible += sample.area;
      } else {
        metrics.blocked += sample.area;
      }
    }

    if (geometricHits.length > 0) geometricCoveredArea += sample.area;
    if (visibleHits.length > 0) visibleCoveredArea += sample.area;
    if (visibleHits.length >= 2) visibleOverlapArea += sample.area;
    if (geometricHits.length > 0 && visibleHits.length === 0) occlusionLossArea += sample.area;
  }

  return {
    receiverArea,
    geometricCoveredArea,
    visibleCoveredArea,
    uncoveredArea: Math.max(0, receiverArea - visibleCoveredArea),
    visibleOverlapArea,
    occlusionLossArea,
    perProjector,
  };
}

function sideMetricsFromAggregate(agg: SideAggregate): SampledCoverageSideMetrics {
  return {
    receiverArea: agg.receiverArea,
    geometricCoveredArea: agg.geometricCoveredArea,
    visibleCoveredArea: agg.visibleCoveredArea,
    uncoveredArea: agg.uncoveredArea,
    visibleOverlapArea: agg.visibleOverlapArea,
    occlusionLossArea: agg.occlusionLossArea,
  };
}

function mergeAggregates(a: SideAggregate, b: SideAggregate): SideAggregate {
  const perProjector = new Map<string, { geometric: number; visible: number; blocked: number }>();
  for (const [id, m] of a.perProjector) {
    perProjector.set(id, { ...m });
  }
  for (const [id, m] of b.perProjector) {
    const existing = perProjector.get(id);
    if (existing) {
      existing.geometric += m.geometric;
      existing.visible += m.visible;
      existing.blocked += m.blocked;
    } else {
      perProjector.set(id, { ...m });
    }
  }
  return {
    receiverArea: a.receiverArea + b.receiverArea,
    geometricCoveredArea: a.geometricCoveredArea + b.geometricCoveredArea,
    visibleCoveredArea: a.visibleCoveredArea + b.visibleCoveredArea,
    uncoveredArea: a.uncoveredArea + b.uncoveredArea,
    visibleOverlapArea: a.visibleOverlapArea + b.visibleOverlapArea,
    occlusionLossArea: a.occlusionLossArea + b.occlusionLossArea,
    perProjector,
  };
}

function aggregateToPerProjector(
  agg: SideAggregate,
  eligible: ProjectorConfig[],
): SampledCoverageAnalysis['perProjector'] {
  return eligible.map((proj) => {
    const m = agg.perProjector.get(proj.id) ?? { geometric: 0, visible: 0, blocked: 0 };
    return {
      projectorId: proj.id,
      geometricCoveredArea: m.geometric,
      visibleCoveredArea: m.visible,
      blockedArea: m.blocked,
    };
  });
}

function emptyAnalysis(
  quality: AnalysisQuality,
  targetSide: CalculationTargetSide,
  samplingResolution: { u: number; v: number },
  eligible: ProjectorConfig[],
  limitation: string,
): SampledCoverageAnalysis {
  return {
    method: 'surface-sampling',
    quality,
    targetSide,
    samplingResolution,
    receiverArea: 0,
    geometricCoveredArea: 0,
    visibleCoveredArea: 0,
    uncoveredArea: 0,
    visibleOverlapArea: 0,
    occlusionLossArea: 0,
    perProjector: [],
    eligibleProjectorIds: eligible.map((p) => p.id),
    assumptions: [],
    limitations: [limitation],
  };
}

const BASE_ASSUMPTIONS = [
  'Eligible projectors are enabled with valid optics.',
  'Geometric coverage ignores physical occlusion; visible coverage tests occlusion along the lens-to-sample segment.',
  'Only objects with blocks projection enabled participate in occlusion.',
  'Imported meshes are not sampled as receivers or occluders.',
  'Rigid transforms (position + rotation) only; non-uniform scale is not supported.',
  'Front/back faces use mesh winding conventions (+Z for flat screens, +Y for floors, concave interior for curved screens).',
];

const BASE_LIMITATIONS = [
  'Results are area-weighted surface samples, not viewport pixels.',
  'Sampling resolution does not guarantee a specific accuracy bound.',
  'Pairwise overlap metrics elsewhere in the app remain separate analytic approximations.',
];

export function computeSampledCoverageAnalysis(
  input: CoverageAnalysisInput,
): SampledCoverageAnalysis | null {
  const { receiver, sceneObjects, projectors, quality, targetSide } = input;
  if (receiver.type !== 'screen' && receiver.type !== 'curvedScreen') return null;
  if (!receiver.receivesProjection) return null;

  const eligible = projectors.filter(isEligibleProjector);
  const preset = ANALYSIS_QUALITY_PRESETS[quality];
  const blockers = listBlockerDescriptors(sceneObjects);

  const sidesToAnalyze: Array<'front' | 'back'> =
    targetSide === 'both' ? ['front', 'back'] : [targetSide === 'back' ? 'back' : 'front'];

  const sideResults: Partial<Record<'front' | 'back', SideAggregate>> = {};
  let samplingResolution = { u: 0, v: 0 };

  for (const side of sidesToAnalyze) {
    const built = buildSamplesForSide(receiver, preset, side);
    samplingResolution = built.samplingResolution;
    if (built.error) {
      return emptyAnalysis(quality, targetSide, samplingResolution, eligible, built.error);
    }
    if (built.samples.length === 0) return null;
    sideResults[side] = aggregateSamples(built.samples, eligible, blockers, receiver.id);
  }

  const frontAgg = sideResults.front;
  const backAgg = sideResults.back;
  const combined =
    frontAgg && backAgg ? mergeAggregates(frontAgg, backAgg) : (frontAgg ?? backAgg)!;

  const result: SampledCoverageAnalysis = {
    method: 'surface-sampling',
    quality,
    targetSide,
    samplingResolution,
    receiverArea: combined.receiverArea,
    geometricCoveredArea: combined.geometricCoveredArea,
    visibleCoveredArea: combined.visibleCoveredArea,
    uncoveredArea: combined.uncoveredArea,
    visibleOverlapArea: combined.visibleOverlapArea,
    occlusionLossArea: combined.occlusionLossArea,
    perProjector: aggregateToPerProjector(combined, eligible),
    eligibleProjectorIds: eligible.map((p) => p.id),
    assumptions: BASE_ASSUMPTIONS,
    limitations: BASE_LIMITATIONS,
  };

  if (targetSide === 'both' && frontAgg && backAgg) {
    result.perSide = {
      front: sideMetricsFromAggregate(frontAgg),
      back: sideMetricsFromAggregate(backAgg),
    };
  }

  return result;
}

export function percentOfReceiver(area: number, receiverArea: number): number {
  if (receiverArea <= 0) return 0;
  return (area / receiverArea) * 100;
}
