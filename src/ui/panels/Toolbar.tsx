import { useRef, type ChangeEvent } from 'react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const displayUnit = useAppStore((s) => s.displayUnit);
  const viewPreset = useAppStore((s) => s.viewPreset);
  const transformMode = useAppStore((s) => s.transformMode);
  const materialPreviewMode = useAppStore((s) => s.materialPreviewMode);
  const projectName = useAppStore((s) => s.projectName);
  const setDisplayUnit = useAppStore((s) => s.setDisplayUnit);
  const setViewPreset = useAppStore((s) => s.setViewPreset);
  const setTransformMode = useAppStore((s) => s.setTransformMode);
  const setMaterialPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);
  const addBox = useAppStore((s) => s.addBox);
  const addCurvedScreen = useAppStore((s) => s.addCurvedScreen);
  const importFile = useAppStore((s) => s.importFile);
  const newProject = useAppStore((s) => s.newProject);
  const saveProjectToFile = useAppStore((s) => s.saveProjectToFile);
  const loadProjectFromFile = useAppStore((s) => s.loadProjectFromFile);

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
        <button type="button" onClick={addBox}>Add Box</button>
        <button type="button" onClick={addCurvedScreen}>Curved Screen</button>
        <button type="button" onClick={() => importInputRef.current?.click()}>Import</button>
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
          className={materialPreviewMode === 'original' ? styles.active : undefined}
          onClick={() => setMaterialPreviewMode('original')}
        >
          Original
        </button>
      </div>

      <div className={styles.separator} />

      <button type="button" disabled className={styles.disabled}>
        Measure (M4)
      </button>

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
