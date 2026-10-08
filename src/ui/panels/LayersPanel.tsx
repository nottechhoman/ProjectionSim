import { useRef } from 'react';
import { useAppStore } from '../../store';
import { activeTrack } from '../../mapping/model';
import type { Layer, Mapping } from '../../types';
import { isCompactLayout } from '../deviceProfile';
import { useDeviceProfile } from '../useDeviceProfile';
import styles from './LayersPanel.module.css';

export function layerKindLabel(layer: Layer): string {
  const m = layer.media;
  if (m.kind === 'pattern') return m.pattern;
  return m.kind;
}

/** Mapping dropdown used on every layer row. */
export function MappingSelect({ layer, mappings, onChange }: { layer: Layer; mappings: Mapping[]; onChange: (id: string | null) => void }) {
  const missing = !layer.mappingId || !mappings.some((m) => m.id === layer.mappingId);
  return (
    <select
      className={`${styles.mapSelect} ${missing ? styles.mapSelectMissing : ''}`}
      value={missing ? '' : layer.mappingId!}
      onChange={(e) => onChange(e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Mapping for ${layer.name}`}
      data-testid={`layer-mapping-${layer.id}`}
      title={missing ? 'No mapping: this layer shows nowhere' : 'Mapping'}
    >
      <option value="">— no mapping —</option>
      {mappings.map((m) => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  );
}

/**
 * Layer stack of the active track (top of the list = top layer). Each row picks
 * its mapping; selecting a row shows the layer in the Inspector.
 */
export function LayersPanel() {
  const deviceProfile = useDeviceProfile();
  const compact = isCompactLayout(deviceProfile);
  const visible = useAppStore((s) => s.layersPanelVisible);
  const toggle = useAppStore((s) => s.toggleLayersPanel);
  const show = useAppStore((s) => s.show);
  const selectedLayerId = useAppStore((s) => s.selectedLayerId);
  const selectLayer = useAppStore((s) => s.setSelectedLayerId);
  const addLayer = useAppStore((s) => s.addLayer);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const removeLayer = useAppStore((s) => s.removeLayer);
  const duplicateLayer = useAppStore((s) => s.duplicateLayer);
  const moveLayer = useAppStore((s) => s.moveLayer);
  const importMedia = useAppStore((s) => s.importLayerMedia);
  const imageRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  if (!visible) return null;
  const track = activeTrack(show);
  const rows = track.layers.map((layer, index) => ({ layer, index })).reverse();

  return (
    <div className={compact ? styles.compactShell : styles.shell} data-testid="layers-panel">
      <div className={styles.panel}>
        <div className={styles.header} data-panel-header>
          <span>
            Layers <span className={styles.sizeLabel}>{track.name}</span>
          </span>
          <button type="button" className={styles.collapseBtn} onClick={toggle} title="Close layers">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionTitle}>Stack (top first)</div>
            {rows.length === 0 ? <p className={styles.hint}>No layers. Add media, a pattern or a solid.</p> : null}
            {rows.map(({ layer, index }) => (
              <div key={layer.id} className={`${styles.layerRow} ${layer.enabled ? '' : styles.layerOff}`} data-testid={`layer-row-${layer.id}`}>
                <button
                  type="button"
                  className={`${styles.layerBtn} ${layer.id === selectedLayerId ? styles.layerBtnActive : ''}`}
                  onClick={() => selectLayer(layer.id)}
                  title={`${layer.name} · ${layerKindLabel(layer)} · ${Math.round(layer.opacity * 100)}%`}
                >
                  {layer.name}
                </button>
                <MappingSelect layer={layer} mappings={show.mappings} onChange={(id) => updateLayer(layer.id, { mappingId: id })} />
                <button type="button" className={styles.iconBtn} onClick={() => moveLayer(layer.id, 'up')} disabled={index === track.layers.length - 1} title="Bring forward">▲</button>
                <button type="button" className={styles.iconBtn} onClick={() => moveLayer(layer.id, 'down')} disabled={index === 0} title="Send backward">▼</button>
                <button type="button" className={styles.iconBtn} onClick={() => updateLayer(layer.id, { enabled: !layer.enabled })} title={layer.enabled ? 'Disable' : 'Enable'}>
                  {layer.enabled ? '●' : '○'}
                </button>
                <button type="button" className={styles.iconBtn} onClick={() => duplicateLayer(layer.id)} title="Duplicate">⧉</button>
                <button type="button" className={styles.iconBtn} onClick={() => removeLayer(layer.id)} title="Delete layer">×</button>
              </div>
            ))}
            <div className={styles.addRow}>
              <button type="button" className={styles.addBtn} onClick={() => videoRef.current?.click()}>+ Video</button>
              <button type="button" className={styles.addBtn} onClick={() => imageRef.current?.click()}>+ Image</button>
              <button type="button" className={styles.addBtn} onClick={() => addLayer({ kind: 'pattern', pattern: 'uvGrid', color: '#ffffff' })} data-testid="layer-add-pattern">+ Pattern</button>
              <button type="button" className={styles.addBtn} onClick={() => addLayer({ kind: 'solid', color: '#ffffff' })}>+ Solid</button>
            </div>
            <p className={styles.hint}>New layers go on the mapping selected in Studio → Mappings.</p>
            <input ref={imageRef} className={styles.hiddenFile} type="file" accept="image/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importMedia(file, 'image');
              e.target.value = '';
            }} />
            <input ref={videoRef} className={styles.hiddenFile} type="file" accept="video/*" onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importMedia(file, 'video');
              e.target.value = '';
            }} />
          </div>
        </div>
      </div>
    </div>
  );
}
