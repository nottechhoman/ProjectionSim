import { useAppStore } from '../../store';
import { formatLength } from '../../utils/units';
import styles from './Inspector.module.css';

export function CalcResults() {
  const nominal = useAppStore((s) => s.calculationResults.nominal);
  const footprint = useAppStore((s) => s.calculationResults.footprint);
  const displayUnit = useAppStore((s) => s.displayUnit);

  if (!nominal) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Projection</div>
        <div className={styles.empty}>No calculation results</div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Projection</div>
      <div className={styles.row}>
        <label>Width</label>
        <span className={styles.readout}>{formatLength(nominal.width, displayUnit)}</span>
      </div>
      <div className={styles.row}>
        <label>Height</label>
        <span className={styles.readout}>{formatLength(nominal.height, displayUnit)}</span>
      </div>
      <div className={styles.row}>
        <label>Area</label>
        <span className={styles.readout}>{nominal.area.toFixed(2)} m²</span>
      </div>
      <div className={styles.row}>
        <label>Density</label>
        <span className={styles.readout}>
          {nominal.pixelsPerMeterH.toFixed(1)} px/m · {nominal.mmPerPixelH.toFixed(3)} mm/px
        </span>
      </div>
      {footprint && (
        <>
          <div className={styles.row}>
            <label>Clipped area</label>
            <span className={styles.readout}>{footprint.clippedArea.toFixed(2)} m²</span>
          </div>
          {footprint.axialDistance != null && (
            <div className={styles.row}>
              <label>Axial distance</label>
              <span className={styles.readout}>
                {formatLength(footprint.axialDistance, displayUnit)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
