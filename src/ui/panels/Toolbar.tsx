import { useAppStore } from '../../store';
import type { DisplayUnit, ViewPreset } from '../../types';
import styles from './Toolbar.module.css';

const UNITS: DisplayUnit[] = ['m', 'cm', 'mm'];
const VIEW_PRESETS: { id: ViewPreset; label: string }[] = [
  { id: 'persp', label: 'Persp' },
  { id: 'top', label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
];

export function Toolbar() {
  const displayUnit = useAppStore((s) => s.displayUnit);
  const viewPreset = useAppStore((s) => s.viewPreset);
  const setDisplayUnit = useAppStore((s) => s.setDisplayUnit);
  const setViewPreset = useAppStore((s) => s.setViewPreset);
  const addBox = useAppStore((s) => s.addBox);

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <span className={styles.label}>Units</span>
        <select
          value={displayUnit}
          onChange={(e) => setDisplayUnit(e.target.value as DisplayUnit)}
          aria-label="Display units"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <span className={styles.label}>View</span>
        {VIEW_PRESETS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={viewPreset === id ? styles.active : undefined}
            onClick={() => setViewPreset(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.separator} />

      <button type="button" onClick={addBox}>Add Box</button>

      <div className={styles.separator} />

      <button type="button" disabled className={styles.disabled}>
        Measure (M4)
      </button>

      <div className={styles.separator} />

      <div className={styles.group}>
        <button type="button" disabled className={styles.disabled}>
          New<span className={styles.m2Label}>M2</span>
        </button>
        <button type="button" disabled className={styles.disabled}>
          Open<span className={styles.m2Label}>M2</span>
        </button>
        <button type="button" disabled className={styles.disabled}>
          Save<span className={styles.m2Label}>M2</span>
        </button>
      </div>
    </div>
  );
}
