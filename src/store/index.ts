import { create } from 'zustand';
import * as THREE from 'three';
import { clearAutosave, downloadProjectFile, parseProjectJson, writeAutosave } from '../persistence';
import { transport } from '../playback/clock';
import type { ProjectSnapshot } from '../persistence/projectSchema';
import {
  detectFileKind,
  hydrateAssetsFromRecords,
  importMediaBlob,
} from '../media/assetImport';
import type {
  CalculationResults,
  DisplayUnit,
  Layer,
  Mapping,
  MappingKind,
  MaterialPreviewMode,
  MediaAssetRecord,
  MediaRef,
  ProjectionCompositeMode,
  ProjectionSides,
  ProjectorConfig,
  SceneObject,
  Transform,
  TransformMode,
  Vec3,
  ViewPreset,
  AnalysisQuality,
  CalculationTargetSide,
} from '../types';
import { applyLookAtToProjector } from '../optics/lookAt';
import { validateOptics } from '../optics/validate';
import { computeNominalProjection } from '../optics/nominal';
import {
  collectAlignedProjectorLayouts,
  computePlanarFootprint,
  computeCurvedFootprint,
  computeAlignedOverlap,
  computeCurvedOverlap,
  computeSampledCoverageAnalysis,
} from '../coverage';
import { DEFAULT_BLEND_EDGES, DEFAULT_BLEND_GAMMA, MAX_PROJECTORS, PROJECTOR_PALETTE } from '../types';
import {
  activeTrack,
  changeMappingKind,
  createDirectMapping,
  createLayer,
  createMapping,
  createPerspectiveMapping,
  isScreen,
  newId,
  pruneMappingRefs,
  updateActiveTrack,
} from '../mapping/model';
import { deriveAutoBlendEdgesFromOverlap } from '../blending/autoBlend';
import { eulerYXZToQuaternion } from '../utils/euler';
import {
  buildInitialPersistedState,
  defaultPersistedSlice,
  sliceToSnapshot,
  snapshotToSlice,
  type PersistedStateSlice,
} from './persistenceHelpers';
import { clampPanelWidth, clampFloatPosition, FLOATING_PANEL_HEIGHT } from '../ui/panelLayout';
import {
  appendHistory,
  captureSceneHistory,
  type SceneHistorySnapshot,
} from './history';
import {
  buildCalculationCsv,
  buildCalculationHtml,
  downloadTextFile,
} from '../persistence/reportExport';
import type { BlendSettings, ProjectorWarp } from '../types';
import { DEFAULT_PROJECTOR_WARP } from '../types';
import { computeBlendAnalysis, type BlendAnalysisResult } from '../blending/blendAnalysis';
import { normalizeBlendSettings } from '../blending/advancedBlend';
import {
  getCalculationTargetInfo,
  getCalculationTargetObject,
  reconcileReliabilityIds,
} from './reliabilitySettings';

export type StudioTab = 'blend' | 'mappings' | 'warp' | 'outputs';

