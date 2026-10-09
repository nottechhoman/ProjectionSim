import type { ProjectSnapshot } from '../persistence/projectSchema';
import type {
  DisplayUnit,
  MaterialPreviewMode,
  Show,
  ProjectionCompositeMode,
  MediaAssetRecord,
  ProjectorConfig,
  SceneObject,
  TransformMode,
  ViewPreset,
  AnalysisQuality,
  CalculationTargetSide,
  BlendSettings,
  PrevizSettings,
} from '../types';
import { normalizeBlendSettings } from '../blending/advancedBlend';
import { normalizePrevizSettings } from '../optics/illuminance';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS, defaultShow } from './defaultScene';
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
import {
  getDeviceProfile,
  responsivePanelWidths,
  shouldStartWithPanelsHidden,
} from '../ui/deviceProfile';
import { readAutosave } from '../persistence/autosave';
import { legacyDefaultCalculationTargetId, resolveCalculationTargetId } from './reliabilitySettings';

export interface PersistedStateSlice {
  projectName: string;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  mediaAssets: MediaAssetRecord[];
  materialPreviewMode: MaterialPreviewMode;
  projectionCompositeMode: ProjectionCompositeMode;
  show: Show;
  calculationTargetId: string | null;
  analysisQuality: AnalysisQuality;
  calculationTargetSide: CalculationTargetSide;
  blendSettings: BlendSettings;
  previzSettings: PrevizSettings;
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
    version: 3,
    savedAt: new Date().toISOString(),
    name: slice.projectName,
    sceneObjects: slice.sceneObjects,
    projectors: slice.projectors,
    mediaAssets: slice.mediaAssets,
    materialPreviewMode: slice.materialPreviewMode,
    projectionCompositeMode: slice.projectionCompositeMode,
    show: slice.show,
    calculationTargetId: slice.calculationTargetId,
    analysisQuality: slice.analysisQuality,
    calculationTargetSide: slice.calculationTargetSide,
    blendSettings: slice.blendSettings,
    previzSettings: slice.previzSettings,
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

  const explicitCalcTarget =
    typeof snapshot.calculationTargetId === 'string' ? snapshot.calculationTargetId : null;

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
    show: snapshot.show,
    calculationTargetId,
    analysisQuality: snapshot.analysisQuality === 'high' ? 'high' : 'draft',
    calculationTargetSide:
      snapshot.calculationTargetSide === 'back' || snapshot.calculationTargetSide === 'both'
        ? snapshot.calculationTargetSide
        : 'front',
    blendSettings: normalizeBlendSettings(snapshot.blendSettings),
    previzSettings: normalizePrevizSettings(snapshot.previzSettings),
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
    projectionCompositeMode: 'unblended',
    show: defaultShow(),
    calculationTargetId: 'screen-1',
    analysisQuality: 'draft',
    calculationTargetSide: 'front',
    blendSettings: normalizeBlendSettings(undefined),
    previzSettings: normalizePrevizSettings(undefined),
    selectedObjectId: 'proj-1',
    selectedProjectorId: 'proj-1',
    displayUnit: 'm',
    viewPreset: 'persp',
    transformMode: 'translate',
    leftPanelVisible: !shouldStartWithPanelsHidden(getDeviceProfile()),
    rightPanelVisible: !shouldStartWithPanelsHidden(getDeviceProfile()),
    bottomPanelVisible: true,
    leftPanelWidth: responsivePanelWidths(getDeviceProfile()).left,
    rightPanelWidth: responsivePanelWidths(getDeviceProfile()).right,
    leftPanelPoppedOut: false,
    rightPanelPoppedOut: false,
    leftPanelFloat: defaultLeftPanelFloat(DEFAULT_LEFT_PANEL_WIDTH),
    rightPanelFloat: defaultRightPanelFloat(DEFAULT_RIGHT_PANEL_WIDTH),
  };
}
