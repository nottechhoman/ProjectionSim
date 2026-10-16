import type {
  DisplayUnit,
  ProjectorConfig,
  SceneObject,
  TransformMode,
  ViewPreset,
} from '../types';

/**
 * Current project file version. Older files are upgraded step by step on load
 * (src/persistence/migrations.ts): 1 original, 2 Advanced, 3 content on layers +
 * mappings (app v4–v9), 4 warp modes with grid warp (app v10).
 */
export const PROJECT_FILE_VERSION = 4 as const;
export const PROJECT_FILE_VERSION_V2 = 2 as const;
export const PROJECT_FILE_VERSION_LEGACY = 1 as const;

export interface ProjectSnapshotV3 {
  version: typeof PROJECT_FILE_VERSION;
  savedAt: string;
  name: string;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: import('../types').MediaAssetRecord[];
  materialPreviewMode: import('../types').MaterialPreviewMode;
  projectionCompositeMode: import('../types').ProjectionCompositeMode;
  /** v4: mappings, tracks and layers. */
  show: import('../types').Show;
  calculationTargetId?: string | null;
  analysisQuality?: import('../types').AnalysisQuality;
  calculationTargetSide?: import('../types').CalculationTargetSide;
  /** v2 Advanced: global edge-blend settings (ignored by v1). */
  blendSettings?: import('../types').BlendSettings;
  previzSettings?: import('../types').PrevizSettings;
  selectedObjectId: string | null;
  selectedProjectorId: string;
  displayUnit: DisplayUnit;
  viewPreset: ViewPreset;
  transformMode: TransformMode;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  leftPanelPoppedOut?: boolean;
  rightPanelPoppedOut?: boolean;
  leftPanelFloat?: { x: number; y: number };
  rightPanelFloat?: { x: number; y: number };
}

export interface ProjectSnapshotV1 {
  version: typeof PROJECT_FILE_VERSION_LEGACY;
  savedAt: string;
  name: string;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  selectedObjectId: string | null;
  selectedProjectorId: string;
  displayUnit: DisplayUnit;
  viewPreset: ViewPreset;
  transformMode: TransformMode;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
}

export type ProjectSnapshot = ProjectSnapshotV3;