interface AppState extends PersistedStateSlice {
  /** v2: sampled blend uniformity on the calculation target. */
  blendAnalysis: BlendAnalysisResult | null;
  uvEditorPanelVisible: boolean;
  studioTab: StudioTab;
  setStudioTab: (tab: StudioTab) => void;
  openStudioTab: (tab: StudioTab) => void;
  setUvEditorPanelVisible: (visible: boolean) => void;
  toggleUvEditorPanel: () => void;
  setBlendSettings: (patch: Partial<BlendSettings>) => void;
  updateProjectorWarp: (id: string, warp: Partial<ProjectorWarp>, recordHistory?: boolean) => void;
  resetProjectorWarp: (id: string) => void;
  selectedLayerId: string | null;
  selectedMappingId: string | null;
  layersPanelVisible: boolean;
  rasterPreviewPanelVisible: boolean;
  rasterPreviewRevision: number;
  projectMessage: string | null;
  measureMode: boolean;
  measurePoints: [Vec3 | null, Vec3 | null];
  historyPast: SceneHistorySnapshot[];
  historyFuture: SceneHistorySnapshot[];
  frameTimeMs: number;
  webgl2Available: boolean | null;
  calculationResults: CalculationResults;
  shaderWarning: string | null;
  showProjectionBeam: boolean;
  setSelectedObject: (id: string | null) => void;
  setSelectedProjector: (id: string) => void;
  updateProjector: (id: string, patch: Partial<ProjectorConfig>) => void;
  updateProjectorOptics: (id: string, patch: Partial<ProjectorConfig['optics']>) => void;
  pushSceneHistoryCheckpoint: () => void;
  updateSceneObjectTransform: (
    id: string,
    patch: { position?: SceneObject['transform']['position']; quaternion?: SceneObject['transform']['quaternion'] },
  ) => void;
  updateSceneObjectFlags: (
    id: string,
    patch: Partial<
      Pick<SceneObject, 'visibleInEditor' | 'receivesProjection' | 'blocksProjection' | 'projectionSides'>
    >,
  ) => void;
  updateSceneObjectDimensions: (
    id: string,
    patch: {
      dimensions?: Partial<SceneObject['dimensions']>;
      curved?: Partial<NonNullable<SceneObject['curved']>>;
      modelScale?: number;
    },
  ) => void;
  removeSceneObject: (id: string) => void;
  setDisplayUnit: (u: DisplayUnit) => void;
  setViewPreset: (preset: ViewPreset) => void;
  setMaterialPreviewMode: (mode: MaterialPreviewMode) => void;
  // v4 mappings
  addMapping: (kind: MappingKind, screenIds?: string[]) => void;
  updateMapping: (id: string, patch: Partial<Mapping>, recordHistory?: boolean) => void;
  setMappingKind: (id: string, kind: MappingKind) => void;
  duplicateMapping: (id: string) => void;
  removeMapping: (id: string) => void;
  setSelectedMappingId: (id: string | null) => void;
  // v4 layers
  addLayer: (media: MediaRef, mappingId?: string | null) => void;
  updateLayer: (id: string, patch: Partial<Layer>, recordHistory?: boolean) => void;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  importLayerMedia: (file: File, kind: 'image' | 'video') => Promise<void>;
  setSelectedLayerId: (id: string | null) => void;
  setLayersPanelVisible: (visible: boolean) => void;
  toggleLayersPanel: () => void;
  setRasterPreviewPanelVisible: (visible: boolean) => void;
  toggleRasterPreviewPanel: () => void;
  bumpRasterPreviewRevision: () => void;
  setCalculationTargetId: (id: string | null) => void;
  setAnalysisQuality: (quality: AnalysisQuality) => void;
  setCalculationTargetSide: (side: CalculationTargetSide) => void;
  setShowProjectionBeam: (show: boolean) => void;
  toggleProjectionBeam: () => void;
  setProjectionCompositeMode: (mode: ProjectionCompositeMode) => void;
  addProjector: () => void;
  autoBlendFromOverlap: () => void;
  removeProjector: (id: string) => void;
  setMeasureMode: (enabled: boolean) => void;
  addMeasurePoint: (point: Vec3) => void;
  clearMeasurePoints: () => void;
  undo: () => void;
  redo: () => void;
  exportCalculationCsv: () => void;
  exportCalculationHtml: () => void;
  setFrameTimeMs: (ms: number) => void;
  setWebgl2Available: (available: boolean) => void;
  setShaderWarning: (warning: string | null) => void;
  setLeftPanelVisible: (visible: boolean) => void;
  setRightPanelVisible: (visible: boolean) => void;
  setBottomPanelVisible: (visible: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  resizeLeftPanelBy: (delta: number) => void;
  resizeRightPanelBy: (delta: number) => void;
  popOutLeftPanel: () => void;
  popOutRightPanel: () => void;
  dockLeftPanel: () => void;
  dockRightPanel: () => void;
  moveLeftPanelFloat: (x: number, y: number) => void;
  moveRightPanelFloat: (x: number, y: number) => void;
  setTransformMode: (mode: TransformMode) => void;
  recomputeCalculations: () => void;
  addBox: () => void;
  addCurvedScreen: () => void;
  addLedWall: () => void;
  updateSceneObjectLedWall: (
    id: string,
    patch: {
      pixelResolution?: Partial<{ width: number; height: number }>;
      projectionSides?: ProjectionSides;
    },
  ) => void;
  importFile: (file: File, modelScale?: number) => Promise<void>;
  getSnapshot: () => ProjectSnapshot;
  newProject: () => void;
  saveProjectToFile: () => void;
  loadProjectFromFile: (text: string) => Promise<void>;
  clearProjectMessage: () => void;
}

function buildWorldMatrix(transform: Transform): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(
    transform.position.x,
    transform.position.y,
    transform.position.z,
  );
  const quaternion = new THREE.Quaternion(...transform.quaternion);
  matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  return matrix;
}

function pushSceneHistory(get: () => AppState, set: (partial: Partial<AppState>) => void): void {
  const state = get();
  set({ historyPast: appendHistory(state.historyPast, captureSceneHistory(state)) });
}

function restoreSceneHistory(
  snapshot: SceneHistorySnapshot,
  set: (partial: Partial<AppState>) => void,
): void {
  set({
    sceneObjects: snapshot.sceneObjects,
    projectors: snapshot.projectors,
    mediaAssets: snapshot.mediaAssets,
    show: snapshot.show,
    calculationTargetId: snapshot.calculationTargetId,
    blendSettings: snapshot.blendSettings,
  });
}

function applyReliabilityReconcile(set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void, get: () => AppState): void {
  const state = get();
  const next = reconcileReliabilityIds(state);
  const mappings = pruneMappingRefs(state.show.mappings, state.sceneObjects, state.projectors);
  if (next.calculationTargetId !== state.calculationTargetId) set(next);
  if (mappings !== state.show.mappings) set({ show: { ...state.show, mappings } });
}

function buildReportContext(state: AppState) {
  return {
    projectName: state.projectName,
    displayUnit: state.displayUnit,
    projectors: state.projectors,
    calculationResults: state.calculationResults,
  };
}

function pickPersistedFields(state: AppState): PersistedStateSlice {
  return {
    projectName: state.projectName,
    sceneObjects: state.sceneObjects,
    projectors: state.projectors,
    mediaAssets: state.mediaAssets,
    materialPreviewMode: state.materialPreviewMode,
    projectionCompositeMode: state.projectionCompositeMode,
    show: state.show,
    calculationTargetId: state.calculationTargetId,
    analysisQuality: state.analysisQuality,
    calculationTargetSide: state.calculationTargetSide,
    blendSettings: state.blendSettings,
    selectedObjectId: state.selectedObjectId,
    selectedProjectorId: state.selectedProjectorId,
    displayUnit: state.displayUnit,
    viewPreset: state.viewPreset,
    transformMode: state.transformMode,
    leftPanelVisible: state.leftPanelVisible,
    rightPanelVisible: state.rightPanelVisible,
    bottomPanelVisible: state.bottomPanelVisible,
    leftPanelWidth: state.leftPanelWidth,
    rightPanelWidth: state.rightPanelWidth,
    leftPanelPoppedOut: state.leftPanelPoppedOut,
    rightPanelPoppedOut: state.rightPanelPoppedOut,
    leftPanelFloat: state.leftPanelFloat,
    rightPanelFloat: state.rightPanelFloat,
  };
}

const initial = buildInitialPersistedState();

