import { useAppStore } from '../../store';
import { listCalculationTargets } from '../../store/reliabilitySettings';
import { formatLength } from '../../utils/units';
import styles from './Inspector.module.css';

export function CalcResults() {
  const nominal = useAppStore((s) => s.calculationResults.nominal);
  const footprint = useAppStore((s) => s.calculationResults.footprint);
  const overlap = useAppStore((s) => s.calculationResults.overlap);
  const calculationTarget = useAppStore((s) => s.calculationResults.calculationTarget);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const calculationTargetId = useAppStore((s) => s.calculationTargetId);
  const setCalculationTargetId = useAppStore((s) => s.setCalculationTargetId);
  const projectors = useAppStore((s) => s.projectors);
  const displayUnit = useAppStore((s) => s.displayUnit);

  const targets = listCalculationTargets(sceneObjects);
  const targetLabel =
    calculationTarget != null
      ? `${calculationTarget.name} (${calculationTarget.type === 'curvedScreen' ? 'curved' : 'flat'})`
      : 'No eligible receiver';

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Calculation target</div>
        <div className={styles.row}>
          <label htmlFor="calculation-target-select">Target</label>
          <select
            id="calculation-target-select"
            aria-label="Calculation target"
            data-testid="calculation-target-select"
            value={calculationTargetId ?? ''}
            onChange={(e) => setCalculationTargetId(e.target.value || null)}
            disabled={targets.length === 0}
          >
            {targets.length === 0 ? (
              <option value="">No eligible receivers</option>
            ) : (
              targets.map((obj) => (
                <option key={obj.id} value={obj.id}>
                  {obj.name} ({obj.type === 'curvedScreen' ? 'curved' : 'flat'})
                </option>
              ))
            )}
          </select>
        </div>
        <div className={styles.row}>
          <label>Active target</label>
          <span className={styles.readout} data-testid="calculation-target-label">
            {targetLabel}
          </span>
        </div>
        {targets.length === 0 && (
          <div className={styles.empty}>
            Calculations require a flat or curved screen with Receives projection enabled.
            Imported meshes are not supported.
          </div>
        )}
      </div>

      {!nominal ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Projection</div>
          <div className={styles.empty}>No calculation results</div>
        </div>
      ) : (
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
                  <span className={styles.readout}>
                    {formatLength(overlap.horizontalOverlapM, displayUnit)}
                  </span>
                </div>
              )}
              {overlap.combinedWidthM != null && (
                <div className={styles.row}>
                  <label>Combined width</label>
                  <span className={styles.readout}>
                    {formatLength(overlap.combinedWidthM, displayUnit)}
                  </span>
                </div>
              )}
              {overlap.pairwise.map((pair) => (
                <div key={`${pair.projectorAId}-${pair.projectorBId}`} className={styles.subSection}>
                  <div className={styles.row}>
                    <label>
                      {projectorName(projectors, pair.projectorAId)} ∩{' '}
                      {projectorName(projectors, pair.projectorBId)}
                    </label>
                    <span className={styles.readout}>{pair.areaM2.toFixed(2)} m²</span>
                  </div>
                  {pair.overlapWidthM != null && (
                    <div className={styles.row}>
                      <label>Width</label>
                      <span className={styles.readout}>
                        {formatLength(pair.overlapWidthM, displayUnit)} ({pair.percentOfA.toFixed(1)}% /{' '}
                        {pair.percentOfB.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                  {pair.overlapPixelsA != null && (
                    <div className={styles.row}>
                      <label>Overlap px</label>
                      <span className={styles.readout}>
                        {pair.overlapPixelsA} / {pair.overlapPixelsB}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function projectorName(projectors: { id: string; name: string }[], id: string): string {
  return projectors.find((p) => p.id === id)?.name ?? id;
}
