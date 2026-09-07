import { useAppStore } from '../../store';
import { formatLength } from '../../utils/units';
import styles from './Inspector.module.css';

export function CalcResults() {
  const nominal = useAppStore((s) => s.calculationResults.nominal);
  const footprint = useAppStore((s) => s.calculationResults.footprint);
  const overlap = useAppStore((s) => s.calculationResults.overlap);
  const projectors = useAppStore((s) => s.projectors);
  const displayUnit = useAppStore((s) => s.displayUnit);

  if (!nominal) {
    return (
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Projection</div>
        <div className={styles.empty}>No calculation results</div>
      </div>
    );
  }

  const projectorName = (id: string) => projectors.find((p) => p.id === id)?.name ?? id;

  return (
    <>
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

      {overlap && projectors.filter((p) => p.enabled).length > 1 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Overlap</div>
          <div className={styles.row}>
            <label>Union area</label>
            <span className={styles.readout}>{overlap.unionAreaM2.toFixed(2)} m²</span>
          </div>
          <div className={styles.row}>
            <label>Multi-coverage</label>
            <span className={styles.readout}>{overlap.multiCoverageAreaM2.toFixed(2)} m²</span>
          </div>
          {overlap.horizontalOverlapM != null && (
            <div className={styles.row}>
              <label>H overlap</label>
              <span className={styles.readout}>{formatLength(overlap.horizontalOverlapM, displayUnit)}</span>
            </div>
          )}
          {overlap.combinedWidthM != null && (
            <div className={styles.row}>
              <label>Combined width</label>
              <span className={styles.readout}>{formatLength(overlap.combinedWidthM, displayUnit)}</span>
            </div>
          )}
          {overlap.pairwise.map((pair) => (
            <div key={`${pair.projectorAId}-${pair.projectorBId}`} className={styles.subSection}>
              <div className={styles.row}>
                <label>{projectorName(pair.projectorAId)} ∩ {projectorName(pair.projectorBId)}</label>
                <span className={styles.readout}>{pair.areaM2.toFixed(2)} m²</span>
              </div>
              {pair.overlapWidthM != null && (
                <div className={styles.row}>
                  <label>Width</label>
                  <span className={styles.readout}>
                    {formatLength(pair.overlapWidthM, displayUnit)} ({pair.percentOfA.toFixed(1)}% / {pair.percentOfB.toFixed(1)}%)
                  </span>
                </div>
              )}
              {pair.overlapPixelsA != null && (
                <div className={styles.row}>
                  <label>Overlap px</label>
                  <span className={styles.readout}>{pair.overlapPixelsA} / {pair.overlapPixelsB}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
