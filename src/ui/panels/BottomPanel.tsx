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
      <button type="button" className={styles.collapseBtn} onClick={toggleBottomPanel} title="Hide status bar">
        ×
      </button>
    </div>
  );
}
