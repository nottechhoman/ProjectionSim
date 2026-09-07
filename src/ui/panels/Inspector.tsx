import { useAppStore } from '../../store';
import type { TestPattern } from '../../types';
import { eulerYXZToQuaternion, quaternionToEulerYXZ } from '../../utils/euler';
import { fromDisplayUnit, toDisplayUnit } from '../../utils/units';
import { NumInput } from '../components/NumInput';
import { CalcResults } from './CalcResults';
import styles from './Inspector.module.css';

const PATTERNS: { value: TestPattern; label: string }[] = [
  { value: 'checkerboard', label: 'Checkerboard' },
  { value: 'uvGrid', label: 'UV Grid' },
  { value: 'colorBars', label: 'Color Bars' },
  { value: 'white', label: 'White' },
  { value: 'projectorId', label: 'Projector ID' },
];

export function Inspector() {
  const selectedObjectId = useAppStore((s) => s.selectedObjectId);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const projectors = useAppStore((s) => s.projectors);
  const displayUnit = useAppStore((s) => s.displayUnit);
  const opticsError = useAppStore((s) => s.calculationResults.opticsError);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const rightPanelPoppedOut = useAppStore((s) => s.rightPanelPoppedOut);
  const popOutRightPanel = useAppStore((s) => s.popOutRightPanel);
  const dockRightPanel = useAppStore((s) => s.dockRightPanel);
  const updateProjector = useAppStore((s) => s.updateProjector);
  const updateProjectorOptics = useAppStore((s) => s.updateProjectorOptics);
  const removeProjector = useAppStore((s) => s.removeProjector);
  const removeSceneObject = useAppStore((s) => s.removeSceneObject);
  const updateSceneObjectTransform = useAppStore((s) => s.updateSceneObjectTransform);
  const updateSceneObjectFlags = useAppStore((s) => s.updateSceneObjectFlags);
  const mediaAssets = useAppStore((s) => s.mediaAssets);
  const setProjectorMedia = useAppStore((s) => s.setProjectorMedia);

  const projector = projectors.find((p) => p.id === selectedObjectId);
  const sceneObject = sceneObjects.find((o) => o.id === selectedObjectId);

  const header = (
    <div className={styles.header} data-panel-header>
      <span>Inspector</span>
      <div className={styles.headerActions}>
        {rightPanelPoppedOut ? (
          <button type="button" className={styles.actionBtn} onClick={dockRightPanel} title="Dock panel">
            ⊟
          </button>
        ) : (
          <button type="button" className={styles.actionBtn} onClick={popOutRightPanel} title="Pop out panel">
            ⧉
          </button>
        )}
        <button type="button" className={styles.collapseBtn} onClick={toggleRightPanel} title="Hide inspector">
          ×
        </button>
      </div>
    </div>
  );

  if (!selectedObjectId || (!projector && !sceneObject)) {
    return (
      <div className={styles.panel}>
        {header}
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
      {header}

      {opticsError && projector && (
        <div className={styles.error}>{opticsError}</div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Transform</div>
        <p className={styles.hint}>Click a value to type · drag gizmo rings for local X / Y / Z rotation</p>
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
        <NumInput
          label="Rotation X"
          value={euler.pitch}
          step={0.1}
          onChange={(v) => setRotation(euler.yaw, v, euler.roll)}
        />
        <NumInput
          label="Rotation Y"
          value={euler.yaw}
          step={0.1}
          onChange={(v) => setRotation(v, euler.pitch, euler.roll)}
        />
        <NumInput
          label="Rotation Z"
          value={euler.roll}
          step={0.1}
          onChange={(v) => setRotation(euler.yaw, euler.pitch, v)}
        />
      </div>

      {sceneObject && !projector && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Surface</div>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={sceneObject.visibleInEditor}
              onChange={(e) => updateSceneObjectFlags(sceneObject.id, { visibleInEditor: e.target.checked })}
            />
            Visible
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={sceneObject.receivesProjection}
              onChange={(e) => updateSceneObjectFlags(sceneObject.id, { receivesProjection: e.target.checked })}
            />
            Receives projection
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={sceneObject.blocksProjection}
              onChange={(e) => updateSceneObjectFlags(sceneObject.id, { blocksProjection: e.target.checked })}
            />
            Blocks projection
          </label>
          <button type="button" className={styles.dangerBtn} onClick={() => removeSceneObject(sceneObject.id)}>
            Delete object
          </button>
        </div>
      )}

      {projector && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Projector</div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={projector.enabled}
                onChange={(e) => updateProjector(projector.id, { enabled: e.target.checked })}
              />
              Enabled
            </label>
            <NumInput
              label="Brightness"
              value={projector.brightness}
              step={0.05}
              onChange={(v) => updateProjector(projector.id, { brightness: Math.max(0, v) })}
            />
            <p className={styles.hint}>
              Use toolbar Composite → Solo, then select each projector here to preview its image on surfaces.
            </p>
            <button type="button" className={styles.dangerBtn} onClick={() => removeProjector(projector.id)}>
              Delete projector
            </button>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Blend edges</div>
            <p className={styles.hint}>Feather width as fraction of image (0–0.5)</p>
            <NumInput
              label="Left"
              value={projector.blendEdges.left}
              step={0.01}
              onChange={(v) =>
                updateProjector(projector.id, {
                  blendEdges: { ...projector.blendEdges, left: Math.min(0.5, Math.max(0, v)) },
                })
              }
            />
            <NumInput
              label="Right"
              value={projector.blendEdges.right}
              step={0.01}
              onChange={(v) =>
                updateProjector(projector.id, {
                  blendEdges: { ...projector.blendEdges, right: Math.min(0.5, Math.max(0, v)) },
                })
              }
            />
            <NumInput
              label="Top"
              value={projector.blendEdges.top}
              step={0.01}
              onChange={(v) =>
                updateProjector(projector.id, {
                  blendEdges: { ...projector.blendEdges, top: Math.min(0.5, Math.max(0, v)) },
                })
              }
            />
            <NumInput
              label="Bottom"
              value={projector.blendEdges.bottom}
              step={0.01}
              onChange={(v) =>
                updateProjector(projector.id, {
                  blendEdges: { ...projector.blendEdges, bottom: Math.min(0.5, Math.max(0, v)) },
                })
              }
            />
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={projector.outerEdgeFade}
                onChange={(e) => updateProjector(projector.id, { outerEdgeFade: e.target.checked })}
              />
              Outer edge fade
            </label>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Media Source</div>
            <div className={styles.row}>
              <label>Source</label>
              <select
                value={projector.mediaSource}
                onChange={(e) =>
                  setProjectorMedia(
                    projector.id,
                    e.target.value as 'pattern' | 'image' | 'video',
                    e.target.value === 'pattern' ? null : projector.mediaAssetId,
                  )
                }
              >
                <option value="pattern">Test pattern</option>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>
            {(projector.mediaSource === 'image' || projector.mediaSource === 'video') && (
              <div className={styles.row}>
                <label>Asset</label>
                <select
                  value={projector.mediaAssetId ?? ''}
                  onChange={(e) =>
                    setProjectorMedia(projector.id, projector.mediaSource, e.target.value || null)
                  }
                >
                  <option value="">— select —</option>
                  {mediaAssets
                    .filter((a) => a.kind === projector.mediaSource)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
              </div>
            )}
            {projector.mediaSource !== 'pattern' && (
              <div className={styles.row}>
                <label>Fit</label>
                <select
                  value={projector.mediaFit}
                  onChange={(e) =>
                    setProjectorMedia(
                      projector.id,
                      projector.mediaSource,
                      projector.mediaAssetId,
                      e.target.value as 'contain' | 'cover' | 'stretch',
                    )
                  }
                >
                  <option value="contain">Contain</option>
                  <option value="cover">Cover</option>
                  <option value="stretch">Stretch</option>
                </select>
              </div>
            )}
          </div>

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
