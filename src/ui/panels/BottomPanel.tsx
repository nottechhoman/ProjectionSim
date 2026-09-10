import { useMemo } from 'react';
import { listSceneVideoSources } from '../../media/videoPlayback';
import { useAppStore } from '../../store';
import { distance3 } from '../../utils/distance';
import { formatLength } from '../../utils/units';
import { VideoTransport } from './VideoTransport';
import styles from './BottomPanel.module.css';

export function BottomPanel() {
  const webgl2Available = useAppStore((s) => s.webgl2Available);
  const frameTimeMs = useAppStore((s) => s.frameTimeMs);
  const shaderWarning = useAppStore((s) => s.shaderWarning);
  const projectMessage = useAppStore((s) => s.projectMessage);
  const projectName = useAppStore((s) => s.projectName);
  const displayUnit = useAppStore((s) => s.displayUnit);
  const measureMode = useAppStore((s) => s.measureMode);
  const measurePoints = useAppStore((s) => s.measurePoints);
  const clearMeasurePoints = useAppStore((s) => s.clearMeasurePoints);
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const clearProjectMessage = useAppStore((s) => s.clearProjectMessage);
  const materialPreviewMode = useAppStore((s) => s.materialPreviewMode);
  const projectionCompositeMode = useAppStore((s) => s.projectionCompositeMode);
  const showProjectionBeam = useAppStore((s) => s.showProjectionBeam);
  const projectorCount = useAppStore((s) => s.projectors.length);
  const selectedProjectorId = useAppStore((s) => s.selectedProjectorId);
  const projectors = useAppStore((s) => s.projectors);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const projector = projectors.find((p) => p.id === selectedProjectorId) ?? projectors[0];
  const playAllSceneVideos = useAppStore((s) => s.playAllSceneVideos);
  const pauseAllSceneVideos = useAppStore((s) => s.pauseAllSceneVideos);
  const videoSources = useMemo(
    () => listSceneVideoSources(projectors, sceneObjects),
    [projectors, sceneObjects],
  );

  const webglStatus =
    webgl2Available === null
      ? 'checking…'
      : webgl2Available
        ? 'available'
        : 'unavailable';

  const webglClass =
    webgl2Available === null
      ? styles.warn
      : webgl2Available
        ? styles.ok
        : styles.error;

  const [a, b] = measurePoints;
  const measureDistance = a && b ? distance3(a, b) : null;

  return (
    <div className={styles.panel}>
      <div className={styles.item}>
        <span>Project:</span>
        <span>{projectName}</span>
      </div>
      <div className={styles.item}>
        <span>WebGL2:</span>
        <span className={webglClass}>{webglStatus}</span>
      </div>
      <div className={styles.item}>
        <span>Frame:</span>
        <span>{frameTimeMs > 0 ? `${frameTimeMs.toFixed(1)} ms` : '—'}</span>
      </div>
      {videoSources.length > 1 && (
        <div className={styles.item}>
          <button type="button" className={styles.videoBtn} onClick={playAllSceneVideos}>
            Play all
          </button>
          <button type="button" className={styles.videoBtn} onClick={pauseAllSceneVideos}>
            Pause all
          </button>
        </div>
      )}
      {videoSources.map((source) => (
        <VideoTransport key={source.assetId} assetId={source.assetId} label={source.label} />
      ))}
      {measureMode && (
        <div className={styles.item}>
          <span>Measure:</span>
          <span>
            {!a
              ? 'click first point'
              : !b
                ? 'click second point'
                : formatLength(measureDistance ?? 0, displayUnit)}
          </span>
          {(a || b) && (
            <button type="button" className={styles.videoBtn} onClick={clearMeasurePoints}>
              Clear
            </button>
          )}
        </div>
      )}
      {projectMessage && (
        <div
          className={styles.projectMessage}
          title={projectMessage}
          onClick={clearProjectMessage}
          role="status"
        >
          {projectMessage}
        </div>
      )}
      {shaderWarning && (
        <div className={styles.warningBanner} title={shaderWarning}>
          Shader: {shaderWarning}
        </div>
      )}
      {materialPreviewMode === 'falloff' && (
        <div
          className={styles.item}
          title="Relative inverse-square brightness from each projector lens (planning estimate, not calibrated lux)"
        >
          Falloff heatmap: hot = near, cold = far
        </div>
      )}
      {showProjectionBeam && (
        <div className={styles.item} title="Beam rays from each projector lens to its image frame">
          Beam rays on
        </div>
      )}
      {projectionCompositeMode === 'solo' && (
        <div className={styles.item} title="Select a projector in the scene list to preview its projection">
          Solo: {projector?.name ?? '—'}
        </div>
      )}
      {projectionCompositeMode === 'unblended' && projectorCount > 1 && (
        <div className={styles.item} title="Each projector shows its own pattern, image, or video at the same time">
          Multi-view: {projectors.filter((p) => p.enabled).length} projectors active
        </div>
      )}
      {projectionCompositeMode === 'unblended' && projectorCount > 1 && (
        <div className={styles.warningBanner} title="Overlap regions appear brighter in raw additive mode">
          Raw overlap: additive brightness
        </div>
      )}
      <button type="button" className={styles.collapseBtn} onClick={toggleBottomPanel} title="Hide status bar">
        ×
      </button>
    </div>
  );
}
