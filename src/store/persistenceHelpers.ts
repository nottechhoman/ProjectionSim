import type { ProjectSnapshot } from '../persistence/projectSchema';
import type {
  DisplayUnit,
  MaterialPreviewMode,
  MediaAssetRecord,
  ProjectorConfig,
  SceneObject,
  TransformMode,
  ViewPreset,
} from '../types';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';
import { readAutosave } from '../persistence/autosave';

export interface PersistedStateSlice {
  projectName: string;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: MediaAssetRecord[];
  materialPreviewMode: MaterialPreviewMode;
  selectedObjectId: string | null;
  selectedProjectorId: string;
  displayUnit: DisplayUnit;
  viewPreset: ViewPreset;
  transformMode: TransformMode;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
}

export function buildInitialPersistedState(): PersistedStateSlice {
  const autosave = typeof localStorage !== 'undefined' ? readAutosave() : null;
  if (autosave) {
    return snapshotToSlice(autosave);
  }
  return defaultPersistedSlice();
}

export function sliceToSnapshot(slice: PersistedStateSlice): ProjectSnapshot {
  return {
    version: 2,
    savedAt: new Date().toISOString(),
    name: slice.projectName,
    sceneObjects: slice.sceneObjects,
    projectors: slice.projectors,
    mediaAssets: slice.mediaAssets,
    materialPreviewMode: slice.materialPreviewMode,
    selectedObjectId: slice.selectedObjectId,
    selectedProjectorId: slice.selectedProjectorId,
    displayUnit: slice.displayUnit,
    viewPreset: slice.viewPreset,
    transformMode: slice.transformMode,
    leftPanelVisible: slice.leftPanelVisible,
    rightPanelVisible: slice.rightPanelVisible,
    bottomPanelVisible: slice.bottomPanelVisible,
  };
}

export function snapshotToSlice(snapshot: ProjectSnapshot): PersistedStateSlice {
  return {
    projectName: snapshot.name,
    sceneObjects: snapshot.sceneObjects,
    projectors: snapshot.projectors,
    mediaAssets: snapshot.mediaAssets ?? [],
    materialPreviewMode: snapshot.materialPreviewMode ?? 'projectionPreview',
    selectedObjectId: snapshot.selectedObjectId,
    selectedProjectorId: snapshot.selectedProjectorId,
    displayUnit: snapshot.displayUnit,
    viewPreset: snapshot.viewPreset,
    transformMode: snapshot.transformMode,
    leftPanelVisible: snapshot.leftPanelVisible,
    rightPanelVisible: snapshot.rightPanelVisible,
    bottomPanelVisible: snapshot.bottomPanelVisible,
  };
}

export function defaultPersistedSlice(): PersistedStateSlice {
  return {
    projectName: 'Default Scene',
    sceneObjects: structuredClone(DEFAULT_SCENE_OBJECTS),
    projectors: structuredClone(DEFAULT_PROJECTORS),
    mediaAssets: [],
    materialPreviewMode: 'projectionPreview',
    selectedObjectId: 'proj-1',
    selectedProjectorId: 'proj-1',
    displayUnit: 'm',
    viewPreset: 'persp',
    transformMode: 'translate',
    leftPanelVisible: true,
    rightPanelVisible: true,
    bottomPanelVisible: true,
  };
}
