import { useRef, type ChangeEvent } from 'react';
import { useAppStore } from '../../store';
import type { DisplayUnit, ProjectionCompositeMode, ViewPreset } from '../../types';
import { MAX_PROJECTORS } from '../../types';
import { APP_NAME, APP_NAME_SHORT } from '../../branding/appName';
import { Menu, MenuItem, MenuSection, MenuSegments } from '../components/Menu';
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
  const layersPanelVisible = useAppStore((s) => s.layersPanelVisible);
  const toggleLayersPanel = useAppStore((s) => s.toggleLayersPanel);
  const rasterPreviewPanelVisible = useAppStore((s) => s.rasterPreviewPanelVisible);
  const toggleRasterPreviewPanel = useAppStore((s) => s.toggleRasterPreviewPanel);
  const projectorCount = useAppStore((s) => s.projectors.length);
  const projectName = useAppStore((s) => s.projectName);
  const setDisplayUnit = useAppStore((s) => s.setDisplayUnit);
  const setViewPreset = useAppStore((s) => s.setViewPreset);
  const setTransformMode = useAppStore((s) => s.setTransformMode);
  const setMaterialPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);
  const setProjectionCompositeMode = useAppStore((s) => s.setProjectionCompositeMode);
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
  const studioVisible = useAppStore((s) => s.uvEditorPanelVisible);
  const toggleStudio = useAppStore((s) => s.toggleUvEditorPanel);

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

  const compositeOptions = (['solo', 'unblended', 'blended', 'heatmap'] as ProjectionCompositeMode[]).map(
    (mode) => ({
      id: mode,
      label: mode === 'solo' ? 'Solo' : mode === 'unblended' ? 'Raw' : mode === 'blended' ? 'Blend' : 'Count',
      title:
        mode === 'solo'
          ? 'Show only the selected projector on surfaces'
          : mode === 'unblended'
            ? 'Show every projector at once'
            : mode === 'blended'
              ? 'Edge-blended composite'
              : 'Coverage count heatmap',
    }),
  );

  const previewOptions: { id: typeof materialPreviewMode; label: string; hint?: string }[] = [
    { id: 'projectionPreview', label: 'Projection' },
    { id: 'projectionUv', label: 'Projector UV' },
    { id: 'falloff', label: 'Brightness falloff' },
    { id: 'blendSum', label: 'Blend sum', hint: 'seams' },
    { id: 'surfaceUv', label: 'Surface UV' },
    { id: 'original', label: 'Original material' },
  ];

  const currentView = VIEW_PRESETS.find((v) => v.id === viewPreset)?.label ?? 'View';

  return (
    <div className={`${styles.toolbar} ${compact ? styles.compact : ''}`}>
      <div className={styles.brand} title={APP_NAME}>
        <img src={LOGO_URL} alt="" className={styles.brandLogo} width={26} height={26} />
        <span className={styles.brandName}>{APP_NAME_SHORT}</span>
      </div>

      <div className={styles.cluster}>
        <Menu label="Add" testId="add-menu" title="Add projectors, surfaces or files">
          {(close) => (
            <>
              <MenuSection>
                <MenuItem
                  onSelect={() => { addProjector(); close(); }}
                  disabled={projectorCount >= MAX_PROJECTORS}
                  hint={`${projectorCount}/${MAX_PROJECTORS}`}
                >
                  Projector
                </MenuItem>
              </MenuSection>
              <MenuSection title="Surfaces">
                <MenuItem onSelect={() => { addBox(); close(); }}>Box</MenuItem>
                <MenuItem onSelect={() => { addCurvedScreen(); close(); }}>Curved screen</MenuItem>
                <MenuItem onSelect={() => { addLedWall(); close(); }}>LED wall</MenuItem>
              </MenuSection>
              <MenuSection>
                <MenuItem
                  onSelect={() => { importInputRef.current?.click(); close(); }}
                  hint="image, video, 3D"
                >
                  Import file…
                </MenuItem>
              </MenuSection>
            </>
          )}
        </Menu>

        <Menu label={currentView} title="Camera view">
          {(close) => (
            <MenuSection title="View">
              {VIEW_PRESETS.map(({ id, label }) => (
                <MenuItem key={id} selected={viewPreset === id} onSelect={() => { setViewPreset(id); close(); }}>
                  {label === 'Persp' ? 'Perspective' : label}
                </MenuItem>
              ))}
            </MenuSection>
          )}
        </Menu>

        <div className={styles.segmented} role="group" aria-label="Gizmo">
          <button
            type="button"
            className={transformMode === 'translate' ? styles.on : undefined}
            onClick={() => setTransformMode('translate')}
            title="Move (W)"
            aria-pressed={transformMode === 'translate'}
          >
            <span aria-hidden>✥</span>
            <span className={styles.wideOnly}>Move</span>
          </button>
          <button
            type="button"
            className={transformMode === 'rotate' ? styles.on : undefined}
            onClick={() => setTransformMode('rotate')}
            title="Rotate (E)"
            aria-pressed={transformMode === 'rotate'}
          >
            <span aria-hidden>⟳</span>
            <span className={styles.wideOnly}>Rotate</span>
          </button>
        </div>
      </div>

      <div className={styles.spacer} />

      <div className={styles.cluster}>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.wideOnlyFlex}`}
          onClick={undo}
          disabled={historyPast.length === 0}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          ↶
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.wideOnlyFlex}`}
          onClick={redo}
          disabled={historyFuture.length === 0}
          title="Redo (Ctrl+Shift+Z)"
          aria-label="Redo"
        >
          ↷
        </button>

        <Menu label="More" align="right" testId="more-menu" title="Display, mapping and project options">
          {(close) => (
            <>
              {compact && (
                <MenuSection>
                  <MenuItem onSelect={() => { undo(); close(); }} disabled={historyPast.length === 0}>Undo</MenuItem>
                  <MenuItem onSelect={() => { redo(); close(); }} disabled={historyFuture.length === 0}>Redo</MenuItem>
                </MenuSection>
              )}
              <MenuSection title="Show on surfaces">
                <MenuSegments
                  options={compositeOptions}
                  value={projectionCompositeMode}
                  onChange={setProjectionCompositeMode}
                  isDisabled={(mode) => projectorCount < 2 && mode !== 'solo' && mode !== 'unblended'}
                />
                {previewOptions.map((o) => (
                  <MenuItem
                    key={o.id}
                    selected={materialPreviewMode === o.id}
                    onSelect={() => setMaterialPreviewMode(o.id)}
                    hint={o.hint}
                  >
                    {o.label}
                  </MenuItem>
                ))}
              </MenuSection>
              <MenuSection title="Content">
                <MenuItem onSelect={() => { useAppStore.getState().openStudioTab('mappings'); close(); }}>
                  Mappings…
                </MenuItem>
                <MenuItem selected={layersPanelVisible} onSelect={() => { toggleLayersPanel(); close(); }}>
                  Layers
                </MenuItem>
              </MenuSection>
              <MenuSection title="Tools">
                <MenuItem selected={showProjectionBeam} onSelect={() => useAppStore.getState().toggleProjectionBeam()}>
                  Projection beam
                </MenuItem>
                <MenuItem selected={measureMode} onSelect={() => { setMeasureMode(!measureMode); close(); }}>
                  Measure distance
                </MenuItem>
                <MenuItem selected={rasterPreviewPanelVisible} onSelect={() => { toggleRasterPreviewPanel(); close(); }}>
                  Projector output preview
                </MenuItem>
                <MenuItem onSelect={() => { useAppStore.getState().openStudioTab('outputs'); close(); }}>
                  Send to displays…
                </MenuItem>
              </MenuSection>
              <MenuSection title="Units">
                <MenuSegments
                  options={UNITS.map((u) => ({ id: u, label: u }))}
                  value={displayUnit}
                  onChange={setDisplayUnit}
                />
              </MenuSection>
              <MenuSection title="Project">
                <MenuItem onSelect={() => { close(); if (window.confirm('Start a new project?')) newProject(); }}>New</MenuItem>
                <MenuItem onSelect={() => { fileInputRef.current?.click(); close(); }}>Open…</MenuItem>
                <MenuItem onSelect={() => { saveProjectToFile(); close(); }} hint={projectName}>Save</MenuItem>
                <MenuItem onSelect={() => { exportCalculationCsv(); close(); }}>Export report (CSV)</MenuItem>
                <MenuItem onSelect={() => { exportCalculationHtml(); close(); }}>Export report (HTML)</MenuItem>
              </MenuSection>
            </>
          )}
        </Menu>

        {!compact && (
          <button
            type="button"
            className={`${styles.primary} ${studioVisible ? styles.primaryOn : ''}`}
            onClick={toggleStudio}
            data-testid="studio-toggle"
            title="Mapping & Blend Studio: mappings, edge blending, corner-pin warp, outputs"
          >
            Studio
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept=".json,.projectionlab.json" className={styles.hiddenFile} onChange={handleOpenFile} />
      <input ref={importInputRef} type="file" accept="image/*,video/*,.glb,.gltf,.obj" className={styles.hiddenFile} onChange={handleImport} />
    </div>
  );
}
