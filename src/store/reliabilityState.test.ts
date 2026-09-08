import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from './index';
import { defaultPersistedSlice } from './persistenceHelpers';
import { snapshotToSlice } from './persistenceHelpers';
import { PROJECT_FILE_VERSION } from '../persistence/projectSchema';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';

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
      calculationTarget: null,
    },
    shaderWarning: null,
    videoPlaying: false,
    showProjectionBeam: false,
  });
  useAppStore.getState().recomputeCalculations();
}

describe('reliability store state', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does not change shared content source when selecting another projector', () => {
    const store = useAppStore.getState();
    store.addProjector();
    const secondId = useAppStore.getState().projectors[1].id;
    store.setSharedContentSourceProjectorId('proj-1');
    store.setSelectedProjector(secondId);
    expect(useAppStore.getState().sharedContentSourceProjectorId).toBe('proj-1');
  });

  it('does not change calculation target when selecting another object', () => {
    useAppStore.getState().setCalculationTargetId('screen-1');
    useAppStore.getState().setSelectedObject('floor-1');
    expect(useAppStore.getState().calculationTargetId).toBe('screen-1');
  });

  it('updates shared content source when set explicitly', () => {
    useAppStore.getState().addProjector();
    const secondId = useAppStore.getState().projectors[1].id;
    useAppStore.getState().setSharedContentSourceProjectorId(secondId);
    expect(useAppStore.getState().sharedContentSourceProjectorId).toBe(secondId);
  });

  it('reassigns shared source when the source projector is deleted', () => {
    useAppStore.getState().addProjector();
    const secondId = useAppStore.getState().projectors[1].id;
    useAppStore.getState().setSharedContentSourceProjectorId(secondId);
    vi.stubGlobal('window', { confirm: () => true });
    useAppStore.getState().removeProjector(secondId);
    expect(useAppStore.getState().sharedContentSourceProjectorId).toBe('proj-1');
    vi.unstubAllGlobals();
  });

  it('clears calculation results when no eligible receiver remains', () => {
    vi.stubGlobal('window', { confirm: () => true });
    useAppStore.getState().updateSceneObjectFlags('screen-1', { receivesProjection: false });
    expect(useAppStore.getState().calculationResults.nominal).toBeNull();
    expect(useAppStore.getState().calculationResults.calculationTarget).toBeNull();
    vi.unstubAllGlobals();
  });

  it('preserves reliability settings through serialization round-trip', () => {
    useAppStore.getState().setSharedContentSourceProjectorId('proj-1');
    useAppStore.getState().setCalculationTargetId('screen-1');
    const snapshot = useAppStore.getState().getSnapshot();
    const slice = snapshotToSlice(snapshot);
    expect(slice.sharedContentSourceProjectorId).toBe('proj-1');
    expect(slice.calculationTargetId).toBe('screen-1');
  });

  it('loads legacy projects without explicit reliability fields', () => {
    const legacy = {
      version: PROJECT_FILE_VERSION,
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
    expect(slice.sharedContentSourceProjectorId).toBe('proj-1');
    expect(slice.calculationTargetId).toBe('screen-1');
  });

  it('undo restores shared content source after explicit change', () => {
    useAppStore.getState().addProjector();
    const secondId = useAppStore.getState().projectors[1].id;
    useAppStore.getState().setSharedContentSourceProjectorId(secondId);
    useAppStore.getState().undo();
    expect(useAppStore.getState().sharedContentSourceProjectorId).toBe('proj-1');
  });

  it('keeps flat calculation target after adding a curved screen', () => {
    useAppStore.getState().setCalculationTargetId('screen-1');
    useAppStore.getState().addCurvedScreen();
    expect(useAppStore.getState().calculationTargetId).toBe('screen-1');
    expect(useAppStore.getState().calculationResults.calculationTarget?.id).toBe('screen-1');
  });
});
