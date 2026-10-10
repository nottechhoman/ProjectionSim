import { useAppStore } from '../../store';
import { luxToNits, nitsToFootLamberts } from '../../optics/illuminance';
import { NumInput } from '../components/NumInput';
import styles from './Inspector.module.css';

/** v5 previz: brightness on the calculation target from projector lumens. */
export function BrightnessResults() {
  const stats = useAppStore((s) => s.calculationResults.coverageAnalysis?.illuminance ?? null);
  const perProjector = useAppStore((s) => s.calculationResults.coverageAnalysis?.perProjector ?? []);
  const projectors = useAppStore((s) => s.projectors);
  const settings = useAppStore((s) => s.previzSettings);
  const setPrevizSettings = useAppStore((s) => s.setPrevizSettings);
  const previewMode = useAppStore((s) => s.materialPreviewMode);
  const setMaterialPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);

  const gain = settings.screenGain;
  const fmt = (lux: number) => {
    const nits = luxToNits(lux, gain);
    return `${Math.round(nits)} nits · ${Math.round(lux)} lux · ${nitsToFootLamberts(nits).toFixed(1)} fL`;
  };

  return (
    <div className={styles.section} data-testid="brightness-results">
      <div className={styles.sectionTitle}>Brightness on target</div>
      <NumInput
        label="Screen gain"
        value={gain}
        step={0.1}
        onChange={(v) => setPrevizSettings({ screenGain: v })}
      />
      {stats ? (
        <>
          <div className={styles.row}>
            <label>Min</label>
            <span className={styles.readout} data-testid="brightness-min">{fmt(stats.minLux)}</span>
          </div>
          <div className={styles.row}>
            <label>Average</label>
            <span className={styles.readout} data-testid="brightness-avg">{fmt(stats.avgLux)}</span>
          </div>
          <div className={styles.row}>
            <label>Max</label>
            <span className={styles.readout} data-testid="brightness-max">{fmt(stats.maxLux)}</span>
          </div>
          <div className={styles.row}>
            <label>Uniformity</label>
            <span className={styles.readout}>
              {stats.maxLux > 0 ? Math.round((stats.minLux / stats.maxLux) * 100) : 0}% (min / max)
            </span>
          </div>
          <p className={styles.hint}>
            Sum of all projectors before edge blending (overlaps read brighter). Rough guide: 150–300 nits for a dark
            room, 500+ with house lights or daylight. Cinema is about 14 fL.
          </p>
        </>
      ) : (
        <div className={styles.empty}>No projector light lands on the target.</div>
      )}
      {perProjector.some((m) => (m.lumensTotal ?? 0) > 0) && (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 8 }}>
            Light on target vs spill
          </div>
          {perProjector.map((m) => {
            const total = m.lumensTotal ?? 0;
            if (total <= 0) return null;
            const on = Math.min(total, m.lumensOnTarget ?? 0);
            const onPct = Math.round((on / total) * 100);
            const name = projectors.find((p) => p.id === m.projectorId)?.name ?? m.projectorId;
            return (
              <div className={styles.row} key={m.projectorId} data-testid="spill-row">
                <label>{name}</label>
                <span className={styles.readout}>
                  {onPct}% on target ({Math.round(on).toLocaleString()} lm) · {100 - onPct}% spill (
                  {Math.round(total - on).toLocaleString()} lm)
                </span>
              </div>
            );
          })}
          <p className={styles.hint}>
            Spill is light that misses the target or is blocked before it: it lands on walls, floor or objects
            behind and around it. The brightness heatmap shows where it lands (Show on every surface).
          </p>
        </>
      )}
      {previewMode !== 'illuminance' && (
        <button
          type="button"
          className={styles.actionBtn}
          data-testid="show-brightness-heatmap"
          onClick={() => setMaterialPreviewMode('illuminance')}
        >
          Show brightness heatmap
        </button>
      )}
    </div>
  );
}
