import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from './index';
import { defaultPersistedSlice } from './persistenceHelpers';
import { snapshotToSlice } from './persistenceHelpers';
import { PROJECT_FILE_VERSION } from '../persistence/projectSchema';
import { defaultShow, DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';

function resetStore(): void {
  const defaults = defaultPersistedSlice();
  useAppStore.setState({
    ...defaults,
    projectMessage: null,
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
    showProjectionBeam: false,
  });
  useAppStore.getState().recomputeCalculations();
}

describe('reliability store state', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does not change calculation target when selecting another object', () => {
    useAppStore.getState().setCalculationTargetId('screen-1');
    useAppStore.getState().setSelectedObject('floor-1');
    expect(useAppStore.getState().calculationTargetId).toBe('screen-1');
  });

  it('adding a projector adds a perspective mapping locked to it', () => {
    useAppStore.getState().addProjector();
    const proj = useAppStore.getState().projectors[1];
    const locked = useAppStore.getState().show.mappings.filter((m) => m.perspective?.lockToProjectorId === proj.id);
    expect(locked).toHaveLength(1);
    expect(locked[0].screenIds).toEqual(['screen-1']);
  });

  it('deleting a projector unlocks its mappings', () => {
    useAppStore.getState().addProjector();
    const secondId = useAppStore.getState().projectors[1].id;
    vi.stubGlobal('window', { confirm: () => true });
    useAppStore.getState().removeProjector(secondId);
    vi.unstubAllGlobals();
    expect(useAppStore.getState().show.mappings.some((m) => m.perspective?.lockToProjectorId === secondId)).toBe(false);
  });

  it('adding a curved screen adds a Direct mapping named after it', () => {
    useAppStore.getState().addCurvedScreen();
    const curved = useAppStore.getState().sceneObjects.find((o) => o.type === 'curvedScreen')!;
    const direct = useAppStore.getState().show.mappings.find((m) => m.kind === 'direct' && m.screenIds.includes(curved.id));
    expect(direct?.name).toBe(curved.name);
  });

  it('layers: add on the selected mapping, reorder, undo', () => {
    const store = useAppStore.getState();
    const mappingId = store.show.mappings[0].id;
    store.setSelectedMappingId(mappingId);
    store.addLayer({ kind: 'solid', color: '#ff0000' });
    let layers = useAppStore.getState().show.tracks[0].layers;
    expect(layers).toHaveLength(2);
    expect(layers[1].mappingId).toBe(mappingId);
    useAppStore.getState().moveLayer(layers[1].id, 'down');
    layers = useAppStore.getState().show.tracks[0].layers;
    expect(layers[0].media.kind).toBe('solid');
    useAppStore.getState().undo();
    expect(useAppStore.getState().show.tracks[0].layers[1].media.kind).toBe('solid');
  });

  it('deleting a mapping leaves its layers unmapped', () => {
    const mappingId = useAppStore.getState().show.tracks[0].layers[0].mappingId!;
    useAppStore.getState().removeMapping(mappingId);
    expect(useAppStore.getState().show.tracks[0].layers[0].mappingId).toBeNull();
    expect(useAppStore.getState().show.mappings.some((m) => m.id === mappingId)).toBe(false);
  });

  it('clears calculation results when no eligible receiver remains', () => {
    vi.stubGlobal('window', { confirm: () => true });
    useAppStore.getState().updateSceneObjectFlags('screen-1', { receivesProjection: false });
    expect(useAppStore.getState().calculationResults.nominal).toBeNull();
    expect(useAppStore.getState().calculationResults.coverageAnalysis).toBeNull();
    expect(useAppStore.getState().calculationResults.calculationTarget).toBeNull();
    vi.unstubAllGlobals();
  });

  it('preserves reliability settings and the show through serialization round-trip', () => {
    useAppStore.getState().setCalculationTargetId('screen-1');
    const snapshot = useAppStore.getState().getSnapshot();
    const slice = snapshotToSlice(snapshot);
    expect(slice.calculationTargetId).toBe('screen-1');
    expect(slice.show).toEqual(useAppStore.getState().show);
  });

  it('loads legacy projects without explicit reliability fields', () => {
    const legacy = {
      version: PROJECT_FILE_VERSION,
      show: defaultShow(),
      savedAt: '2026-09-07T00:00:00.000Z',
      name: 'Legacy',
      sceneObjects: DEFAULT_SCENE_OBJECTS,
      projectors: DEFAULT_PROJECTORS,
      mediaAssets: [],
      materialPreviewMode: 'projectionPreview' as const,
      projectionCompositeMode: 'unblended' as const,
      selectedObjectId: 'proj-1',
      selectedProjectorId: 'proj-1',
      displayUnit: 'm' as const,
      viewPreset: 'persp' as const,
      transformMode: 'translate' as const,
      leftPanelVisible: true,
      rightPanelVisible: true,
      bottomPanelVisible: true,
    };
    const slice = snapshotToSlice(legacy);
    expect(slice.calculationTargetId).toBe('screen-1');
  });

  it('keeps flat calculation target after adding a curved screen', () => {
    useAppStore.getState().setCalculationTargetId('screen-1');
    useAppStore.getState().addCurvedScreen();
    expect(useAppStore.getState().calculationTargetId).toBe('screen-1');
    expect(useAppStore.getState().calculationResults.calculationTarget?.id).toBe('screen-1');
  });
});
