import { describe, expect, it, beforeEach } from 'vitest';
import { defaultPersistedSlice } from './persistenceHelpers';
import { useAppStore } from './index';

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
    videoPlaybackRevision: 0,
    showProjectionBeam: false,
    selectedContentLayerId: null,
    contentCanvasPanelVisible: false,
    rasterPreviewPanelVisible: false,
    mappingModeBeforeCanvas: null,
  });
}

describe('content canvas mapping mode', () => {
  beforeEach(() => {
    resetStore();
  });

  it('switches to Shared when enabling the canvas from Raw, then restores Raw on disable', () => {
    expect(useAppStore.getState().mappingMode).toBe('raw');
    useAppStore.getState().setContentCanvasEnabled(true);
    expect(useAppStore.getState().mappingMode).toBe('sharedCanvas');
    expect(useAppStore.getState().contentCanvas.enabled).toBe(true);
    useAppStore.getState().setContentCanvasEnabled(false);
    expect(useAppStore.getState().mappingMode).toBe('raw');
    expect(useAppStore.getState().contentCanvas.enabled).toBe(false);
  });

  it('keeps Shared after disabling the canvas if Shared was already active', () => {
    useAppStore.getState().setMappingMode('sharedCanvas');
    useAppStore.getState().setContentCanvasEnabled(true);
    expect(useAppStore.getState().mappingMode).toBe('sharedCanvas');
    useAppStore.getState().setContentCanvasEnabled(false);
    expect(useAppStore.getState().mappingMode).toBe('sharedCanvas');
  });
});
