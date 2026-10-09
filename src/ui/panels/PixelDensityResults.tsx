import { useAppStore } from '../../store';
import styles from './Inspector.module.css';

/** v6 previz: projected pixel density on the calculation target. */
export function PixelDensityResults() {
  const stats = useAppStore((s) => s.calculationResults.coverageAnalysis?.pixelDensity ?? null);
  const previewMode = useAppStore((s) => s.materialPreviewMode);
  const setMaterialPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);

  const fmt = (pxPerM: number) =>
    pxPerM > 0 ? `${Math.round(pxPerM)} px/m · ${(1000 / pxPerM).toFixed(1)} mm per pixel` : '—';

  return (
    <div className={styles.section} data-testid="density-results">
      <div className={styles.sectionTitle}>Pixel density on target</div>
      {stats ? (
        <>
          <div className={styles.row}>
            <label>Softest</label>
            <span className={styles.readout} data-testid="density-min">{fmt(stats.minPxPerM)}</span>
          </div>
          <div className={styles.row}>
            <label>Average</label>
            <span className={styles.readout} data-testid="density-avg">{fmt(stats.avgPxPerM)}</span>
          </div>
          <div className={styles.row}>
            <label>Sharpest</label>
            <span className={styles.readout} data-testid="density-max">{fmt(stats.maxPxPerM)}</span>
          </div>
          <p className={styles.hint}>
            Best projector at each point. Viewers at distance d can't see pixels smaller than about d × 0.3 mm
            per metre (e.g. 3 mm at 10 m).
          </p>
        </>
      ) : (
        <div className={styles.empty}>No projector lands on the target.</div>
      )}
      {previewMode !== 'pixelDensity' && (
        <button
          type="button"
          className={styles.actionBtn}
          data-testid="show-density-heatmap"
          onClick={() => setMaterialPreviewMode('pixelDensity')}
        >
          Show pixel density heatmap
        </button>
      )}
    </div>
  );
}
