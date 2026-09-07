import { create } from 'zustand';
import * as THREE from 'three';
import { clearAutosave, downloadProjectFile, parseProjectJson, writeAutosave } from '../persistence';
import type { ProjectSnapshot } from '../persistence/projectSchema';
import type {
  CalculationResults,
  DisplayUnit,
  ProjectorConfig,
  SceneObject,
  Transform,
  TransformMode,
  ViewPreset,
} from '../types';
import { validateOptics } from '../optics/validate';
import { computeNominalProjection } from '../optics/nominal';
import { computePlanarFootprint } from '../coverage';
import {
  buildInitialPersistedState,
  defaultPersistedSlice,
  sliceToSnapshot,
  snapshotToSlice,
} from './persistenceHelpers';

interface AppState {
  projectName: string;
  projectMessage: string | null;
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  selectedObjectId: string | null;
  selectedProjectorId: string;
  displayUnit: DisplayUnit;
  viewPreset: ViewPreset;
  measureMode: boolean;
  frameTimeMs: number;
  webgl2Available: boolean | null;
  calculationResults: CalculationResults;
  shaderWarning: string | null;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;
  bottomPanelVisible: boolean;
  transformMode: TransformMode;
  setSelectedObject: (id: string | null) => void;
  setSelectedProjector: (id: string) => void;
  updateProjector: (id: string, patch: Partial<ProjectorConfig>) => void;
  updateProjectorOptics: (id: string, patch: Partial<ProjectorConfig['optics']>) => void;
  updateSceneObjectTransform: (
    id: string,
    patch: { position?: SceneObject['transform']['position']; quaternion?: SceneObject['transform']['quaternion'] },
  ) => void;
  setDisplayUnit: (u: DisplayUnit) => void;
  setViewPreset: (preset: ViewPreset) => void;
  setMeasureMode: (enabled: boolean) => void;
  setFrameTimeMs: (ms: number) => void;
  setWebgl2Available: (available: boolean) => void;
  setShaderWarning: (warning: string | null) => void;
  setLeftPanelVisible: (visible: boolean) => void;
  setRightPanelVisible: (visible: boolean) => void;
  setBottomPanelVisible: (visible: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  toggleBottomPanel: () => void;
  setTransformMode: (mode: TransformMode) => void;
  recomputeCalculations: () => void;
  addBox: () => void;
  getSnapshot: () => ProjectSnapshot;
  newProject: () => void;
  saveProjectToFile: () => void;
  loadProjectFromFile: (text: string) => void;
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
  return sceneObjects.find((obj) => obj.type === 'screen' && obj.receivesProjection);
}

function pickPersistedFields(state: AppState) {
  return {
    projectName: state.projectName,
    sceneObjects: state.sceneObjects,
    projectors: state.projectors,
    selectedObjectId: state.selectedObjectId,
    selectedProjectorId: state.selectedProjectorId,
    displayUnit: state.displayUnit,
    viewPreset: state.viewPreset,
    transformMode: state.transformMode,
    leftPanelVisible: state.leftPanelVisible,
    rightPanelVisible: state.rightPanelVisible,
    bottomPanelVisible: state.bottomPanelVisible,
  };
}

const initial = buildInitialPersistedState();

export const useAppStore = create<AppState>((set, get) => ({
  projectName: initial.projectName,
  projectMessage: initial.projectName !== 'Default Scene' ? 'Restored last autosaved project' : null,
  sceneObjects: initial.sceneObjects,
  projectors: initial.projectors,
  selectedObjectId: initial.selectedObjectId,
  selectedProjectorId: initial.selectedProjectorId,
  displayUnit: initial.displayUnit,
  viewPreset: initial.viewPreset,
  measureMode: false,
  frameTimeMs: 0,
  webgl2Available: null,
  calculationResults: { nominal: null, footprint: null, opticsError: null },
  shaderWarning: null,
  leftPanelVisible: initial.leftPanelVisible,
  rightPanelVisible: initial.rightPanelVisible,
  bottomPanelVisible: initial.bottomPanelVisible,
  transformMode: initial.transformMode,
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
  setDisplayUnit: (u) => set({ displayUnit: u }),
  setViewPreset: (preset) => set({ viewPreset: preset }),
  setMeasureMode: (enabled) => set({ measureMode: enabled }),
  setFrameTimeMs: (ms) => set({ frameTimeMs: ms }),
  setWebgl2Available: (available) => set({ webgl2Available: available }),
  setShaderWarning: (warning) => set({ shaderWarning: warning }),
  setLeftPanelVisible: (visible) => set({ leftPanelVisible: visible }),
  setRightPanelVisible: (visible) => set({ rightPanelVisible: visible }),
  setBottomPanelVisible: (visible) => set({ bottomPanelVisible: visible }),
  toggleLeftPanel: () => set((s) => ({ leftPanelVisible: !s.leftPanelVisible })),
  toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
  toggleBottomPanel: () => set((s) => ({ bottomPanelVisible: !s.bottomPanelVisible })),
  setTransformMode: (mode) => set({ transformMode: mode }),
  recomputeCalculations: () => {
    const { projectors, sceneObjects } = get();
    const proj = projectors[0];
    if (!proj) return;
    const v = validateOptics(proj.optics);
    if (!v.valid) return;

    const worldMatrix = buildWorldMatrix(proj.transform);
    const screen = findProjectionScreen(sceneObjects);
    let footprint = null;

    if (screen) {
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
    }

    const distance = footprint?.axialDistance ?? 6;
    const nominal = computeNominalProjection(proj.optics, distance);
    set({ calculationResults: { nominal, footprint, opticsError: null } });
  },
  addBox: () => {
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
  getSnapshot: () => sliceToSnapshot(pickPersistedFields(get())),
  newProject: () => {
    const defaults = defaultPersistedSlice();
    set({
      ...defaults,
      projectMessage: 'New project created',
      calculationResults: { nominal: null, footprint: null, opticsError: null },
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
  loadProjectFromFile: (text) => {
    try {
      const snapshot = parseProjectJson(text);
      const slice = snapshotToSlice(snapshot);
      set({
        ...slice,
        projectMessage: `Loaded "${snapshot.name}"`,
        calculationResults: { nominal: null, footprint: null, opticsError: null },
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
