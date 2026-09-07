export type DisplayUnit = 'm' | 'cm' | 'mm';

export type SceneObjectType = 'screen' | 'floor' | 'wall' | 'box';

export type TestPattern =
  | 'checkerboard'
  | 'uvGrid'
  | 'colorBars'
  | 'white'
  | 'projectorId';

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
  /** Width, height, depth in meters (depth optional for planes) */
  dimensions: { width: number; height: number; depth?: number };
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
  unclippedArea: number;
  clippedArea: number;
  centerHit: Vec3 | null;
  axialDistance: number | null;
}

export interface CalculationResults {
  nominal: NominalProjection | null;
  footprint: FootprintResult | null;
  opticsError: string | null;
}
