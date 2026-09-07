import { useAppStore } from '../../store';
import type { TestPattern } from '../../types';
import { eulerYXZToQuaternion, quaternionToEulerYXZ } from '../../utils/euler';
import { fromDisplayUnit, toDisplayUnit } from '../../utils/units';
import { CalcResults } from './CalcResults';
import styles from './Inspector.module.css';

const PATTERNS: { value: TestPattern; label: string }[] = [
  { value: 'checkerboard', label: 'Checkerboard' },
  { value: 'uvGrid', label: 'UV Grid' },
  { value: 'colorBars', label: 'Color Bars' },
  { value: 'white', label: 'White' },
  { value: 'projectorId', label: 'Projector ID' },
];

function NumInput({
  label,
  value,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.row}>
      <label>{label}</label>
      <input
        type="number"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  );
}

export function Inspector() {
  const selectedObjectId = useAppStore((s) => s.selectedObjectId);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const projectors = useAppStore((s) => s.projectors);
  const displayUnit = useAppStore((s) => s.displayUnit);
  const opticsError = useAppStore((s) => s.calculationResults.opticsError);
  const updateProjector = useAppStore((s) => s.updateProjector);
  const updateProjectorOptics = useAppStore((s) => s.updateProjectorOptics);
  const updateSceneObjectTransform = useAppStore((s) => s.updateSceneObjectTransform);

  const projector = projectors.find((p) => p.id === selectedObjectId);
  const sceneObject = sceneObjects.find((o) => o.id === selectedObjectId);

  if (!selectedObjectId || (!projector && !sceneObject)) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>Inspector</div>
        <div className={styles.empty}>Select an object or projector</div>
      </div>
    );
  }

  const transform = projector?.transform ?? sceneObject!.transform;
  const euler = quaternionToEulerYXZ(transform.quaternion);

  const setPosition = (axis: 'x' | 'y' | 'z', displayValue: number) => {
    const meters = fromDisplayUnit(displayValue, displayUnit);
    const position = { ...transform.position, [axis]: meters };
    if (projector) {
      updateProjector(projector.id, { transform: { ...transform, position } });
    } else if (sceneObject) {
      updateSceneObjectTransform(sceneObject.id, { position });
    }
  };

  const setRotation = (yaw: number, pitch: number, roll: number) => {
    const quaternion = eulerYXZToQuaternion(yaw, pitch, roll);
    if (projector) {
      updateProjector(projector.id, { transform: { ...transform, quaternion } });
    } else if (sceneObject) {
      updateSceneObjectTransform(sceneObject.id, { quaternion });
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>Inspector</div>

      {opticsError && projector && (
        <div className={styles.error}>{opticsError}</div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Transform</div>
        <NumInput
          label="Pos X"
          value={toDisplayUnit(transform.position.x, displayUnit)}
          onChange={(v) => setPosition('x', v)}
        />
        <NumInput
          label="Pos Y"
          value={toDisplayUnit(transform.position.y, displayUnit)}
          onChange={(v) => setPosition('y', v)}
        />
        <NumInput
          label="Pos Z"
          value={toDisplayUnit(transform.position.z, displayUnit)}
          onChange={(v) => setPosition('z', v)}
        />
        <NumInput label="Yaw" value={euler.yaw} step={0.1} onChange={(v) => setRotation(v, euler.pitch, euler.roll)} />
        <NumInput label="Pitch" value={euler.pitch} step={0.1} onChange={(v) => setRotation(euler.yaw, v, euler.roll)} />
        <NumInput label="Roll" value={euler.roll} step={0.1} onChange={(v) => setRotation(euler.yaw, euler.pitch, v)} />
      </div>

      {projector && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Optics</div>
            <NumInput
              label="Throw"
              value={projector.optics.throwRatio}
              step={0.01}
              onChange={(v) => updateProjectorOptics(projector.id, { throwRatio: v })}
            />
            <NumInput
              label="Res W"
              value={projector.optics.resolution.width}
              step={1}
              onChange={(v) =>
                updateProjectorOptics(projector.id, {
                  resolution: { ...projector.optics.resolution, width: Math.round(v) },
                })
              }
            />
            <NumInput
              label="Res H"
              value={projector.optics.resolution.height}
              step={1}
              onChange={(v) =>
                updateProjectorOptics(projector.id, {
                  resolution: { ...projector.optics.resolution, height: Math.round(v) },
                })
              }
            />
            <NumInput
              label="Shift H"
              value={projector.optics.lensShiftH}
              step={0.01}
              onChange={(v) => updateProjectorOptics(projector.id, { lensShiftH: v })}
            />
            <NumInput
              label="Shift V"
              value={projector.optics.lensShiftV}
              step={0.01}
              onChange={(v) => updateProjectorOptics(projector.id, { lensShiftV: v })}
            />
            <div className={styles.row}>
              <label>Pattern</label>
              <select
                value={projector.testPattern}
                onChange={(e) =>
                  updateProjector(projector.id, { testPattern: e.target.value as TestPattern })
                }
              >
                {PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          <CalcResults />
        </>
      )}
    </div>
  );
}
