import { useAppStore } from '../../store';
import { getCalculationTargetObject } from '../../store/reliabilitySettings';
import type { ProjectionSides, TestPattern, Vec3 } from '../../types';
import { computeProjectorLookAtQuaternion, defaultLookAtTarget } from '../../optics/lookAt';
import { supportsProjectionSides } from '../../projection/projectionSides';
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
  const pushSceneHistoryCheckpoint = useAppStore((s) => s.pushSceneHistoryCheckpoint);
  const removeProjector = useAppStore((s) => s.removeProjector);
  const removeSceneObject = useAppStore((s) => s.removeSceneObject);
  const updateSceneObjectTransform = useAppStore((s) => s.updateSceneObjectTransform);
  const updateSceneObjectFlags = useAppStore((s) => s.updateSceneObjectFlags);
  const updateSceneObjectDimensions = useAppStore((s) => s.updateSceneObjectDimensions);
  const updateSceneObjectLedWall = useAppStore((s) => s.updateSceneObjectLedWall);
  const mediaAssets = useAppStore((s) => s.mediaAssets);
  const setProjectorMedia = useAppStore((s) => s.setProjectorMedia);
  const calculationTargetId = useAppStore((s) => s.calculationTargetId);

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
    pushSceneHistoryCheckpoint();
    const meters = fromDisplayUnit(displayValue, displayUnit);
    const position = { ...transform.position, [axis]: meters };
    if (projector) {
      updateProjector(projector.id, { transform: { ...transform, position } });
    } else if (sceneObject) {
      updateSceneObjectTransform(sceneObject.id, { position });
    }
  };

  const setRotation = (yaw: number, pitch: number, roll: number) => {
    pushSceneHistoryCheckpoint();
    if (projector?.lookAtEnabled) {
      const target = projector.lookAtTarget ?? defaultLookAtTarget();
      const quaternion = computeProjectorLookAtQuaternion(transform.position, target, roll);
      updateProjector(projector.id, { transform: { ...transform, quaternion } });
      return;
    }
    const quaternion = eulerYXZToQuaternion(yaw, pitch, roll);
    if (projector) {
      updateProjector(projector.id, { transform: { ...transform, quaternion } });
    } else if (sceneObject) {
      updateSceneObjectTransform(sceneObject.id, { quaternion });
    }
  };

  const setLookAtTarget = (axis: 'x' | 'y' | 'z', displayValue: number) => {
    if (!projector) return;
    pushSceneHistoryCheckpoint();
    const meters = fromDisplayUnit(displayValue, displayUnit);
    const base = projector.lookAtTarget ?? defaultLookAtTarget();
    const lookAtTarget: Vec3 = { ...base, [axis]: meters };
    updateProjector(projector.id, { lookAtTarget });
  };

  const setLookAtToScreenCenter = () => {
    if (!projector) return;
    pushSceneHistoryCheckpoint();
    const screen = getCalculationTargetObject(sceneObjects, calculationTargetId);
    const lookAtTarget = screen
      ? { ...screen.transform.position }
      : defaultLookAtTarget();
    updateProjector(projector.id, { lookAtTarget });
  };

  const patchProjector = (patch: Parameters<typeof updateProjector>[1]) => {
    if (!projector) return;
    pushSceneHistoryCheckpoint();
    updateProjector(projector.id, patch);
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
        {projector?.lookAtEnabled && (
          <p className={styles.hint}>
            Look-at is on: use gizmo X/Y to orbit the target; rotation Z is roll only.
          </p>
        )}
      </div>

      {projector && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Look At</div>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={projector.lookAtEnabled ?? false}
              onChange={(e) => patchProjector({ lookAtEnabled: e.target.checked })}
            />
            Aim at target (orbit on rotate)
          </label>
          {projector.lookAtEnabled && (
            <>
              <NumInput
                label="Target X"
                value={toDisplayUnit((projector.lookAtTarget ?? defaultLookAtTarget()).x, displayUnit)}
                onChange={(v) => setLookAtTarget('x', v)}
              />
              <NumInput
                label="Target Y"
                value={toDisplayUnit((projector.lookAtTarget ?? defaultLookAtTarget()).y, displayUnit)}
                onChange={(v) => setLookAtTarget('y', v)}
              />
              <NumInput
                label="Target Z"
                value={toDisplayUnit((projector.lookAtTarget ?? defaultLookAtTarget()).z, displayUnit)}
                onChange={(v) => setLookAtTarget('z', v)}
              />
              <button type="button" className={styles.actionBtn} onClick={setLookAtToScreenCenter}>
                Use calculation target center
              </button>
            </>
          )}
        </div>
      )}

      {sceneObject && !projector && (
        <>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Size</div>
          <p className={styles.hint}>Dimensions use the toolbar unit ({displayUnit}); stored internally in meters.</p>
          {(sceneObject.type === 'screen' ||
            sceneObject.type === 'floor' ||
            sceneObject.type === 'box' ||
            sceneObject.type === 'ledWall') && (
            <>
              <NumInput
                label={`Width (${displayUnit})`}
                value={toDisplayUnit(sceneObject.dimensions.width, displayUnit)}
                step={displayUnit === 'mm' ? 10 : displayUnit === 'cm' ? 1 : 0.1}
                onChange={(v) => {
                  pushSceneHistoryCheckpoint();
                  updateSceneObjectDimensions(sceneObject.id, {
                    dimensions: { width: Math.max(fromDisplayUnit(v, displayUnit), 0.01) },
                  });
                }}
              />
              <NumInput
                label={`Height (${displayUnit})`}
                value={toDisplayUnit(sceneObject.dimensions.height, displayUnit)}
                step={displayUnit === 'mm' ? 10 : displayUnit === 'cm' ? 1 : 0.1}
                onChange={(v) => {
                  pushSceneHistoryCheckpoint();
                  updateSceneObjectDimensions(sceneObject.id, {
                    dimensions: { height: Math.max(fromDisplayUnit(v, displayUnit), 0.01) },
                  });
                }}
              />
              {sceneObject.type === 'box' && (
                <NumInput
                  label={`Depth (${displayUnit})`}
                  value={toDisplayUnit(sceneObject.dimensions.depth ?? 1, displayUnit)}
                  step={displayUnit === 'mm' ? 10 : displayUnit === 'cm' ? 1 : 0.1}
                  onChange={(v) => {
                    pushSceneHistoryCheckpoint();
                    updateSceneObjectDimensions(sceneObject.id, {
                      dimensions: { depth: Math.max(fromDisplayUnit(v, displayUnit), 0.01) },
                    });
                  }}
                />
              )}
            </>
          )}
          {sceneObject.type === 'curvedScreen' && (
            <>
              <NumInput
                label={`Radius (${displayUnit})`}
                value={toDisplayUnit(sceneObject.curved?.radius ?? 4, displayUnit)}
                step={displayUnit === 'mm' ? 10 : displayUnit === 'cm' ? 1 : 0.1}
                onChange={(v) => {
                  pushSceneHistoryCheckpoint();
                  updateSceneObjectDimensions(sceneObject.id, {
                    curved: { radius: Math.max(fromDisplayUnit(v, displayUnit), 0.01) },
                  });
                }}
              />
              <NumInput
                label="Arc angle (°)"
                value={sceneObject.curved?.arcAngleDeg ?? 90}
                step={1}
                onChange={(v) => {
                  pushSceneHistoryCheckpoint();
                  updateSceneObjectDimensions(sceneObject.id, {
                    curved: { arcAngleDeg: Math.max(Math.min(v, 359), 1) },
                  });
                }}
              />
              <NumInput
                label={`Height (${displayUnit})`}
                value={toDisplayUnit(
                  sceneObject.curved?.height ?? sceneObject.dimensions.height,
                  displayUnit,
                )}
                step={displayUnit === 'mm' ? 10 : displayUnit === 'cm' ? 1 : 0.1}
                onChange={(v) => {
                  pushSceneHistoryCheckpoint();
                  const height = Math.max(fromDisplayUnit(v, displayUnit), 0.01);
                  updateSceneObjectDimensions(sceneObject.id, {
                    curved: { height },
                    dimensions: { height },
                  });
                }}
              />
            </>
          )}
          {sceneObject.type === 'model' && (
            <NumInput
              label="Model scale"
              value={sceneObject.modelScale ?? 1}
              step={0.05}
              onChange={(v) => {
                pushSceneHistoryCheckpoint();
                updateSceneObjectDimensions(sceneObject.id, {
                  modelScale: Math.max(v, 0.01),
                });
              }}
            />
          )}
        </div>
        {sceneObject.type === 'ledWall' && (
          <div className={styles.section}>
            <div className={styles.sectionTitle}>LED Display</div>
            <p className={styles.hint}>
              Direct pixel surface — assign image or video; independent from projector content.
            </p>
            <NumInput
              label="Resolution width (px)"
              value={sceneObject.ledWall?.pixelResolution.width ?? 1920}
              step={1}
              onChange={(v) => {
                pushSceneHistoryCheckpoint();
                updateSceneObjectLedWall(sceneObject.id, {
                  pixelResolution: { width: Math.max(Math.round(v), 1) },
                });
              }}
            />
            <NumInput
              label="Resolution height (px)"
              value={sceneObject.ledWall?.pixelResolution.height ?? 1080}
              step={1}
              onChange={(v) => {
                pushSceneHistoryCheckpoint();
                updateSceneObjectLedWall(sceneObject.id, {
                  pixelResolution: { height: Math.max(Math.round(v), 1) },
                });
              }}
            />
            <div className={styles.row}>
              <label htmlFor="led-media-source">Media source</label>
              <select
                id="led-media-source"
                value={sceneObject.ledWall?.mediaSource ?? 'image'}
                onChange={(e) => {
                  pushSceneHistoryCheckpoint();
                  const source = e.target.value as 'image' | 'video';
                  updateSceneObjectLedWall(sceneObject.id, {
                    mediaSource: source,
                    mediaAssetId: null,
                  });
                }}
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div className={styles.row}>
              <label htmlFor="led-media-asset">Media asset</label>
              <select
                id="led-media-asset"
                value={sceneObject.ledWall?.mediaAssetId ?? ''}
                onChange={(e) => {
                  pushSceneHistoryCheckpoint();
                  updateSceneObjectLedWall(sceneObject.id, {
                    mediaAssetId: e.target.value || null,
                  });
                }}
              >
                <option value="">None</option>
                {mediaAssets
                  .filter((asset) => asset.kind === (sceneObject.ledWall?.mediaSource ?? 'image'))
                  .map((asset) => (
                    <option key={asset.id} value={asset.id}>{asset.name}</option>
                  ))}
              </select>
            </div>
            <div className={styles.row}>
              <label htmlFor="led-media-fit">Fit mode</label>
              <select
                id="led-media-fit"
                value={sceneObject.ledWall?.mediaFit ?? 'contain'}
                onChange={(e) => {
                  pushSceneHistoryCheckpoint();
                  updateSceneObjectLedWall(sceneObject.id, {
                    mediaFit: e.target.value as 'contain' | 'cover' | 'stretch',
                  });
                }}
              >
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
          </div>
        )}
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
          {sceneObject.type !== 'ledWall' && (
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={sceneObject.receivesProjection}
                onChange={(e) => updateSceneObjectFlags(sceneObject.id, { receivesProjection: e.target.checked })}
              />
              Receives projection
            </label>
          )}
          {sceneObject.type !== 'ledWall' && (
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                data-testid="blocks-projection-checkbox"
                checked={sceneObject.blocksProjection}
                onChange={(e) =>
                  updateSceneObjectFlags(sceneObject.id, { blocksProjection: e.target.checked })
                }
              />
              Blocks projection
            </label>
          )}
          {((sceneObject.receivesProjection && supportsProjectionSides(sceneObject.type)) ||
            sceneObject.type === 'ledWall') && (
            <div className={styles.row}>
              <label htmlFor="projection-sides-select">
                {sceneObject.type === 'ledWall' ? 'Display sides' : 'Projection sides'}
              </label>
              <select
                id="projection-sides-select"
                aria-label={sceneObject.type === 'ledWall' ? 'Display sides' : 'Projection sides'}
                data-testid="projection-sides-select"
                value={sceneObject.projectionSides ?? 'front'}
                onChange={(e) => {
                  const sides = e.target.value as ProjectionSides;
                  if (sceneObject.type === 'ledWall') {
                    pushSceneHistoryCheckpoint();
                    updateSceneObjectLedWall(sceneObject.id, { projectionSides: sides });
                    return;
                  }
                  updateSceneObjectFlags(sceneObject.id, { projectionSides: sides });
                }}
              >
                <option value="front">Front only</option>
                <option value="back">Back only</option>
                <option value="both">Both sides</option>
              </select>
            </div>
          )}
          <button type="button" className={styles.dangerBtn} onClick={() => removeSceneObject(sceneObject.id)}>
            Delete object
          </button>
        </div>
        </>
      )}

      {projector && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Projector</div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={projector.enabled}
                onChange={(e) => patchProjector({ enabled: e.target.checked })}
              />
              Enabled
            </label>
            <NumInput
              label="Brightness"
              value={projector.brightness}
              step={0.05}
              onChange={(v) => patchProjector({ brightness: Math.max(0, v) })}
            />
            <p className={styles.hint}>
              Assign a different pattern, image, or video per projector. Use toolbar Composite → Raw to show all
              projectors at once.
            </p>
            <button type="button" className={styles.dangerBtn} onClick={() => removeProjector(projector.id)}>
              Delete projector
            </button>
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
            {projector.mediaSource === 'pattern' && (
              <div className={styles.row}>
                <label>Pattern</label>
                <select
                  value={projector.testPattern}
                  onChange={(e) =>
                    patchProjector({ testPattern: e.target.value as TestPattern })
                  }
                >
                  {PATTERNS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}
            {(projector.mediaSource === 'image' || projector.mediaSource === 'video') && (
              <>
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
                {mediaAssets.filter((a) => a.kind === projector.mediaSource).length === 0 && (
                  <p className={styles.hint}>No {projector.mediaSource} imported yet — use toolbar Import.</p>
                )}
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
              </>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Blend edges</div>
            <p className={styles.hint}>Feather width as fraction of image (0–0.5)</p>
            <NumInput
              label="Left"
              value={projector.blendEdges.left}
              step={0.01}
              onChange={(v) =>
                patchProjector({
                  blendEdges: { ...projector.blendEdges, left: Math.min(0.5, Math.max(0, v)) },
                })
              }
            />
            <NumInput
              label="Right"
              value={projector.blendEdges.right}
              step={0.01}
              onChange={(v) =>
                patchProjector({
                  blendEdges: { ...projector.blendEdges, right: Math.min(0.5, Math.max(0, v)) },
                })
              }
            />
            <NumInput
              label="Top"
              value={projector.blendEdges.top}
              step={0.01}
              onChange={(v) =>
                patchProjector({
                  blendEdges: { ...projector.blendEdges, top: Math.min(0.5, Math.max(0, v)) },
                })
              }
            />
            <NumInput
              label="Bottom"
              value={projector.blendEdges.bottom}
              step={0.01}
              onChange={(v) =>
                patchProjector({
                  blendEdges: { ...projector.blendEdges, bottom: Math.min(0.5, Math.max(0, v)) },
                })
              }
            />
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={projector.outerEdgeFade}
                onChange={(e) => patchProjector({ outerEdgeFade: e.target.checked })}
              />
              Outer edge fade
            </label>
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
          </div>
        </>
      )}

      <CalcResults />
    </div>
  );
}
