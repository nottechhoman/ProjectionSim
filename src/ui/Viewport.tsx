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
    });

    const unsub = useAppStore.subscribe((state) => {
      engine.sync(state);
    });
    engine.sync(useAppStore.getState());
    engine.start();

    return () => {
      unsub();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