function defaultRect(screenId: string) {
  return {
    screenId,
    projection: 'meshUv' as const,
    region: { x: 0, y: 0, width: 1, height: 1 },
    rotationDeg: 0,
    flipU: false,
    flipV: false,
    repeatU: 1,
    repeatV: 1,
    wrap: 'clamp' as const,
  };
}

/** Mapping a new layer lands on: the selected mapping, else the first one. */
function defaultMappingId(state: AppState): string | null {
  const ids = state.show.mappings.map((m) => m.id);
  if (state.selectedMappingId && ids.includes(state.selectedMappingId)) return state.selectedMappingId;
  return ids[0] ?? null;
}

/** New screens get a Direct mapping named after them. */
function addDirectMappingFor(
  objectId: string,
  get: () => AppState,
  set: (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void,
): void {
  const obj = get().sceneObjects.find((o) => o.id === objectId);
  if (!obj || !isScreen(obj)) return;
  const mapping = createDirectMapping(obj);
  set((s) => ({ show: { ...s.show, mappings: [...s.show.mappings, mapping] }, selectedMappingId: mapping.id }));
}

export const useAppStore = create<AppState>((set, get) => ({
  projectName: initial.projectName,
  projectMessage: initial.projectName !== 'Default Scene' ? 'Restored last autosaved project' : null,
  sceneObjects: initial.sceneObjects,
  projectors: initial.projectors,
  mediaAssets: initial.mediaAssets,
  materialPreviewMode: initial.materialPreviewMode,
  projectionCompositeMode: initial.projectionCompositeMode,
  show: initial.show,
  selectedLayerId: activeTrack(initial.show).layers[0]?.id ?? null,
  selectedMappingId: initial.show.mappings[0]?.id ?? null,
  layersPanelVisible: false,
  rasterPreviewPanelVisible: false,
  rasterPreviewRevision: 0,
  calculationTargetId: initial.calculationTargetId,
  analysisQuality: initial.analysisQuality,
  calculationTargetSide: initial.calculationTargetSide,
  blendSettings: initial.blendSettings,
  blendAnalysis: null,
  uvEditorPanelVisible: false,
  studioTab: 'blend',
  setStudioTab: (tab) => set({ studioTab: tab }),
  openStudioTab: (tab) => set({ studioTab: tab, uvEditorPanelVisible: true }),
  setUvEditorPanelVisible: (visible) => set({ uvEditorPanelVisible: visible }),
  toggleUvEditorPanel: () => set((s) => ({ uvEditorPanelVisible: !s.uvEditorPanelVisible })),
  setBlendSettings: (patch) => {
    pushSceneHistory(get, set);
    set((s) => ({ blendSettings: normalizeBlendSettings({ ...s.blendSettings, ...patch }) }));
    get().recomputeCalculations();
  },
  updateProjectorWarp: (id, warp, recordHistory = true) => {
    if (recordHistory) pushSceneHistory(get, set);
    set((s) => ({
      projectors: s.projectors.map((p) => {
        if (p.id !== id) return p;
        const current = p.warp ?? structuredClone(DEFAULT_PROJECTOR_WARP);
        return { ...p, warp: { ...current, ...warp } };
      }),
    }));
    get().recomputeCalculations();
  },
  resetProjectorWarp: (id) => {
    pushSceneHistory(get, set);
    set((s) => ({
      projectors: s.projectors.map((p) =>
        p.id === id ? { ...p, warp: structuredClone(DEFAULT_PROJECTOR_WARP) } : p,
      ),
    }));
    get().recomputeCalculations();
  },
  selectedObjectId: initial.selectedObjectId,
  selectedProjectorId: initial.selectedProjectorId,
  displayUnit: initial.displayUnit,
  viewPreset: initial.viewPreset,
  measureMode: false,
  measurePoints: [null, null],
  historyPast: [],
  historyFuture: [],
  frameTimeMs: 0,
  webgl2Available: null,
  calculationResults: {
    nominal: null,
    footprint: null,
    opticsError: null,
    overlap: null,
    coverageAnalysis: null,
    calculationTarget: null,
  },
  shaderWarning: null,
  leftPanelVisible: initial.leftPanelVisible,
  rightPanelVisible: initial.rightPanelVisible,
  bottomPanelVisible: initial.bottomPanelVisible,
  leftPanelWidth: initial.leftPanelWidth,
  rightPanelWidth: initial.rightPanelWidth,
  leftPanelPoppedOut: initial.leftPanelPoppedOut,
  rightPanelPoppedOut: initial.rightPanelPoppedOut,
  leftPanelFloat: initial.leftPanelFloat,
  rightPanelFloat: initial.rightPanelFloat,
  transformMode: initial.transformMode,
  showProjectionBeam: false,
  setSelectedObject: (id) => set({ selectedObjectId: id }),
  setSelectedProjector: (id) => set({ selectedProjectorId: id, selectedObjectId: id }),
  updateProjector: (id, patch) => {
    set((s) => ({
      projectors: s.projectors.map((p) => {
        if (p.id !== id) return p;
        const merged = { ...p, ...patch };
        if (!merged.lookAtEnabled) return merged;
        if (
          patch.lookAtEnabled === true ||
          patch.lookAtTarget !== undefined ||
          patch.transform?.position !== undefined
        ) {
          return applyLookAtToProjector(merged);
        }
        return merged;
      }),
    }));
    get().recomputeCalculations();
  },
  updateProjectorOptics: (id, patch) => {
    const state = get();
    const proj = state.projectors.find((p) => p.id === id);
    if (!proj) return;
    const next = { ...proj.optics, ...patch };
    const v = validateOptics(next);
    if (!v.valid) {
      set({ calculationResults: { ...state.calculationResults, opticsError: v.error ?? 'Invalid optics' } });
      return;
    }
    pushSceneHistory(get, set);
    set((s) => ({
      projectors: s.projectors.map((p) => (p.id === id ? { ...p, optics: next } : p)),
      calculationResults: { ...s.calculationResults, opticsError: null },
    }));
    get().recomputeCalculations();
  },
  updateSceneObjectTransform: (id, patch) => {
    set((s) => ({
      sceneObjects: s.sceneObjects.map((obj) => {
        if (obj.id !== id) return obj;
        return {
          ...obj,
          transform: {
            position: patch.position ?? obj.transform.position,
            quaternion: patch.quaternion ?? obj.transform.quaternion,
          },
        };
      }),
    }));
    get().recomputeCalculations();
  },
  updateSceneObjectFlags: (id, patch) => {
    pushSceneHistory(get, set);
    set((s) => ({
      sceneObjects: s.sceneObjects.map((obj) => (obj.id === id ? { ...obj, ...patch } : obj)),
    }));
    applyReliabilityReconcile(set, get);
    get().recomputeCalculations();
  },
  updateSceneObjectDimensions: (id, patch) => {
    pushSceneHistory(get, set);
    set((s) => ({
      sceneObjects: s.sceneObjects.map((obj) => {
        if (obj.id !== id) return obj;
        const nextDimensions = patch.dimensions
          ? { ...obj.dimensions, ...patch.dimensions }
          : obj.dimensions;
        const baseCurved = obj.curved ?? {
          radius: 4,
          arcAngleDeg: 90,
          height: obj.dimensions.height,
        };
        const nextCurved = patch.curved ? { ...baseCurved, ...patch.curved } : obj.curved;
        return {
          ...obj,
          dimensions: nextDimensions,
          curved: nextCurved,
          modelScale: patch.modelScale ?? obj.modelScale,
        };
      }),
    }));
    applyReliabilityReconcile(set, get);
    get().recomputeCalculations();
  },
  removeSceneObject: (id) => {
    const state = get();
    if (state.sceneObjects.length <= 1) {
      set({ projectMessage: 'At least one scene object is required' });
      return;
    }
    const target = state.sceneObjects.find((o) => o.id === id);
    if (!target) return;
    if (!window.confirm(`Delete "${target.name}"?`)) return;

    pushSceneHistory(get, set);
    const next = state.sceneObjects.filter((o) => o.id !== id);
    let selectedObjectId = state.selectedObjectId;
    if (selectedObjectId === id) {
      selectedObjectId = next[0]?.id ?? null;
    }

    set({
      sceneObjects: next,
      selectedObjectId,
      projectMessage: `Deleted ${target.name}`,
    });
    applyReliabilityReconcile(set, get);
    get().recomputeCalculations();
  },
  pushSceneHistoryCheckpoint: () => pushSceneHistory(get, set),
  setDisplayUnit: (u) => set({ displayUnit: u }),
  setViewPreset: (preset) => set({ viewPreset: preset }),
  setMaterialPreviewMode: (mode) => set({ materialPreviewMode: mode }),
  addMapping: (kind, screenIds) => {
    const state = get();
    const ids = screenIds ?? state.sceneObjects.filter(isScreen).map((o) => o.id);
    pushSceneHistory(get, set);
    const mapping = createMapping(kind, ids, state.projectors);
    if (kind === 'feed') mapping.feed = { rects: ids.map((id) => ({ ...defaultRect(id) })) };
    set((s) => ({
      show: { ...s.show, mappings: [...s.show.mappings, mapping] },
      selectedMappingId: mapping.id,
      projectMessage: `Added ${mapping.name}`,
    }));
  },
  updateMapping: (id, patch, recordHistory = true) => {
    if (recordHistory) pushSceneHistory(get, set);
    set((s) => ({
      show: { ...s.show, mappings: s.show.mappings.map((m) => (m.id === id ? { ...m, ...patch, id } : m)) },
    }));
  },
  setMappingKind: (id, kind) => {
    pushSceneHistory(get, set);
    set((s) => ({
      show: {
        ...s.show,
        mappings: s.show.mappings.map((m) => (m.id === id ? changeMappingKind(m, kind, s.projectors) : m)),
      },
    }));
  },
  duplicateMapping: (id) => {
    const source = get().show.mappings.find((m) => m.id === id);
    if (!source) return;
    pushSceneHistory(get, set);
    const copy: Mapping = { ...structuredClone(source), id: newId('map'), name: `${source.name} copy` };
    set((s) => {
      const index = s.show.mappings.findIndex((m) => m.id === id);
      const mappings = [...s.show.mappings];
      mappings.splice(index + 1, 0, copy);
      return { show: { ...s.show, mappings }, selectedMappingId: copy.id };
    });
  },
  removeMapping: (id) => {
    const target = get().show.mappings.find((m) => m.id === id);
    if (!target) return;
    pushSceneHistory(get, set);
    set((s) => {
      const mappings = s.show.mappings.filter((m) => m.id !== id);
      const show = updateActiveTrack({ ...s.show, mappings }, (track) => ({
        ...track,
        layers: track.layers.map((l) => (l.mappingId === id ? { ...l, mappingId: null } : l)),
      }));
      return {
        show,
        selectedMappingId: s.selectedMappingId === id ? (mappings[0]?.id ?? null) : s.selectedMappingId,
        projectMessage: `Deleted ${target.name}`,
      };
    });
  },
  setSelectedMappingId: (id) => set({ selectedMappingId: id }),
  addLayer: (media, mappingId) => {
    const state = get();
    const mapId = mappingId === undefined ? defaultMappingId(state) : mappingId;
    pushSceneHistory(get, set);
    const layer = createLayer(media, mapId, { durationSec: activeTrack(state.show).durationSec });
    set((s) => ({
      show: updateActiveTrack(s.show, (track) => ({ ...track, layers: [...track.layers, layer] })),
      selectedLayerId: layer.id,
      selectedObjectId: null,
    }));
  },
  updateLayer: (id, patch, recordHistory = true) => {
    if (recordHistory) pushSceneHistory(get, set);
    set((s) => ({
      show: updateActiveTrack(s.show, (track) => ({
        ...track,
        layers: track.layers.map((l) => (l.id === id ? { ...l, ...patch, id } : l)),
      })),
    }));
  },
  removeLayer: (id) => {
    pushSceneHistory(get, set);
    set((s) => {
      const layers = activeTrack(s.show).layers.filter((l) => l.id !== id);
      return {
        show: updateActiveTrack(s.show, (track) => ({ ...track, layers })),
        selectedLayerId: s.selectedLayerId === id ? (layers[layers.length - 1]?.id ?? null) : s.selectedLayerId,
      };
    });
  },
  duplicateLayer: (id) => {
    const source = activeTrack(get().show).layers.find((l) => l.id === id);
    if (!source) return;
    pushSceneHistory(get, set);
    const copy: Layer = { ...structuredClone(source), id: newId('layer'), name: `${source.name} copy` };
    set((s) => ({
      show: updateActiveTrack(s.show, (track) => {
        const layers = [...track.layers];
        layers.splice(layers.findIndex((l) => l.id === id) + 1, 0, copy);
        return { ...track, layers };
      }),
      selectedLayerId: copy.id,
    }));
  },
  moveLayer: (id, direction) => {
    pushSceneHistory(get, set);
    set((s) => ({
      show: updateActiveTrack(s.show, (track) => {
        const layers = [...track.layers];
        const index = layers.findIndex((l) => l.id === id);
        const target = direction === 'up' ? index + 1 : index - 1;
        if (index < 0 || target < 0 || target >= layers.length) return track;
        const [item] = layers.splice(index, 1);
        layers.splice(target, 0, item);
        return { ...track, layers };
      }),
    }));
  },
  importLayerMedia: async (file, kind) => {
    try {
      const record = await importMediaBlob(file, file.name, kind, file.type || 'application/octet-stream');
      set((s) => ({ mediaAssets: [...s.mediaAssets, record] }));
      get().addLayer({ kind, assetId: record.id });
      const layerId = get().selectedLayerId;
      if (layerId) get().updateLayer(layerId, { name: file.name }, false);
      set({ projectMessage: `Added ${kind} layer "${file.name}"` });
    } catch (err) {
      set({ projectMessage: err instanceof Error ? err.message : 'Import failed' });
    }
  },
  setSelectedLayerId: (id) => set(id ? { selectedLayerId: id, selectedObjectId: null } : { selectedLayerId: null }),
  setLayersPanelVisible: (visible) => set({ layersPanelVisible: visible }),
  toggleLayersPanel: () => set((s) => ({ layersPanelVisible: !s.layersPanelVisible })),
  setRasterPreviewPanelVisible: (visible) => set({ rasterPreviewPanelVisible: visible }),
  toggleRasterPreviewPanel: () =>
    set((s) => ({ rasterPreviewPanelVisible: !s.rasterPreviewPanelVisible })),
  bumpRasterPreviewRevision: () =>
    set((s) => ({ rasterPreviewRevision: s.rasterPreviewRevision + 1 })),
  setCalculationTargetId: (id) => {
    pushSceneHistory(get, set);
    set({ calculationTargetId: id });
    get().recomputeCalculations();
  },
  setAnalysisQuality: (quality) => {
    set({ analysisQuality: quality });
    get().recomputeCalculations();
  },
  setCalculationTargetSide: (side) => {
    set({ calculationTargetSide: side });
    get().recomputeCalculations();
  },
  setShowProjectionBeam: (show) => set({ showProjectionBeam: show }),
  toggleProjectionBeam: () => set((s) => ({ showProjectionBeam: !s.showProjectionBeam })),
  setProjectionCompositeMode: (mode) => set({ projectionCompositeMode: mode }),
  addProjector: () => {
    const state = get();
    if (state.projectors.length >= MAX_PROJECTORS) {
      set({ projectMessage: `Maximum ${MAX_PROJECTORS} projectors` });
      return;
    }
    pushSceneHistory(get, set);
    const index = state.projectors.length;
    const id = `proj-${Date.now()}`;
    const offsetX = index * 1.6;
    const newProjector: ProjectorConfig = {
      id,
      name: `Projector ${index + 1}`,
      enabled: true,
      color: PROJECTOR_PALETTE[index % PROJECTOR_PALETTE.length],
      transform: {
        position: { x: offsetX, y: 1.5, z: 6 },
        quaternion: eulerYXZToQuaternion(0, 0, 0),
      },
      optics: {
        throwRatio: 1.5,
        resolution: { width: 1920, height: 1080 },
        aspectRatio: 16 / 9,
        lensShiftH: 0,
        lensShiftV: 0,
        nearLimit: 0.1,
        farLimit: 100,
      },
      brightness: 1,
      blendEdges: { ...DEFAULT_BLEND_EDGES },
      blendGamma: DEFAULT_BLEND_GAMMA,
      outerEdgeFade: false,
      lookAtEnabled: true,
      lookAtTarget: { x: 0, y: 1.5, z: 0 },
    };
    const switchToMultiView =
      state.projectors.length === 1 && state.projectionCompositeMode === 'solo';
    const lockedMapping = createPerspectiveMapping(
      newProjector,
      state.sceneObjects.filter((o) => o.receivesProjection && o.type !== 'ledWall').map((o) => o.id),
    );
    set((s) => ({
      projectors: [...s.projectors, newProjector],
      show: { ...s.show, mappings: [...s.show.mappings, lockedMapping] },
      selectedObjectId: id,
      selectedProjectorId: id,
      projectionCompositeMode: switchToMultiView ? 'unblended' : s.projectionCompositeMode,
      projectMessage: switchToMultiView
        ? `Added ${newProjector.name} — switched Composite to Raw (all projectors visible)`
        : `Added ${newProjector.name}`,
    }));
    get().recomputeCalculations();
  },
  autoBlendFromOverlap: () => {
    const state = get();
    const enabled = state.projectors.filter((p) => p.enabled);
    if (enabled.length < 2) {
      set({ projectMessage: 'Auto blend needs at least 2 enabled projectors' });
      return;
    }

    const screen = getCalculationTargetObject(state.sceneObjects, state.calculationTargetId);
    if (!screen || screen.type !== 'screen') {
      set({ projectMessage: 'Auto blend requires a flat screen as the calculation target' });
      return;
    }

    const screenMatrix = buildWorldMatrix(screen.transform);
    const center = new THREE.Vector3().setFromMatrixPosition(screenMatrix);
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(screenMatrix))
      .normalize();
    const screenParams = {
      center,
      normal,
      width: screen.dimensions.width,
      height: screen.dimensions.height,
      matrix: screenMatrix,
    };

    const layouts = collectAlignedProjectorLayouts(state.projectors, screenParams);
    const overlap = computeAlignedOverlap(state.projectors, screenParams);
    const patch = deriveAutoBlendEdgesFromOverlap(layouts, overlap?.pairwise ?? []);
    if (Object.keys(patch).length === 0) {
      set({ projectMessage: 'No measurable overlap on the calculation target' });
      return;
    }

    pushSceneHistory(get, set);
    set((s) => ({
      projectors: s.projectors.map((p) =>
        patch[p.id] ? { ...p, blendEdges: patch[p.id] } : p,
      ),
      projectMessage: 'Applied auto blend edges from overlap',
    }));
    get().recomputeCalculations();
  },
  removeProjector: (id) => {
    const state = get();
    if (state.projectors.length <= 1) {
      set({ projectMessage: 'At least one projector is required' });
      return;
    }
    const target = state.projectors.find((p) => p.id === id);
    if (!target) return;
    if (!window.confirm(`Delete "${target.name}"?`)) return;
    pushSceneHistory(get, set);
    const next = state.projectors.filter((p) => p.id !== id);
    const selectedProjectorId =
      state.selectedProjectorId === id ? next[0].id : state.selectedProjectorId;
    const selectedObjectId =
      state.selectedObjectId === id ? selectedProjectorId : state.selectedObjectId;
    set({
      projectors: next,
      selectedProjectorId,
      selectedObjectId,
      projectMessage: `Deleted ${target.name}`,
    });
    applyReliabilityReconcile(set, get);
    get().recomputeCalculations();
  },
  setMeasureMode: (enabled) =>
    set({
      measureMode: enabled,
      measurePoints: enabled ? get().measurePoints : [null, null],
    }),
  addMeasurePoint: (point) =>
    set((s) => {
      const [a, b] = s.measurePoints;
      if (a && b) return { measurePoints: [point, null] as [Vec3 | null, Vec3 | null] };
      if (!a) return { measurePoints: [point, null] as [Vec3 | null, Vec3 | null] };
      return { measurePoints: [a, point] as [Vec3 | null, Vec3 | null] };
    }),
  clearMeasurePoints: () => set({ measurePoints: [null, null] }),
  undo: () => {
    const state = get();
    if (state.historyPast.length === 0) return;
    const previous = state.historyPast[state.historyPast.length - 1];
    const current = captureSceneHistory(state);
    restoreSceneHistory(previous, set);
    set({
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [current, ...state.historyFuture],
      projectMessage: 'Undo',
    });
    get().recomputeCalculations();
  },
  redo: () => {
    const state = get();
    if (state.historyFuture.length === 0) return;
    const [next, ...rest] = state.historyFuture;
    const current = captureSceneHistory(state);
    restoreSceneHistory(next, set);
    set({
      historyPast: appendHistory(state.historyPast, current),
      historyFuture: rest,
      projectMessage: 'Redo',
    });
    get().recomputeCalculations();
  },
  exportCalculationCsv: () => {
    const state = get();
    const csv = buildCalculationCsv(buildReportContext(state));
    const filename = `${state.projectName.replace(/\s+/g, '-').toLowerCase() || 'projectionlab'}-report.csv`;
    downloadTextFile(csv, filename, 'text/csv');
    set({ projectMessage: 'Exported CSV report' });
  },
  exportCalculationHtml: () => {
    const state = get();
    const html = buildCalculationHtml(buildReportContext(state));
    const filename = `${state.projectName.replace(/\s+/g, '-').toLowerCase() || 'projectionlab'}-report.html`;
    downloadTextFile(html, filename, 'text/html');
    set({ projectMessage: 'Exported HTML report' });
  },
  setFrameTimeMs: (ms) => set({ frameTimeMs: ms }),
  setWebgl2Available: (available) => set({ webgl2Available: available }),
  setShaderWarning: (warning) => set({ shaderWarning: warning }),
  setLeftPanelVisible: (visible) => set({ leftPanelVisible: visible }),
  setRightPanelVisible: (visible) => set({ rightPanelVisible: visible }),
  setBottomPanelVisible: (visible) => set({ bottomPanelVisible: visible }),
  toggleLeftPanel: () => set((s) => ({ leftPanelVisible: !s.leftPanelVisible })),
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  toggleBottomPanel: () => set((s) => ({ bottomPanelVisible: !s.bottomPanelVisible })),
  resizeLeftPanelBy: (delta) =>
    set((s) => ({ leftPanelWidth: clampPanelWidth(s.leftPanelWidth + delta) })),
  resizeRightPanelBy: (delta) =>
    set((s) => ({ rightPanelWidth: clampPanelWidth(s.rightPanelWidth + delta) })),
  popOutLeftPanel: () =>
    set((s) => ({
      leftPanelVisible: true,
      leftPanelPoppedOut: true,
      leftPanelFloat: clampFloatPosition(
        s.leftPanelFloat.x,
        s.leftPanelFloat.y,
        s.leftPanelWidth,
        FLOATING_PANEL_HEIGHT,
      ),
    })),
  popOutRightPanel: () =>
    set((s) => ({
      rightPanelVisible: true,
      rightPanelPoppedOut: true,
      rightPanelFloat: clampFloatPosition(
        s.rightPanelFloat.x,
        s.rightPanelFloat.y,
        s.rightPanelWidth,
        FLOATING_PANEL_HEIGHT,
      ),
    })),
  dockLeftPanel: () => set({ leftPanelPoppedOut: false }),
  dockRightPanel: () => set({ rightPanelPoppedOut: false }),
  moveLeftPanelFloat: (x, y) =>
    set((s) => ({
      leftPanelFloat: clampFloatPosition(x, y, s.leftPanelWidth, FLOATING_PANEL_HEIGHT),
    })),
  moveRightPanelFloat: (x, y) =>
    set((s) => ({
      rightPanelFloat: clampFloatPosition(x, y, s.rightPanelWidth, FLOATING_PANEL_HEIGHT),
    })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  recomputeCalculations: () => {
    {
      const st = get();
      const target = getCalculationTargetObject(st.sceneObjects, st.calculationTargetId);
      set({ blendAnalysis: computeBlendAnalysis(target ?? null, st.projectors, st.blendSettings) });
    }
    const { projectors, sceneObjects, selectedProjectorId, calculationTargetId, analysisQuality, calculationTargetSide } = get();
    const proj = projectors.find((p) => p.id === selectedProjectorId) ?? projectors[0];
    if (!proj) {
      set({
        calculationResults: {
          nominal: null,
          footprint: null,
          opticsError: null,
          overlap: null,
          coverageAnalysis: null,
          calculationTarget: null,
        },
      });
      return;
    }
    const v = validateOptics(proj.optics);
    if (!v.valid) return;

    const screen = getCalculationTargetObject(sceneObjects, calculationTargetId);
    const targetInfo = getCalculationTargetInfo(sceneObjects, calculationTargetId);

    if (!screen || !targetInfo) {
      set({
        calculationResults: {
          nominal: null,
          footprint: null,
          opticsError: null,
          overlap: null,
          coverageAnalysis: null,
          calculationTarget: null,
        },
      });
      return;
    }

    const worldMatrix = buildWorldMatrix(proj.transform);
    let footprint = null;
    let overlap = null;

    if (screen.type === 'screen') {
      const screenMatrix = buildWorldMatrix(screen.transform);
      const center = new THREE.Vector3().setFromMatrixPosition(screenMatrix);
      const normal = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(screenMatrix))
        .normalize();
      footprint = computePlanarFootprint(proj.optics, worldMatrix, {
        center,
        normal,
        width: screen.dimensions.width,
        height: screen.dimensions.height,
      });
      overlap = computeAlignedOverlap(projectors, {
        center,
        normal,
        width: screen.dimensions.width,
        height: screen.dimensions.height,
        matrix: screenMatrix,
      });
    } else if (screen.type === 'curvedScreen' && screen.curved) {
      const screenMatrix = buildWorldMatrix(screen.transform);
      const curvedSurface = {
        worldMatrix: screenMatrix,
        radius: screen.curved.radius,
        arcAngleDeg: screen.curved.arcAngleDeg,
        height: screen.curved.height,
      };
      footprint = computeCurvedFootprint(proj.optics, worldMatrix, curvedSurface);
      overlap = computeCurvedOverlap(projectors, curvedSurface);
    }

    const coverageAnalysis = computeSampledCoverageAnalysis({
      receiver: screen,
      sceneObjects,
      projectors,
      quality: analysisQuality,
      targetSide: calculationTargetSide,
    });

    const distance = footprint?.axialDistance ?? 6;
    const nominal = computeNominalProjection(proj.optics, distance);
    set({
      calculationResults: {
        nominal,
        footprint,
        opticsError: null,
        overlap,
        coverageAnalysis,
        calculationTarget: targetInfo,
      },
    });
  },
  addBox: () => {
    pushSceneHistory(get, set);
    const id = `box-${Date.now()}`;
    set((s) => ({
      sceneObjects: [
        ...s.sceneObjects,
        {
          id,
          name: 'Box',
          type: 'box' as const,
          transform: {
            position: { x: 0, y: 1, z: 3 },
            quaternion: [0, 0, 0, 1] as [number, number, number, number],
          },
          visibleInEditor: true,
          receivesProjection: false,
          blocksProjection: true,
          dimensions: { width: 1, height: 1, depth: 1 },
        },
      ],
    }));
    get().recomputeCalculations();
  },
  addCurvedScreen: () => {
    pushSceneHistory(get, set);
    const id = `curved-${Date.now()}`;
    set((s) => ({
      sceneObjects: [
        ...s.sceneObjects,
        {
          id,
          name: 'Curved Screen',
          type: 'curvedScreen' as const,
          transform: {
            position: { x: 0, y: 1.5, z: 0 },
            quaternion: eulerYXZToQuaternion(0, 0, 0),
          },
          visibleInEditor: true,
          receivesProjection: true,
          blocksProjection: false,
          dimensions: { width: 6, height: 3.375 },
          curved: { radius: 4, arcAngleDeg: 90, height: 3.375 },
        },
      ],
    }));
    addDirectMappingFor(id, get, set);
    get().recomputeCalculations();
  },
  addLedWall: () => {
    pushSceneHistory(get, set);
    const id = `ledwall-${Date.now()}`;
    set((s) => ({
      sceneObjects: [
        ...s.sceneObjects,
        {
          id,
          name: 'LED Wall',
          type: 'ledWall' as const,
          transform: {
            position: { x: 0, y: 2, z: -1 },
            quaternion: eulerYXZToQuaternion(0, 0, 0),
          },
          visibleInEditor: true,
          receivesProjection: false,
          blocksProjection: true,
          projectionSides: 'front',
          dimensions: { width: 4, height: 2.25 },
          ledWall: {
            pixelResolution: { width: 1920, height: 1080 },
          },
        },
      ],
      selectedObjectId: id,
      projectMessage: 'Added LED Wall with its own Direct mapping — put layers on it',
    }));
    addDirectMappingFor(id, get, set);
    get().recomputeCalculations();
  },
  updateSceneObjectLedWall: (id, patch) => {
    pushSceneHistory(get, set);
    set((s) => ({
      sceneObjects: s.sceneObjects.map((obj) => {
        if (obj.id !== id || obj.type !== 'ledWall') return obj;
        const base = obj.ledWall ?? { pixelResolution: { width: 1920, height: 1080 } };
        const nextLedWall = {
          pixelResolution: patch.pixelResolution
            ? { ...base.pixelResolution, ...patch.pixelResolution }
            : base.pixelResolution,
        };
        return {
          ...obj,
          projectionSides: patch.projectionSides ?? obj.projectionSides,
          ledWall: nextLedWall,
        };
      }),
    }));
    get().recomputeCalculations();
  },
  importFile: async (file, modelScale = 1) => {
    const kind = detectFileKind(file);
    if (!kind) {
      set({ projectMessage: `Unsupported file type: ${file.name}` });
      return;
    }

    try {
      const record = await importMediaBlob(file, file.name, kind, file.type || 'application/octet-stream');
      if (kind === 'model') pushSceneHistory(get, set);
      set((s) => ({ mediaAssets: [...s.mediaAssets, record] }));

      if (kind === 'model') {
        const id = `model-${Date.now()}`;
        set((s) => ({
          sceneObjects: [
            ...s.sceneObjects,
            {
              id,
              name: file.name.replace(/\.(glb|gltf|obj)$/i, ''),
              type: 'model' as const,
              transform: {
                position: { x: 0, y: 0, z: 0 },
                quaternion: eulerYXZToQuaternion(0, 0, 0),
              },
              visibleInEditor: true,
              receivesProjection: true,
              blocksProjection: true,
              dimensions: { width: 1, height: 1, depth: 1 },
              modelAssetId: record.id,
              modelScale,
            },
          ],
          projectMessage: `Imported model "${file.name}" at scale ${modelScale}`,
        }));
        addDirectMappingFor(id, get, set);
      } else {
        get().addLayer({ kind, assetId: record.id });
        const layerId = get().selectedLayerId;
        if (layerId) get().updateLayer(layerId, { name: file.name }, false);
        set({ projectMessage: `Imported ${kind} "${file.name}" as a layer` });
      }
    } catch (err) {
      set({ projectMessage: err instanceof Error ? err.message : 'Import failed' });
    }
  },
  getSnapshot: () => sliceToSnapshot(pickPersistedFields(get())),
  newProject: () => {
    const defaults = defaultPersistedSlice();
    set({
      ...defaults,
      selectedLayerId: activeTrack(defaults.show).layers[0]?.id ?? null,
      selectedMappingId: defaults.show.mappings[0]?.id ?? null,
      rasterPreviewPanelVisible: false,
      rasterPreviewRevision: 0,
      projectMessage: 'New project created',
      calculationResults: {
        nominal: null,
        footprint: null,
        opticsError: null,
        overlap: null,
        coverageAnalysis: null,
        calculationTarget: null,
      },
      measureMode: false,
      measurePoints: [null, null],
      historyPast: [],
      historyFuture: [],
    });
    transport.pause();
    transport.seek(0);
    clearAutosave();
    get().recomputeCalculations();
  },
  saveProjectToFile: () => {
    const snapshot = get().getSnapshot();
    downloadProjectFile(snapshot);
    writeAutosave(snapshot);
    set({ projectMessage: `Saved "${snapshot.name}" to file` });
  },
  loadProjectFromFile: async (text) => {
    try {
      const snapshot = parseProjectJson(text);
      const missing = await hydrateAssetsFromRecords(snapshot.mediaAssets);
      const slice = snapshotToSlice(snapshot);
      set({
        ...slice,
        selectedLayerId: activeTrack(slice.show).layers[0]?.id ?? null,
        selectedMappingId: slice.show.mappings[0]?.id ?? null,
        rasterPreviewPanelVisible: get().rasterPreviewPanelVisible,
        projectMessage:
          missing.length > 0
            ? `Loaded "${snapshot.name}" — missing assets: ${missing.join(', ')}`
            : `Loaded "${snapshot.name}"`,
        calculationResults: {
        nominal: null,
        footprint: null,
        opticsError: null,
        overlap: null,
        coverageAnalysis: null,
        calculationTarget: null,
      },
        measureMode: false,
        measurePoints: [null, null],
        historyPast: [],
        historyFuture: [],
      });
      transport.pause();
      transport.seek(0);
      writeAutosave(snapshot);
      get().recomputeCalculations();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load project';
      set({ projectMessage: message });
    }
  },
  clearProjectMessage: () => set({ projectMessage: null }),
}));

void hydrateAssetsFromRecords(initial.mediaAssets);

useAppStore.getState().recomputeCalculations();

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
useAppStore.subscribe((state) => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    writeAutosave(state.getSnapshot());
  }, 2000);
});

export function scheduleAutosaveNow(): void {
  writeAutosave(useAppStore.getState().getSnapshot());
}

export type { MediaAssetRecord };
