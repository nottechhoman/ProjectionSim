import { create } from 'zustand';
import * as THREE from 'three';
import { clearAutosave, downloadProjectFile, parseProjectJson, writeAutosave } from '../persistence';
import type { ProjectSnapshot } from '../persistence/projectSchema';
import {
  detectFileKind,
  hydrateAssetsFromRecords,
  importMediaBlob,
  mediaTextureCache,
} from '../media/assetImport';
import type {
  CalculationResults,
  DisplayUnit,
  MaterialPreviewMode,
  MediaAssetRecord,
  MediaFitMode,
  MediaSourceKind,
  ProjectionCompositeMode,
  ProjectorConfig,
  SceneObject,
  Transform,
  TransformMode,
  Vec3,
  ViewPreset,
} from '../types';
import { validateOptics } from '../optics/validate';
import { computeNominalProjection } from '../optics/nominal';
import { computePlanarFootprint, computeCurvedFootprint, computeAlignedOverlap } from '../coverage';
import { DEFAULT_BLEND_EDGES, MAX_PROJECTORS, PROJECTOR_PALETTE } from '../types';
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

interface AppState extends PersistedStateSlice {
  projectMessage: string | null;
  measureMode: boolean;
  measurePoints: [Vec3 | null, Vec3 | null];
  historyPast: SceneHistorySnapshot[];
  historyFuture: SceneHistorySnapshot[];
  frameTimeMs: number;
  webgl2Available: boolean | null;
  calculationResults: CalculationResults;
  shaderWarning: string | null;
  videoPlaying: boolean;
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
    patch: Partial<Pick<SceneObject, 'visibleInEditor' | 'receivesProjection' | 'blocksProjection'>>,
  ) => void;
  removeSceneObject: (id: string) => void;
  setDisplayUnit: (u: DisplayUnit) => void;
  setViewPreset: (preset: ViewPreset) => void;
  setMaterialPreviewMode: (mode: MaterialPreviewMode) => void;
  setShowProjectionBeam: (show: boolean) => void;
  toggleProjectionBeam: () => void;
  setProjectionCompositeMode: (mode: ProjectionCompositeMode) => void;
  addProjector: () => void;
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
  importFile: (file: File, modelScale?: number) => Promise<void>;
  setProjectorMedia: (
    projectorId: string,
    source: MediaSourceKind,
    assetId: string | null,
    fit?: MediaFitMode,
  ) => void;
  toggleVideoPlayback: () => void;
  seekVideo: (seconds: number) => void;
  setVideoMuted: (muted: boolean) => void;
  setVideoLoop: (loop: boolean) => void;
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

function findProjectionScreen(sceneObjects: SceneObject[]): SceneObject | undefined {
  return sceneObjects.find(
    (obj) => (obj.type === 'screen' || obj.type === 'curvedScreen') && obj.receivesProjection,
  );
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
  });
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

