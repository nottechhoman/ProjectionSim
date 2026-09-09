export type DisplayUnit = 'm' | 'cm' | 'mm';

export type ViewPreset = 'persp' | 'top' | 'front' | 'side';

export type TransformMode = 'translate' | 'rotate';

export type SceneObjectType = 'screen' | 'floor' | 'wall' | 'box' | 'curvedScreen' | 'model';

export type MaterialPreviewMode = 'original' | 'projectionPreview' | 'projectionUv';

export type MediaSourceKind = 'pattern' | 'image' | 'video';

export type MediaFitMode = 'contain' | 'cover' | 'stretch';

export type TestPattern =
  | 'checkerboard'
  | 'uvGrid'
  | 'colorBars'
  | 'white'
  | 'projectorId';

export type ProjectionCompositeMode = 'solo' | 'unblended' | 'heatmap' | 'blended';

export type MappingMode = 'raw' | 'sharedCanvas';

export type AnalysisQuality = 'draft' | 'high';

export type ProjectionSides = 'front' | 'back' | 'both';

/** Which face(s) of the calculation target to analyze. */
export type CalculationTargetSide = 'front' | 'back' | 'both';

export interface BlendEdges {
  /** Feather width as fraction of image width/height (0–0.5). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const DEFAULT_BLEND_EDGES: BlendEdges = {
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

export const PROJECTOR_PALETTE = ['#4fc3f7', '#ff7043', '#66bb6a', '#ab47bc'] as const;

export const MAX_PROJECTORS = 4;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Transform {
  position: Vec3;
  /** Stored as quaternion [x, y, z, w] */
  quaternion: [number, number, number, number];
}

export interface SceneObject {
  id: string;
  name: string;
  type: SceneObjectType;
  transform: Transform;
  visibleInEditor: boolean;
  receivesProjection: boolean;
  blocksProjection: boolean;
  /** Which mesh faces receive projection (thin surfaces only). Default: front. */
  projectionSides?: ProjectionSides;
  /** Width, height, depth in meters (depth optional for planes) */
  dimensions: { width: number; height: number; depth?: number };
  /** Curved screen: radius (m), arc angle (degrees), height (m) */
  curved?: { radius: number; arcAngleDeg: number; height: number };
  /** Imported GLB root reference */
  modelAssetId?: string;
  /** Scale factor applied to imported models (1 = file units as meters) */
  modelScale?: number;
}

export interface MediaAssetRecord {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'model';
  mimeType: string;
}

export interface ProjectorOptics {
  throwRatio: number;
  throwRatioMin?: number;
  throwRatioMax?: number;
  resolution: { width: number; height: number };
  aspectRatio: number;
  lensShiftH: number;
  lensShiftV: number;
  nearLimit: number;
  farLimit: number;
}

export interface ProjectorConfig {
  id: string;
  name: string;
  enabled: boolean;
  color: string;
  transform: Transform;
  optics: ProjectorOptics;
  testPattern: TestPattern;
  brightness: number;
  mediaSource: MediaSourceKind;
  mediaAssetId: string | null;
  mediaFit: MediaFitMode;
  blendEdges: BlendEdges;
  outerEdgeFade: boolean;
}

export interface NominalProjection {
  width: number;
  height: number;
  diagonal: number;
  area: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  pixelsPerMeterH: number;
  pixelsPerMeterV: number;
  mmPerPixelH: number;
}

export interface FootprintResult {
  corners: Vec3[];
  /** Optional polyline for beam outline (curved screens). */
  beamOutline?: Vec3[];
  unclippedArea: number;
  clippedArea: number;
  centerHit: Vec3 | null;
  axialDistance: number | null;
}

export interface PairwiseOverlap {
  projectorAId: string;
  projectorBId: string;
  areaM2: number;
  overlapWidthM: number | null;
  overlapHeightM: number | null;
  overlapPixelsA: number | null;
  overlapPixelsB: number | null;
  percentOfA: number;
  percentOfB: number;
}

export interface OverlapResults {
  perProjectorAreaM2: Record<string, number>;
  pairwise: PairwiseOverlap[];
  unionAreaM2: number;
  multiCoverageAreaM2: number;
  uncoveredAreaM2: number;
  combinedWidthM: number | null;
  horizontalOverlapM: number | null;
}

export interface ProjectorCoverageMetrics {
  projectorId: string;
  geometricCoveredArea: number;
  visibleCoveredArea: number;
  blockedArea: number;
}

/** Area-weighted surface sampling results — distinct from analytic overlap metrics. */
export interface SampledCoverageAnalysis {
  method: 'surface-sampling';
  quality: AnalysisQuality;
  targetSide: CalculationTargetSide;
  samplingResolution: { u: number; v: number };
  receiverArea: number;
  geometricCoveredArea: number;
  visibleCoveredArea: number;
  uncoveredArea: number;
  visibleOverlapArea: number;
  occlusionLossArea: number;
  perProjector: ProjectorCoverageMetrics[];
  perSide?: {
    front?: SampledCoverageSideMetrics;
    back?: SampledCoverageSideMetrics;
  };
  eligibleProjectorIds: string[];
  assumptions: string[];
  limitations: string[];
}

export interface SampledCoverageSideMetrics {
  receiverArea: number;
  geometricCoveredArea: number;
  visibleCoveredArea: number;
  uncoveredArea: number;
  visibleOverlapArea: number;
  occlusionLossArea: number;
}

export interface CalculationResults {
  nominal: NominalProjection | null;
  footprint: FootprintResult | null;
  opticsError: string | null;
  overlap: OverlapResults | null;
  coverageAnalysis: SampledCoverageAnalysis | null;
  calculationTarget: {
    id: string;
    name: string;
    type: 'screen' | 'curvedScreen';
  } | null;
}
