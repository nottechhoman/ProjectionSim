import { useAppStore } from '../../store';
import styles from './BottomPanel.module.css';

export function BottomPanel() {
  const webgl2Available = useAppStore((s) => s.webgl2Available);
  const frameTimeMs = useAppStore((s) => s.frameTimeMs);
  const shaderWarning = useAppStore((s) => s.shaderWarning);
  const projectMessage = useAppStore((s) => s.projectMessage);
  const projectName = useAppStore((s) => s.projectName);
  const toggleBottomPanel = useAppStore((s) => s.toggleBottomPanel);
  const clearProjectMessage = useAppStore((s) => s.clearProjectMessage);
  const videoPlaying = useAppStore((s) => s.videoPlaying);
  const toggleVideoPlayback = useAppStore((s) => s.toggleVideoPlayback);
  const projectionCompositeMode = useAppStore((s) => s.projectionCompositeMode);
  const projectorCount = useAppStore((s) => s.projectors.length);
  const selectedProjectorId = useAppStore((s) => s.selectedProjectorId);
  const projectors = useAppStore((s) => s.projectors);
  const projector = projectors.find((p) => p.id === selectedProjectorId) ?? projectors[0];

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
      {projector?.mediaSource === 'video' && projector.mediaAssetId && (
        <button type="button" className={styles.videoBtn} onClick={toggleVideoPlayback}>
          {videoPlaying ? 'Pause' : 'Play'} video
        </button>
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
      {projectionCompositeMode === 'solo' && (
        <div className={styles.item} title="Select a projector in the scene list to preview its projection">
          Solo: {projector?.name ?? '—'}
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
