import type {
  DisplayUnit,
  ProjectorConfig,
  SceneObject,
  TransformMode,
  ViewPreset,
} from '../types';

export const PROJECT_FILE_VERSION = 2 as const;
export const PROJECT_FILE_VERSION_LEGACY = 1 as const;

export interface ProjectSnapshotV2 {
  version: typeof PROJECT_FILE_VERSION;
  savedAt: string;
  name: string;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: import('../types').MediaAssetRecord[];
  materialPreviewMode: import('../types').MaterialPreviewMode;
  projectionCompositeMode: import('../types').ProjectionCompositeMode;
  mappingMode?: import('../types').MappingMode;
  contentCanvas?: import('../types').ContentCanvas;
  sharedContentSourceProjectorId?: string | null;
  calculationTargetId?: string | null;
  analysisQuality?: import('../types').AnalysisQuality;
  calculationTargetSide?: import('../types').CalculationTargetSide;
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

export type ProjectSnapshot = ProjectSnapshotV2;
