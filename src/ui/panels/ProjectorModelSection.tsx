import { useAppStore } from '../../store';
import { getCalculationTargetObject } from '../../store/reliabilitySettings';
import type { ProjectorConfig } from '../../types';
import {
  bestLensForThrow,
  checkLensShift,
  clampThrow,
  DEFAULT_PROJECTOR_LUMENS,
  findCatalogLens,
  findCatalogProjector,
  PROJECTOR_CATALOG,
  throwDistanceRange,
  type CatalogLens,
  type CatalogProjector,
} from '../../optics/projectorCatalog';
import { formatLength } from '../../utils/units';
import { NumInput } from '../components/NumInput';
import styles from './Inspector.module.css';

const BRANDS = Array.from(new Set(PROJECTOR_CATALOG.map((p) => p.brand)));

/** v5 previz: pick a real projector body + lens; sets lumens, resolution and zoom range. */
export function ProjectorModelSection({ projector }: { projector: ProjectorConfig }) {
  const updateProjector = useAppStore((s) => s.updateProjector);
  const updateProjectorOptics = useAppStore((s) => s.updateProjectorOptics);
  const displayUnit = useAppStore((s) => s.displayUnit);
  const target = useAppStore((s) => getCalculationTargetObject(s.sceneObjects, s.calculationTargetId));

  const model = findCatalogProjector(projector.catalog?.modelId);
  const lens = findCatalogLens(model, projector.catalog?.lensId);
  const lumens = projector.lumens ?? DEFAULT_PROJECTOR_LUMENS;

  const applyLens = (m: CatalogProjector, l: CatalogLens, setBody: boolean) => {
    updateProjector(projector.id, {
      catalog: { modelId: m.id, lensId: l.id },
      ...(setBody ? { lumens: m.lumens } : {}),
    });
    updateProjectorOptics(projector.id, {
      ...(setBody
        ? { resolution: { ...m.resolution }, aspectRatio: m.resolution.width / m.resolution.height }
        : {}),
      throwRatio: clampThrow(l, projector.optics.throwRatio),
      throwRatioMin: l.throwMin,
      throwRatioMax: l.throwMax,
    });
  };

  const onModel = (id: string) => {
    if (!id) {
      updateProjector(projector.id, { catalog: undefined });
      updateProjectorOptics(projector.id, { throwRatioMin: undefined, throwRatioMax: undefined });
      return;
    }
    const m = findCatalogProjector(id);
    if (!m) return;
    applyLens(m, bestLensForThrow(m, projector.optics.throwRatio), true);
  };

  const onLens = (id: string) => {
    const l = findCatalogLens(model, id);
    if (model && l) applyLens(model, l, false);
  };

  const shift = lens ? checkLensShift(lens, projector.optics.lensShiftH, projector.optics.lensShiftV) : null;
  const throwOut =
    lens && (projector.optics.throwRatio < lens.throwMin - 1e-6 || projector.optics.throwRatio > lens.throwMax + 1e-6);
  const fill =
    lens && target
      ? { name: target.name, width: target.dimensions.width, range: throwDistanceRange(lens, target.dimensions.width) }
      : null;

  return (
    <div className={styles.section} data-testid="projector-model-section">
      <div className={styles.sectionTitle}>Model &amp; lens</div>
      <div className={styles.row}>
        <label htmlFor="projector-model-select">Model</label>
        <select
          id="projector-model-select"
          data-testid="projector-model-select"
          value={model?.id ?? ''}
          onChange={(e) => onModel(e.target.value)}
        >
          <option value="">Custom</option>
          {BRANDS.map((brand) => (
            <optgroup key={brand} label={brand}>
              {PROJECTOR_CATALOG.filter((p) => p.brand === brand).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.model} · {Math.round(p.lumens / 100) / 10}k lm
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {model && (
        <div className={styles.row}>
          <label htmlFor="projector-lens-select">Lens</label>
          <select
            id="projector-lens-select"
            data-testid="projector-lens-select"
            value={lens?.id ?? ''}
            onChange={(e) => onLens(e.target.value)}
          >
            {model.lenses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <NumInput
        label="Lumens"
        value={lumens}
        step={500}
        onChange={(v) => updateProjector(projector.id, { lumens: Math.max(0, Math.round(v)) })}
      />
      {lens && lens.throwMax > lens.throwMin && (
        <div className={styles.row}>
          <label htmlFor="projector-zoom-range">Zoom</label>
          <input
            id="projector-zoom-range"
            data-testid="projector-zoom-range"
            type="range"
            min={lens.throwMin}
            max={lens.throwMax}
            step={0.01}
            value={clampThrow(lens, projector.optics.throwRatio)}
            onChange={(e) => updateProjectorOptics(projector.id, { throwRatio: Number(e.target.value) })}
          />
          <span className={styles.readout}>{projector.optics.throwRatio.toFixed(2)}:1</span>
        </div>
      )}
      {fill && (
        <p className={styles.hint} data-testid="projector-fill-hint">
          To fill {fill.name} ({formatLength(fill.width, displayUnit, 2)} wide) with this lens, hang it{' '}
          {formatLength(fill.range[0], displayUnit, 2)}
          {fill.range[1] > fill.range[0] + 1e-6 ? ` to ${formatLength(fill.range[1], displayUnit, 2)}` : ''} from the
          screen.
        </p>
      )}
      {throwOut && (
        <p className={styles.hint} style={{ color: '#ff8a65' }} data-testid="projector-throw-warning">
          Throw {projector.optics.throwRatio.toFixed(2)}:1 is outside this lens ({lens!.throwMin}–{lens!.throwMax}).
        </p>
      )}
      {shift && !shift.ok && (
        <p className={styles.hint} style={{ color: '#ff8a65' }} data-testid="projector-shift-warning">
          {shift.issues.join('. ')}.
        </p>
      )}
      {model && (
        <p className={styles.hint}>Specs are typical published figures; check the datasheet before ordering.</p>
      )}
    </div>
  );
}
