import { useAppStore } from '../../store';
import { listCalculationTargets } from '../../store/reliabilitySettings';
import { percentOfReceiver } from '../../coverage/coverageAnalysis';
import { formatLength } from '../../utils/units';
import styles from './Inspector.module.css';

export function CalcResults() {
  const nominal = useAppStore((s) => s.calculationResults.nominal);
  const footprint = useAppStore((s) => s.calculationResults.footprint);
  const overlap = useAppStore((s) => s.calculationResults.overlap);
  const coverageAnalysis = useAppStore((s) => s.calculationResults.coverageAnalysis);
  const calculationTarget = useAppStore((s) => s.calculationResults.calculationTarget);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const calculationTargetId = useAppStore((s) => s.calculationTargetId);
  const setCalculationTargetId = useAppStore((s) => s.setCalculationTargetId);
  const analysisQuality = useAppStore((s) => s.analysisQuality);
  const setAnalysisQuality = useAppStore((s) => s.setAnalysisQuality);
  const calculationTargetSide = useAppStore((s) => s.calculationTargetSide);
  const setCalculationTargetSide = useAppStore((s) => s.setCalculationTargetSide);
  const projectors = useAppStore((s) => s.projectors);
  const displayUnit = useAppStore((s) => s.displayUnit);

  const targets = listCalculationTargets(sceneObjects);
  const targetLabel =
    calculationTarget != null
      ? `${calculationTarget.name} (${calculationTarget.type === 'curvedScreen' ? 'curved' : 'flat'})`
      : 'No eligible receiver';

  const receiverArea = coverageAnalysis?.receiverArea ?? 0;

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
          <label htmlFor="analysis-quality-select">Sampling quality</label>
          <select
            id="analysis-quality-select"
            aria-label="Analysis sampling quality"
            data-testid="analysis-quality-select"
            value={analysisQuality}
            onChange={(e) => setAnalysisQuality(e.target.value as 'draft' | 'high')}
          >
            <option value="draft">Draft (32×18)</option>
            <option value="high">High (64×36)</option>
          </select>
        </div>
        <div className={styles.row}>
          <label htmlFor="calculation-target-side-select">Analyze side</label>
          <select
            id="calculation-target-side-select"
            aria-label="Calculation target side"
            data-testid="calculation-target-side-select"
            value={calculationTargetSide}
            onChange={(e) => setCalculationTargetSide(e.target.value as 'front' | 'back' | 'both')}
          >
            <option value="front">Front</option>
            <option value="back">Back</option>
            <option value="both">Both (combined)</option>
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

          {coverageAnalysis && (
            <div className={styles.section} data-testid="coverage-analysis-section">
              <div className={styles.sectionTitle}>Coverage reliability (sampled)</div>
              <div className={styles.row}>
                <label title={`Denominator: ${receiverArea.toFixed(2)} m² receiver area`}>
                  Receiver area
                </label>
                <span className={styles.readout} data-testid="receiver-area">
                  {receiverArea.toFixed(2)} m²
                </span>
              </div>
              <div className={styles.row}>
                <label title={`Denominator: ${receiverArea.toFixed(2)} m²`}>Geometric coverage</label>
                <span className={styles.readout} data-testid="geometric-coverage">
                  {coverageAnalysis.geometricCoveredArea.toFixed(2)} m² (
                  {percentOfReceiver(coverageAnalysis.geometricCoveredArea, receiverArea).toFixed(1)}%)
                </span>
              </div>
              <div className={styles.row}>
                <label title={`Denominator: ${receiverArea.toFixed(2)} m²`}>Visible coverage</label>
                <span className={styles.readout} data-testid="visible-coverage">
                  {coverageAnalysis.visibleCoveredArea.toFixed(2)} m² (
                  {percentOfReceiver(coverageAnalysis.visibleCoveredArea, receiverArea).toFixed(1)}%)
                </span>
              </div>
              <div className={styles.row}>
                <label title={`Denominator: ${receiverArea.toFixed(2)} m²`}>Uncovered</label>
                <span className={styles.readout} data-testid="uncovered-area">
                  {coverageAnalysis.uncoveredArea.toFixed(2)} m² (
                  {percentOfReceiver(coverageAnalysis.uncoveredArea, receiverArea).toFixed(1)}%)
                </span>
              </div>
              <div className={styles.row}>
                <label title={`Denominator: ${receiverArea.toFixed(2)} m²`}>Visible overlap</label>
                <span className={styles.readout} data-testid="visible-overlap-area">
                  {coverageAnalysis.visibleOverlapArea.toFixed(2)} m² (
                  {percentOfReceiver(coverageAnalysis.visibleOverlapArea, receiverArea).toFixed(1)}%)
                </span>
              </div>
              <div className={styles.row}>
                <label title={`Denominator: ${receiverArea.toFixed(2)} m²`}>Occlusion loss</label>
                <span className={styles.readout} data-testid="occlusion-loss-area">
                  {coverageAnalysis.occlusionLossArea.toFixed(2)} m² (
                  {percentOfReceiver(coverageAnalysis.occlusionLossArea, receiverArea).toFixed(1)}%)
                </span>
              </div>
              <div className={styles.row}>
                <label>Method</label>
                <span className={styles.readout}>
                  Surface sampling ({coverageAnalysis.quality}, {coverageAnalysis.targetSide},{' '}
                  {coverageAnalysis.samplingResolution.u}×{coverageAnalysis.samplingResolution.v})
                </span>
              </div>
              {coverageAnalysis.perSide && (
                <>
                  {coverageAnalysis.perSide.front && (
                    <div className={styles.subSection} data-testid="coverage-front-side">
                      <div className={styles.row}>
                        <label>Front visible</label>
                        <span className={styles.readout}>
                          {coverageAnalysis.perSide.front.visibleCoveredArea.toFixed(2)} m²
                        </span>
                      </div>
                    </div>
                  )}
                  {coverageAnalysis.perSide.back && (
                    <div className={styles.subSection} data-testid="coverage-back-side">
                      <div className={styles.row}>
                        <label>Back visible</label>
                        <span className={styles.readout}>
                          {coverageAnalysis.perSide.back.visibleCoveredArea.toFixed(2)} m²
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}
              {coverageAnalysis.perProjector.map((metrics) => (
                <div key={metrics.projectorId} className={styles.subSection}>
                  <div className={styles.row}>
                    <label>{projectorName(projectors, metrics.projectorId)}</label>
                  </div>
                  <div className={styles.row}>
                    <label>Geometric</label>
                    <span className={styles.readout}>{metrics.geometricCoveredArea.toFixed(2)} m²</span>
                  </div>
                  <div className={styles.row}>
                    <label>Visible</label>
                    <span className={styles.readout}>{metrics.visibleCoveredArea.toFixed(2)} m²</span>
                  </div>
                  <div className={styles.row}>
                    <label>Blocked</label>
                    <span className={styles.readout}>{metrics.blockedArea.toFixed(2)} m²</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {overlap && projectors.filter((p) => p.enabled).length > 1 && (
            <div className={styles.section}>
              <div className={styles.sectionTitle}>Pairwise overlap (analytic)</div>
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
