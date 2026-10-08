import { useEffect, useRef } from 'react';
import { SceneEngine } from '../scene/SceneEngine';
import { useAppStore } from '../store';
import { transport } from '../playback/clock';
import { addCueAtPlayhead, go, jumpCue, stepFrame, stop, toggleLoopSection, togglePlay } from '../playback/controls';
import { mediaTextureCache } from '../media';

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new SceneEngine(canvas);
    engineRef.current = engine;

    engine.setCallbacks({
      onFrameTime: (ms) => useAppStore.getState().setFrameTimeMs(ms),
      onWebglStatus: (available) => useAppStore.getState().setWebgl2Available(available),
      onSelect: (id) => {
        const state = useAppStore.getState();
        if (state.projectors.some((p) => p.id === id)) {
          state.setSelectedProjector(id);
        } else {
          state.setSelectedObject(id);
        }
      },
      onTransformChange: (id, patch) => {
        const state = useAppStore.getState();
        if (state.projectors.some((p) => p.id === id)) {
          const proj = state.projectors.find((p) => p.id === id);
          if (!proj) return;
          state.updateProjector(id, {
            transform: {
              position: patch.position ?? proj.transform.position,
              quaternion: patch.quaternion ?? proj.transform.quaternion,
            },
          });
        } else {
          state.updateSceneObjectTransform(id, patch);
        }
      },
      onMeasurePoint: (point) => {
        useAppStore.getState().addMeasurePoint(point);
      },
      onHistoryCheckpoint: () => {
        useAppStore.getState().pushSceneHistoryCheckpoint();
      },
      onRasterPreview: () => {
        useAppStore.getState().bumpRasterPreviewRevision();
      },
    });

    let lastSync = '';
    const unsub = useAppStore.subscribe((state) => {
      const snapshot = JSON.stringify(getEngineSyncState(state));
      if (snapshot === lastSync) return;
      lastSync = snapshot;
      engine.sync(state);
    });
    engine.sync(useAppStore.getState());
    engine.start();

    (window as Window & { __projectionLabEngine?: SceneEngine; __projectionLabStore?: typeof useAppStore }).__projectionLabEngine = engine;
    (window as Window & { __projectionLabEngine?: SceneEngine; __projectionLabStore?: typeof useAppStore }).__projectionLabStore = useAppStore;
    (window as Window & { __projectionLabTransport?: typeof transport }).__projectionLabTransport = transport;
    (window as Window & { __projectionLabMedia?: typeof mediaTextureCache }).__projectionLabMedia = mediaTextureCache;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      ) {
        return;
      }
      const store = useAppStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Transport shortcuts. A focused button would also react to Space / Enter.
      const transportKey = () => {
        e.preventDefault();
        if (target instanceof HTMLButtonElement) target.blur();
      };
      switch (e.key) {
        case ' ':
          transportKey();
          togglePlay();
          return;
        case 'Enter':
          transportKey();
          go();
          return;
        case 'Escape':
          stop();
          return;
        case 'ArrowLeft':
        case 'ArrowRight': {
          e.preventDefault();
          const dir = e.key === 'ArrowRight' ? 1 : -1;
          if (e.shiftKey) jumpCue(dir);
          else stepFrame(dir);
          return;
        }
        case 'l':
        case 'L':
          toggleLoopSection();
          return;
        case 'm':
        case 'M':
          addCueAtPlayhead();
          return;
      }
      if (e.key === 'w' || e.key === 'W') store.setTransformMode('translate');
      if (e.key === 'e' || e.key === 'E') store.setTransformMode('rotate');
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      delete (window as Window & { __projectionLabEngine?: SceneEngine; __projectionLabStore?: typeof useAppStore }).__projectionLabEngine;
      delete (window as Window & { __projectionLabEngine?: SceneEngine; __projectionLabStore?: typeof useAppStore }).__projectionLabStore;
      unsub();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

function getEngineSyncState(state: ReturnType<typeof useAppStore.getState>) {
  return {
    sceneObjects: state.sceneObjects,
    projectors: state.projectors,
    selectedObjectId: state.selectedObjectId,
    selectedProjectorId: state.selectedProjectorId,
    viewPreset: state.viewPreset,
    transformMode: state.transformMode,
    materialPreviewMode: state.materialPreviewMode,
    projectionCompositeMode: state.projectionCompositeMode,
    show: state.show,
    playMode: state.playMode,
    measureMode: state.measureMode,
    measurePoints: state.measurePoints,
    showProjectionBeam: state.showProjectionBeam,
    calculationTargetId: state.calculationTargetId,
    rasterPreviewPanelVisible: state.rasterPreviewPanelVisible,
    blendSettings: state.blendSettings,
    maxOverlap: state.blendAnalysis?.maxOverlap ?? null,
  };
}
