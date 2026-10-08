export type DisplayUnit = 'm' | 'cm' | 'mm';

export type ViewPreset = 'persp' | 'top' | 'front' | 'side';

export type TransformMode = 'translate' | 'rotate';

export type SceneObjectType = 'screen' | 'floor' | 'wall' | 'box' | 'curvedScreen' | 'model' | 'ledWall';

export type MaterialPreviewMode =
  | 'original'
  | 'projectionPreview'
  | 'projectionUv'
  | 'falloff'
  /** v2: per-fragment sum of light-space blend weights (1.0 = seamless). */
  | 'blendSum'
  /** Per-surface texture UV (the screen texture layout) as colour. */
  | 'surfaceUv';

export type MediaFitMode = 'contain' | 'cover' | 'stretch';

export type TestPattern =
  | 'checkerboard'
  | 'uvGrid'
  | 'colorBars'
  | 'white'
  | 'projectorId'
  | 'black'
  | 'gray';

export type ProjectionCompositeMode = 'solo' | 'unblended' | 'heatmap' | 'blended';

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

/** 1.0 = linear ramp, seamless matched ramps in linear-light output. */
export const DEFAULT_BLEND_GAMMA = 1;
export const MIN_BLEND_GAMMA = 0.5;
export const MAX_BLEND_GAMMA = 3;

export const PROJECTOR_PALETTE = ['#4fc3f7', '#ff7043', '#66bb6a', '#ab47bc'] as const;

export const MAX_PROJECTORS = 4;

// ---------------------------------------------------------------------------
// v2 Advanced: UV mapping, warp, advanced edge blending
// ---------------------------------------------------------------------------

/** How a receiving surface derives its 0–1 surface UV. */
export type SurfaceUvProjection = 'meshUv' | 'planar' | 'cylindrical' | 'spherical';
export type UvWrapMode = 'clamp' | 'repeat' | 'mirror';

/** Normalized rect in content space, top-left origin (matches the content canvas editor). */
export interface UvRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Corner-pin (keystone) warp of the projector output. Corners are where the
 * image corners land inside the physical raster, in raster UV (0–1, bottom-left
 * origin). Order: bottom-left, bottom-right, top-right, top-left.
 */
export interface ProjectorWarp {
  enabled: boolean;
  corners: [Vec2, Vec2, Vec2, Vec2];
}

export const IDENTITY_WARP_CORNERS: [Vec2, Vec2, Vec2, Vec2] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export const DEFAULT_PROJECTOR_WARP: ProjectorWarp = {
  enabled: false,
  corners: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ],
};

/** manual = per-edge feathers; auto = geometry-aware weights from real overlap. */
export type BlendMode = 'manual' | 'auto';
export type BlendCurve = 'linear' | 'smoothstep' | 'cosine' | 'power';

export interface BlendSettings {
  mode: BlendMode;
  curve: BlendCurve;
  /** Auto: ramp width as fraction of half the image (0.05–1; 1 = ramp to image centre). */
  width: number;
  /** Auto: sharpening exponent on edge scores (0.5–4). */
  exponent: number;
  /** When true the blend mask is pre-corrected for display gamma (seamless in light). */
  gammaCorrect: boolean;
  displayGamma: number;
  /** Projector native black as a fraction of full white (0–0.1). */
  blackLevel: number;
  /** Lift black in non-overlap regions so the whole canvas matches the overlap floor. */
  blackLevelCompensation: boolean;
}

export const DEFAULT_BLEND_SETTINGS: BlendSettings = {
  mode: 'manual',
  curve: 'smoothstep',
  width: 1,
  exponent: 1,
  gammaCorrect: true,
  displayGamma: 2.2,
  blackLevel: 0,
  blackLevelCompensation: false,
};

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
  /** v4: replace an imported model's UVs with a generated non-overlapping atlas. */
  uvAtlas?: boolean;
  /** Direct-display LED wall settings (type ledWall only). Content comes from layers. */
  ledWall?: {
    pixelResolution: { width: number; height: number };
  };
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
  brightness: number;
  blendEdges: BlendEdges;
  /** Ramp exponent (0.5–3); 1 = linear/seamless, higher = darker crossover. */
  blendGamma: number;
  outerEdgeFade: boolean;
  /** When true, projector orientation aims at lookAtTarget (orbit on rotate). */
  lookAtEnabled?: boolean;
  lookAtTarget?: Vec3;
  /** v2: corner-pin output warp. */
  warp?: ProjectorWarp;
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

