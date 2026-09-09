import { useEffect, useRef } from 'react';
import { SceneEngine } from '../scene/SceneEngine';
import { useAppStore } from '../store';

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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const store = useAppStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (e.key === 'w' || e.key === 'W') store.setTransformMode('translate');
      if (e.key === 'e' || e.key === 'E') store.setTransformMode('rotate');
      if (e.key === 'm' || e.key === 'M') store.setMeasureMode(!store.measureMode);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
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
    mappingMode: state.mappingMode,
    sharedContentSourceProjectorId: state.sharedContentSourceProjectorId,
    measureMode: state.measureMode,
    measurePoints: state.measurePoints,
    showProjectionBeam: state.showProjectionBeam,
    calculationTargetId: state.calculationTargetId,
  };
}
