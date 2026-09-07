import type {
  DisplayUnit,
  ProjectorConfig,
  SceneObject,
  TransformMode,
  ViewPreset,
} from '../types';

export const PROJECT_FILE_VERSION = 1 as const;

export interface ProjectSnapshotV1 {
  version: typeof PROJECT_FILE_VERSION;
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

export type ProjectSnapshot = ProjectSnapshotV1;