// ---------------------------------------------------------------------------
// v4: mappings, layers and the show (content lives only on layers)
// ---------------------------------------------------------------------------

export type MappingKind = 'direct' | 'perspective' | 'parallel' | 'feed' | 'cylindrical' | 'spherical';
export type MappingFiltering = 'nearest' | 'bilinear' | 'msaa2x';
export type DirectFit = 'crop' | 'fit' | 'stretch' | 'pixel';

/** Euler rotation in degrees: x = pitch, y = yaw, z = roll (YXZ order, like projectors). */
export type RotationDeg = Vec3;

export interface PerspectiveParams {
  eye: Vec3;
  rotation: RotationDeg;
  /** Vertical field of view (degrees). Ignored while locked to a projector. */
  fovDeg: number;
  /** Follow this projector's position, orientation, lens and resolution. */
  lockToProjectorId: string | null;
  /**
   * Only the locked projector outputs layers on this mapping (raw per-projector
   * content, e.g. alignment patterns). Other projectors do not see them.
   */
  projectorOnly: boolean;
}

export interface ParallelParams {
  center: Vec3;
  rotation: RotationDeg;
  /** Size of the orthographic frame in metres. */
  size: { w: number; h: number };
}

/** Per-screen region of the mapping canvas (feed / surface-UV mapping). */
export interface FeedRect {
  screenId: string;
  /** How the screen derives its 0–1 surface UV. */
  projection: SurfaceUvProjection;
  /** Normalized region of the mapping canvas, top-left origin. */
  region: UvRegion;
  rotationDeg: number;
  flipU: boolean;
  flipV: boolean;
  repeatU: number;
  repeatV: number;
  wrap: UvWrapMode;
}

export interface CylindricalParams {
  center: Vec3;
  rotation: RotationDeg;
  /** Horizontal arc covered by the canvas (degrees, centred on local +Z). */
  arcDeg: number;
  /** Height covered by the canvas (metres, centred on the centre). */
  height: number;
}

export interface SphericalParams {
  center: Vec3;
  rotation: RotationDeg;
  arcDeg: number;
  /** Vertical arc covered by the canvas (degrees, centred on the horizon). */
  elevationDeg: number;
}

export interface Mapping {
  id: string;
  name: string;
  kind: MappingKind;
  /** Mapping canvas size in pixels. */
  resolution: { w: number; h: number };
  screenIds: string[];
  filtering: MappingFiltering;
  maskAssetId: string | null;
  direct?: { fit: DirectFit };
  perspective?: PerspectiveParams;
  parallel?: ParallelParams;
  feed?: { rects: FeedRect[] };
  cylindrical?: CylindricalParams;
  spherical?: SphericalParams;
}

export type MediaRef =
  | { kind: 'video'; assetId: string | null }
  | { kind: 'image'; assetId: string | null }
  | { kind: 'pattern'; pattern: TestPattern; color: string }
  | { kind: 'solid'; color: string };

export type LayerBlendMode = 'normal' | 'add' | 'multiply';
export type LayerPlayMode = 'loop' | 'once' | 'holdLast' | 'pingPong';

/** Layer placement inside its mapping canvas, normalized 0–1, top-left origin. */
export interface LayerRect {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
}

export interface Layer {
  id: string;
  name: string;
  media: MediaRef;
  mappingId: string | null;
  opacity: number;
  blendMode: LayerBlendMode;
  // timing
  startSec: number;
  durationSec: number;
  /** Media in-point (seconds into the clip). */
  inSec: number;
  /** Media out-point; null = end of clip. */
  outSec: number | null;
  playMode: LayerPlayMode;
  speed: number;
  fadeInSec: number;
  fadeOutSec: number;
  rect: LayerRect;
  fit: MediaFitMode;
  volume: number;
  muted: boolean;
  enabled: boolean;
}

export interface Track {
  id: string;
  name: string;
  durationSec: number;
  /** Render order: index 0 is the bottom layer. */
  layers: Layer[];
  sections: TrackSection[];
  cues: Cue[];
}

export type SectionEndAction = 'continue' | 'stop' | 'hold' | 'loop';

export interface TrackSection {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
  endAction: SectionEndAction;
}

export interface Cue {
  id: string;
  name: string;
  timeSec: number;
}

export interface Show {
  fps: number;
  mappings: Mapping[];
  tracks: Track[];
  activeTrackId: string;
}