export const useAppStore = create<AppState>((set, get) => ({
  projectName: initial.projectName,
  projectMessage: initial.projectName !== 'Default Scene' ? 'Restored last autosaved project' : null,
  sceneObjects: initial.sceneObjects,
  projectors: initial.projectors,
  mediaAssets: initial.mediaAssets,
  materialPreviewMode: initial.materialPreviewMode,
  projectionCompositeMode: initial.projectionCompositeMode,
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
  calculationResults: { nominal: null, footprint: null, opticsError: null, overlap: null },
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
  videoPlaying: false,
  showProjectionBeam: false,
  setSelectedObject: (id) => set({ selectedObjectId: id }),
  setSelectedProjector: (id) => set({ selectedProjectorId: id, selectedObjectId: id }),
  updateProjector: (id, patch) => {
    set((s) => ({
      projectors: s.projectors.map((p) => (p.id === id ? { ...p, ...patch } : p)),
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
    get().recomputeCalculations();
  },
  pushSceneHistoryCheckpoint: () => pushSceneHistory(get, set),
  setDisplayUnit: (u) => set({ displayUnit: u }),
  setViewPreset: (preset) => set({ viewPreset: preset }),
  setMaterialPreviewMode: (mode) => set({ materialPreviewMode: mode }),
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
      testPattern: 'projectorId',
      brightness: 1,
      mediaSource: 'pattern',
      mediaAssetId: null,
      mediaFit: 'contain',
      blendEdges: { ...DEFAULT_BLEND_EDGES },
      outerEdgeFade: false,
    };
    set((s) => ({
      projectors: [...s.projectors, newProjector],
      selectedObjectId: id,
      selectedProjectorId: id,
      projectMessage: `Added ${newProjector.name}`,
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
    const { projectors, sceneObjects, selectedProjectorId } = get();
    const proj = projectors.find((p) => p.id === selectedProjectorId) ?? projectors[0];
    if (!proj) return;
    const v = validateOptics(proj.optics);
    if (!v.valid) return;

    const worldMatrix = buildWorldMatrix(proj.transform);
    const screen = findProjectionScreen(sceneObjects);
    let footprint = null;
    let overlap = null;

    if (screen && screen.type === 'screen') {
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
    } else if (screen && screen.type === 'curvedScreen' && screen.curved) {
      const screenMatrix = buildWorldMatrix(screen.transform);
      footprint = computeCurvedFootprint(proj.optics, worldMatrix, {
        worldMatrix: screenMatrix,
        radius: screen.curved.radius,
        arcAngleDeg: screen.curved.arcAngleDeg,
        height: screen.curved.height,
      });
    }

    const distance = footprint?.axialDistance ?? 6;
    const nominal = computeNominalProjection(proj.optics, distance);
    set({ calculationResults: { nominal, footprint, opticsError: null, overlap } });
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
      pushSceneHistory(get, set);
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
      } else {
        const proj =
          get().projectors.find((p) => p.id === get().selectedProjectorId) ?? get().projectors[0];
        if (proj) {
          get().setProjectorMedia(proj.id, kind, record.id);
        }
        set({ projectMessage: `Imported ${kind} "${file.name}"` });
      }
    } catch (err) {
      set({ projectMessage: err instanceof Error ? err.message : 'Import failed' });
    }
  },
  setProjectorMedia: (projectorId, source, assetId, fit) => {
    pushSceneHistory(get, set);
    set((s) => ({
      projectors: s.projectors.map((p) =>
        p.id === projectorId
          ? {
              ...p,
              mediaSource: source,
              mediaAssetId: assetId,
              mediaFit: fit ?? p.mediaFit,
            }
          : p,
      ),
    }));
  },
  toggleVideoPlayback: () => {
    const projId = get().selectedProjectorId;
    const proj = get().projectors.find((p) => p.id === projId);
    if (!proj?.mediaAssetId || proj.mediaSource !== 'video') return;
    const entry = mediaTextureCache.get(proj.mediaAssetId);
    if (!entry?.video) return;
    if (entry.video.paused) {
      void entry.video.play();
      set({ videoPlaying: true });
    } else {
      entry.video.pause();
      set({ videoPlaying: false });
    }
  },
  seekVideo: (seconds) => {
    const projId = get().selectedProjectorId;
    const proj = get().projectors.find((p) => p.id === projId);
    if (!proj?.mediaAssetId || proj.mediaSource !== 'video') return;
    const video = mediaTextureCache.get(proj.mediaAssetId)?.video;
    if (!video || !Number.isFinite(seconds)) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, seconds));
  },
  setVideoMuted: (muted) => {
    const projId = get().selectedProjectorId;
    const proj = get().projectors.find((p) => p.id === projId);
    if (!proj?.mediaAssetId || proj.mediaSource !== 'video') return;
    const video = mediaTextureCache.get(proj.mediaAssetId)?.video;
    if (!video) return;
    video.muted = muted;
  },
  setVideoLoop: (loop) => {
    const projId = get().selectedProjectorId;
    const proj = get().projectors.find((p) => p.id === projId);
    if (!proj?.mediaAssetId || proj.mediaSource !== 'video') return;
    const video = mediaTextureCache.get(proj.mediaAssetId)?.video;
    if (!video) return;
    video.loop = loop;
  },
  getSnapshot: () => sliceToSnapshot(pickPersistedFields(get())),
  newProject: () => {
    const defaults = defaultPersistedSlice();
    set({
      ...defaults,
      projectMessage: 'New project created',
      calculationResults: { nominal: null, footprint: null, opticsError: null, overlap: null },
      videoPlaying: false,
      measureMode: false,
      measurePoints: [null, null],
      historyPast: [],
      historyFuture: [],
    });
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
        projectMessage:
          missing.length > 0
            ? `Loaded "${snapshot.name}" — missing assets: ${missing.join(', ')}`
            : `Loaded "${snapshot.name}"`,
        calculationResults: { nominal: null, footprint: null, opticsError: null, overlap: null },
        videoPlaying: false,
        measureMode: false,
        measurePoints: [null, null],
        historyPast: [],
        historyFuture: [],
      });
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
