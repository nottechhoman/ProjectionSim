import { useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../../store';
import type { DisplayUnit, MappingMode, ProjectionCompositeMode, ViewPreset } from '../../types';
import { MAX_PROJECTORS } from '../../types';
import { resolveSharedCanvasSupport } from '../../projection/sharedCanvasMapping';
import { listSharedContentSourceProjectors } from '../../store/reliabilitySettings';
import { APP_NAME, APP_NAME_SHORT } from '../../branding/appName';
import styles from './Toolbar.module.css';

const LOGO_URL = `${import.meta.env.BASE_URL}logo.svg`;

const UNITS: DisplayUnit[] = ['m', 'cm', 'mm'];
const VIEW_PRESETS: { id: ViewPreset; label: string }[] = [
  { id: 'persp', label: 'Persp' },
  { id: 'top', label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
];

interface ToolbarProps {
  compact?: boolean;
}

export function Toolbar({ compact = false }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const displayUnit = useAppStore((s) => s.displayUnit);
  const viewPreset = useAppStore((s) => s.viewPreset);
  const transformMode = useAppStore((s) => s.transformMode);
  const materialPreviewMode = useAppStore((s) => s.materialPreviewMode);
  const projectionCompositeMode = useAppStore((s) => s.projectionCompositeMode);
  const mappingMode = useAppStore((s) => s.mappingMode);
  const sharedContentSourceProjectorId = useAppStore((s) => s.sharedContentSourceProjectorId);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const projectors = useAppStore((s) => s.projectors);
  const projectorCount = useAppStore((s) => s.projectors.length);
  const projectName = useAppStore((s) => s.projectName);
  const setDisplayUnit = useAppStore((s) => s.setDisplayUnit);
  const setViewPreset = useAppStore((s) => s.setViewPreset);
  const setTransformMode = useAppStore((s) => s.setTransformMode);
  const setMaterialPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);
  const setProjectionCompositeMode = useAppStore((s) => s.setProjectionCompositeMode);
  const setMappingMode = useAppStore((s) => s.setMappingMode);
  const setSharedContentSourceProjectorId = useAppStore((s) => s.setSharedContentSourceProjectorId);
  const addProjector = useAppStore((s) => s.addProjector);
  const addBox = useAppStore((s) => s.addBox);
  const addCurvedScreen = useAppStore((s) => s.addCurvedScreen);
  const addLedWall = useAppStore((s) => s.addLedWall);
  const importFile = useAppStore((s) => s.importFile);
  const newProject = useAppStore((s) => s.newProject);
  const saveProjectToFile = useAppStore((s) => s.saveProjectToFile);
  const loadProjectFromFile = useAppStore((s) => s.loadProjectFromFile);
  const measureMode = useAppStore((s) => s.measureMode);
  const setMeasureMode = useAppStore((s) => s.setMeasureMode);
  const historyPast = useAppStore((s) => s.historyPast);
  const historyFuture = useAppStore((s) => s.historyFuture);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const exportCalculationCsv = useAppStore((s) => s.exportCalculationCsv);
  const exportCalculationHtml = useAppStore((s) => s.exportCalculationHtml);
  const showProjectionBeam = useAppStore((s) => s.showProjectionBeam);
  const sharedCanvasSupport = resolveSharedCanvasSupport(sceneObjects);

  const handleOpenFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        void loadProjectFromFile(reader.result);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    let scale = 1;
    if (/\.(glb|gltf|obj)$/i.test(file.name)) {
      const input = window.prompt(
        'Model scale factor (1 = file units treated as meters):',
        '1',
      );
      scale = parseFloat(input ?? '1');
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;
    }
    await importFile(file, scale);
    event.target.value = '';
  };

  return (
    <div className={`${styles.toolbar} ${compact ? styles.compact : ''}`}>
      <div className={styles.brand} title={APP_NAME}>
        <img src={LOGO_URL} alt="" className={styles.brandLogo} width={28} height={28} />
        <span className={styles.brandShort}>{APP_NAME_SHORT}</span>
        <span className={styles.brandFull}>{APP_NAME}</span>
      </div>
      <div className={styles.separator} />
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

      <div className={styles.group}>
        <span className={styles.label}>Gizmo</span>
        <button
          type="button"
          className={transformMode === 'translate' ? styles.active : undefined}
          onClick={() => setTransformMode('translate')}
          title="Move (W)"
        >
          Move
        </button>
        <button
          type="button"
          className={transformMode === 'rotate' ? styles.active : undefined}
          onClick={() => setTransformMode('rotate')}
          title="Rotate (E)"
        >
          Rotate
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <span className={styles.label}>Helpers</span>
        <button
          type="button"
          className={showProjectionBeam ? styles.active : undefined}
          onClick={() => useAppStore.getState().toggleProjectionBeam()}
          title={
            showProjectionBeam
              ? 'Hide beam rays from lens to image frame'
              : 'Show beam rays from lens to image frame'
          }
        >
          Beam
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <button type="button" onClick={addBox}>Add Box</button>
        <button type="button" onClick={addCurvedScreen}>Curved Screen</button>
        <button type="button" onClick={addLedWall}>LED Wall</button>
        <button type="button" onClick={() => importInputRef.current?.click()}>Import</button>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <button type="button" onClick={addProjector} disabled={projectorCount >= MAX_PROJECTORS}>
          + Projector
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <span className={styles.label}>Mapping</span>
        {(['raw', 'sharedCanvas'] as MappingMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={mappingMode === mode ? styles.active : undefined}
            onClick={() => setMappingMode(mode)}
            disabled={mode === 'sharedCanvas' && !sharedCanvasSupport.supported}
            data-testid={mode === 'sharedCanvas' ? 'mapping-shared-button' : `mapping-${mode}-button`}
            title={
              mode === 'sharedCanvas' && !sharedCanvasSupport.supported
                ? sharedCanvasSupport.reason ?? 'Shared canvas unavailable'
                : mode === 'sharedCanvas'
                  ? 'Align content to the receiving surface coordinate system'
                  : 'Each projector uses its own raster coordinates'
            }
          >
            {mode === 'raw' ? 'Raw' : 'Shared'}
          </button>
        ))}
        {mappingMode === 'sharedCanvas' && (
          <label className={styles.label} style={{ marginLeft: 8 }}>
            Shared content source
            <select
              aria-label="Shared content source"
              data-testid="shared-content-source-select"
              value={sharedContentSourceProjectorId ?? ''}
              onChange={(e) => setSharedContentSourceProjectorId(e.target.value || null)}
              disabled={projectors.length === 0}
            >
              {projectors.length === 0 ? (
                <option value="">No projectors</option>
              ) : (
                listSharedContentSourceProjectors(projectors).map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.name}{proj.enabled ? '' : ' (disabled)'}
                  </option>
                ))
              )}
            </select>
          </label>
        )}
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <span className={styles.label}>Composite</span>
        {(['solo', 'unblended', 'blended', 'heatmap'] as ProjectionCompositeMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={projectionCompositeMode === mode ? styles.active : undefined}
            onClick={() => setProjectionCompositeMode(mode)}
            disabled={projectorCount < 2 && mode !== 'solo' && mode !== 'unblended'}
            title={
              mode === 'solo'
                ? 'Show only the selected projector on surfaces'
                : mode === 'unblended'
                  ? 'Show every projector at once — assign different media per projector in Inspector'
                  : projectorCount < 2
                    ? 'Add a second projector'
                    : undefined
            }
          >
            {mode === 'solo'
              ? 'Solo'
              : mode === 'unblended'
                ? 'Raw'
                : mode === 'blended'
                  ? 'Blend'
                  : 'Coverage Count'}
          </button>
        ))}
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <span className={styles.label}>Preview</span>
        <button
          type="button"
          className={materialPreviewMode === 'projectionPreview' ? styles.active : undefined}
          onClick={() => setMaterialPreviewMode('projectionPreview')}
        >
          Projection
        </button>
        <button
          type="button"
          className={materialPreviewMode === 'projectionUv' ? styles.active : undefined}
          onClick={() => setMaterialPreviewMode('projectionUv')}
          title="Projector raster UV on receiving surfaces"
        >
          UV
        </button>
        <button
          type="button"
          className={materialPreviewMode === 'falloff' ? styles.active : undefined}
          onClick={() => setMaterialPreviewMode('falloff')}
          title="Inverse-square brightness heatmap from projector (near = hot, far = cold)"
        >
          Falloff
        </button>
        <button
          type="button"
          className={materialPreviewMode === 'original' ? styles.active : undefined}
          onClick={() => setMaterialPreviewMode('original')}
        >
          Original
        </button>
      </div>

      <div className={styles.separator} />

      <button
        type="button"
        className={measureMode ? styles.active : undefined}
        onClick={() => setMeasureMode(!measureMode)}
        title="Measure distance (M)"
      >
        Measure
      </button>

      <div className={styles.separator} />

      <div className={styles.group}>
        <button type="button" onClick={undo} disabled={historyPast.length === 0} title="Undo (Ctrl+Z)">
          Undo
        </button>
        <button type="button" onClick={redo} disabled={historyFuture.length === 0} title="Redo (Ctrl+Shift+Z)">
          Redo
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <button type="button" onClick={exportCalculationCsv} title="Download CSV calculation report">
          CSV
        </button>
        <button type="button" onClick={exportCalculationHtml} title="Download printable HTML report">
          HTML
        </button>
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Start a new project?')) newProject();
          }}
        >
          New
        </button>
        <button type="button" onClick={() => fileInputRef.current?.click()}>Open</button>
        <button type="button" onClick={saveProjectToFile} title={`Save "${projectName}"`}>
          Save
        </button>
        <input ref={fileInputRef} type="file" accept=".json,.projectionlab.json" className={styles.hiddenFile} onChange={handleOpenFile} />
        <input ref={importInputRef} type="file" accept="image/*,video/*,.glb,.gltf,.obj" className={styles.hiddenFile} onChange={handleImport} />
      </div>
    </div>
  );
}
