import type { ProjectSnapshot } from '../persistence/projectSchema';
import type {
  DisplayUnit,
  MaterialPreviewMode,
  MappingMode,
  ProjectionCompositeMode,
  MediaAssetRecord,
  ProjectorConfig,
  SceneObject,
  TransformMode,
  ViewPreset,
} from '../types';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';
import {
  clampPanelWidth,
  clampFloatPosition,
  DEFAULT_LEFT_PANEL_WIDTH,
  DEFAULT_RIGHT_PANEL_WIDTH,
  defaultLeftPanelFloat,
  defaultRightPanelFloat,
  FLOATING_PANEL_HEIGHT,
  type PanelFloatPosition,
} from '../ui/panelLayout';
import { readAutosave } from '../persistence/autosave';
import {
  legacyDefaultCalculationTargetId,
  legacyDefaultSharedContentSourceId,
  resolveCalculationTargetId,
  resolveSharedContentSourceId,
} from './reliabilitySettings';

export interface PersistedStateSlice {
  projectName: string;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: MediaAssetRecord[];
  materialPreviewMode: MaterialPreviewMode;
  projectionCompositeMode: ProjectionCompositeMode;
  mappingMode: MappingMode;
  sharedContentSourceProjectorId: string | null;
  calculationTargetId: string | null;
  selectedObjectId: string | null;
  selectedProjectorId: string;
  displayUnit: DisplayUnit;
  viewPreset: ViewPreset;
  transformMode: TransformMode;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
  leftPanelWidth: number;
  rightPanelWidth: number;
  leftPanelPoppedOut: boolean;
  rightPanelPoppedOut: boolean;
  leftPanelFloat: PanelFloatPosition;
  rightPanelFloat: PanelFloatPosition;
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
    projectionCompositeMode: slice.projectionCompositeMode,
    mappingMode: slice.mappingMode,
    sharedContentSourceProjectorId: slice.sharedContentSourceProjectorId,
    calculationTargetId: slice.calculationTargetId,
    selectedObjectId: slice.selectedObjectId,
    selectedProjectorId: slice.selectedProjectorId,
    displayUnit: slice.displayUnit,
    viewPreset: slice.viewPreset,
    transformMode: slice.transformMode,
    leftPanelVisible: slice.leftPanelVisible,
    rightPanelVisible: slice.rightPanelVisible,
    bottomPanelVisible: slice.bottomPanelVisible,
    leftPanelWidth: slice.leftPanelWidth,
    rightPanelWidth: slice.rightPanelWidth,
    leftPanelPoppedOut: slice.leftPanelPoppedOut,
    rightPanelPoppedOut: slice.rightPanelPoppedOut,
    leftPanelFloat: slice.leftPanelFloat,
    rightPanelFloat: slice.rightPanelFloat,
  };
}

export function snapshotToSlice(snapshot: ProjectSnapshot): PersistedStateSlice {
  const projectors = snapshot.projectors;
  const sceneObjects = snapshot.sceneObjects;
  const selectedProjectorId = snapshot.selectedProjectorId;

  const explicitSharedSource =
    typeof snapshot.sharedContentSourceProjectorId === 'string'
      ? snapshot.sharedContentSourceProjectorId
      : null;
  const explicitCalcTarget =
    typeof snapshot.calculationTargetId === 'string' ? snapshot.calculationTargetId : null;

  const sharedContentSourceProjectorId = resolveSharedContentSourceId(
    projectors,
    explicitSharedSource ??
      legacyDefaultSharedContentSourceId(projectors, selectedProjectorId),
  );
  const calculationTargetId = resolveCalculationTargetId(
    sceneObjects,
    explicitCalcTarget ?? legacyDefaultCalculationTargetId(sceneObjects),
  );

  return {
    projectName: snapshot.name,
    sceneObjects,
    projectors,
    mediaAssets: snapshot.mediaAssets ?? [],
    materialPreviewMode: snapshot.materialPreviewMode ?? 'projectionPreview',
    projectionCompositeMode: snapshot.projectionCompositeMode ?? 'unblended',
    mappingMode: snapshot.mappingMode === 'sharedCanvas' ? 'sharedCanvas' : 'raw',
    sharedContentSourceProjectorId,
    calculationTargetId,
    selectedObjectId: snapshot.selectedObjectId,
    selectedProjectorId,
    displayUnit: snapshot.displayUnit,
    viewPreset: snapshot.viewPreset,
    transformMode: snapshot.transformMode,
    leftPanelVisible: snapshot.leftPanelVisible,
    rightPanelVisible: snapshot.rightPanelVisible,
    bottomPanelVisible: snapshot.bottomPanelVisible,
    leftPanelWidth: clampPanelWidth(snapshot.leftPanelWidth ?? DEFAULT_LEFT_PANEL_WIDTH),
    rightPanelWidth: clampPanelWidth(snapshot.rightPanelWidth ?? DEFAULT_RIGHT_PANEL_WIDTH),
    leftPanelPoppedOut: snapshot.leftPanelPoppedOut ?? false,
    rightPanelPoppedOut: snapshot.rightPanelPoppedOut ?? false,
    leftPanelFloat: normalizePanelFloat(
      snapshot.leftPanelFloat,
      clampPanelWidth(snapshot.leftPanelWidth ?? DEFAULT_LEFT_PANEL_WIDTH),
      'left',
    ),
    rightPanelFloat: normalizePanelFloat(
      snapshot.rightPanelFloat,
      clampPanelWidth(snapshot.rightPanelWidth ?? DEFAULT_RIGHT_PANEL_WIDTH),
      'right',
    ),
  };
}

function normalizePanelFloat(
  raw: { x?: number; y?: number } | undefined,
  width: number,
  side: 'left' | 'right',
): PanelFloatPosition {
  const fallback = side === 'left' ? defaultLeftPanelFloat(width) : defaultRightPanelFloat(width);
  if (typeof raw?.x !== 'number' || typeof raw?.y !== 'number') return fallback;
  return clampFloatPosition(raw.x, raw.y, width, FLOATING_PANEL_HEIGHT);
}

export function defaultPersistedSlice(): PersistedStateSlice {
  return {
    projectName: 'Default Scene',
    sceneObjects: structuredClone(DEFAULT_SCENE_OBJECTS),
    projectors: structuredClone(DEFAULT_PROJECTORS),
    mediaAssets: [],
    materialPreviewMode: 'projectionPreview',
    projectionCompositeMode: 'solo',
    mappingMode: 'raw',
    sharedContentSourceProjectorId: 'proj-1',
    calculationTargetId: 'screen-1',
    selectedObjectId: 'proj-1',
    selectedProjectorId: 'proj-1',
    displayUnit: 'm',
    viewPreset: 'persp',
    transformMode: 'translate',
    leftPanelVisible: true,
    rightPanelVisible: true,
    bottomPanelVisible: true,
    leftPanelWidth: DEFAULT_LEFT_PANEL_WIDTH,
    rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
    leftPanelPoppedOut: false,
    rightPanelPoppedOut: false,
    leftPanelFloat: defaultLeftPanelFloat(DEFAULT_LEFT_PANEL_WIDTH),
    rightPanelFloat: defaultRightPanelFloat(DEFAULT_RIGHT_PANEL_WIDTH),
  };
}
