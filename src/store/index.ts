import { create } from 'zustand';
import type { CalculationResults, DisplayUnit, ProjectorConfig, SceneObject } from '../types';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';
import { validateOptics } from '../optics/validate';
import { computeNominalProjection } from '../optics/nominal';

interface AppState {
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  selectedObjectId: string | null;
  selectedProjectorId: string;
  displayUnit: DisplayUnit;
  calculationResults: CalculationResults;
  shaderWarning: string | null;
  setSelectedObject: (id: string | null) => void;
  updateProjector: (id: string, patch: Partial<ProjectorConfig>) => void;
  updateProjectorOptics: (id: string, patch: Partial<ProjectorConfig['optics']>) => void;
  setDisplayUnit: (u: DisplayUnit) => void;
  recomputeCalculations: () => void;
  addBox: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  sceneObjects: DEFAULT_SCENE_OBJECTS,
  projectors: DEFAULT_PROJECTORS,
  selectedObjectId: 'proj-1',
  selectedProjectorId: 'proj-1',
  displayUnit: 'm',
  calculationResults: { nominal: null, footprint: null, opticsError: null },
  shaderWarning: null,
  setSelectedObject: (id) => set({ selectedObjectId: id }),
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
  setDisplayUnit: (u) => set({ displayUnit: u }),
  recomputeCalculations: () => {
    const { projectors } = get();
    const proj = projectors[0];
    if (!proj) return;
    const v = validateOptics(proj.optics);
    if (!v.valid) return;
    const nominal = computeNominalProjection(proj.optics, 6);
    set({ calculationResults: { nominal, footprint: null, opticsError: null } });
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
  },
}));

useAppStore.getState().recomputeCalculations();
