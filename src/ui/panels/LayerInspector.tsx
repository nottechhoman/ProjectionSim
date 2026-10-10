import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import { LAYER_BLEND_MODES } from '../../mapping/model';
import type { Layer, LayerBlendMode, LayerPlayMode, MediaFitMode, MediaRef, TestPattern } from '../../types';
import { NumInput } from '../components/NumInput';
import { MappingSelect } from './LayersPanel';
import { KeyframeEditor } from './KeyframeEditor';
import styles from './Inspector.module.css';

const PATTERNS: { value: TestPattern; label: string }[] = [
  { value: 'checkerboard', label: 'Checkerboard' },
  { value: 'uvGrid', label: 'UV Grid' },
  { value: 'colorBars', label: 'Color Bars' },
  { value: 'white', label: 'White' },
  { value: 'projectorId', label: 'Tint colour' },
  { value: 'black', label: 'Black (black-level check)' },
  { value: 'gray', label: 'Gray 50%' },
];

const BLEND_LABELS: Record<LayerBlendMode, string> = {
  normal: 'Normal',
  add: 'Add',
  screen: 'Screen',
  multiply: 'Multiply',
  overlay: 'Overlay',
  softLight: 'Soft light',
  lighten: 'Lighten',
  darken: 'Darken',
  difference: 'Difference',
};

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

export function LayerInspector({ layer }: { layer: Layer }) {
  const show = useAppStore((s) => s.show);
  const mediaAssets = useAppStore((s) => s.mediaAssets);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const removeLayer = useAppStore((s) => s.removeLayer);
  const set = (patch: Partial<Layer>) => updateLayer(layer.id, patch);
  const setMedia = (media: MediaRef) => set({ media });
  const [name, setName] = useState(layer.name);
  useEffect(() => setName(layer.name), [layer.name]);
  const media = layer.media;
  const isMedia = media.kind === 'image' || media.kind === 'video';

  return (
    <>
      <div className={styles.section} data-testid="layer-inspector">
        <div className={styles.sectionTitle}>Layer</div>
        <div className={styles.row}>
          <label htmlFor="layer-name">Name</label>
          <input
            id="layer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== layer.name && set({ name: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={layer.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          Enabled
        </label>
        <div className={styles.row}>
          <label>Mapping</label>
          <MappingSelect layer={layer} mappings={show.mappings} onChange={(mappingId) => set({ mappingId })} />
        </div>
        <div className={styles.row}>
          <label htmlFor="layer-media-kind">Media</label>
          <select
            id="layer-media-kind"
            value={media.kind}
            onChange={(e) => {
              const kind = e.target.value as MediaRef['kind'];
              if (kind === 'pattern') setMedia({ kind, pattern: 'uvGrid', color: '#ffffff' });
              else if (kind === 'solid') setMedia({ kind, color: '#ffffff' });
              else setMedia({ kind, assetId: mediaAssets.find((a) => a.kind === kind)?.id ?? null });
            }}
          >
            <option value="video">Video</option>
            <option value="image">Image</option>
            <option value="pattern">Test pattern</option>
            <option value="solid">Solid colour</option>
          </select>
        </div>
        {isMedia ? (
          <>
            <div className={styles.row}>
              <label htmlFor="layer-asset">File</label>
              <select
                id="layer-asset"
                value={media.assetId ?? ''}
                onChange={(e) => setMedia({ kind: media.kind, assetId: e.target.value || null })}
              >
                <option value="">— select —</option>
                {mediaAssets
                  .filter((a) => a.kind === media.kind)
                  .map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
              </select>
            </div>
            <div className={styles.row}>
              <label htmlFor="layer-fit">Fit</label>
              <select id="layer-fit" value={layer.fit} onChange={(e) => set({ fit: e.target.value as MediaFitMode })}>
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
          </>
        ) : null}
        {media.kind === 'pattern' ? (
          <div className={styles.row}>
            <label htmlFor="layer-pattern">Pattern</label>
            <select id="layer-pattern" value={media.pattern} onChange={(e) => setMedia({ ...media, pattern: e.target.value as TestPattern })}>
              {PATTERNS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        ) : null}
        {media.kind === 'pattern' || media.kind === 'solid' ? (
          <div className={styles.row}>
            <label htmlFor="layer-color">Colour</label>
            <input id="layer-color" type="color" value={media.color} onChange={(e) => setMedia({ ...media, color: e.target.value })} />
          </div>
        ) : null}
        <NumInput label="Opacity %" value={Math.round(layer.opacity * 100)} step={1} onChange={(v) => set({ opacity: Math.min(1, Math.max(0, v / 100)) })} />
        <div className={styles.row}>
          <label htmlFor="layer-blend">Blend</label>
          <select id="layer-blend" value={layer.blendMode} onChange={(e) => set({ blendMode: e.target.value as LayerBlendMode })}>
            {LAYER_BLEND_MODES.map((m) => (
              <option key={m} value={m}>{BLEND_LABELS[m]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Placement in mapping canvas</div>
        <p className={styles.hint}>Fractions of the mapping canvas, top-left origin (1 = full width / height).</p>
        <NumInput label="X" value={round(layer.rect.x)} step={0.01} onChange={(x) => set({ rect: { ...layer.rect, x } })} />
        <NumInput label="Y" value={round(layer.rect.y)} step={0.01} onChange={(y) => set({ rect: { ...layer.rect, y } })} />
        <NumInput label="Width" value={round(layer.rect.width)} step={0.01} onChange={(width) => set({ rect: { ...layer.rect, width: Math.max(0.001, width) } })} />
        <NumInput label="Height" value={round(layer.rect.height)} step={0.01} onChange={(height) => set({ rect: { ...layer.rect, height: Math.max(0.001, height) } })} />
        <NumInput label="Rotation °" value={layer.rect.rotationDeg} step={1} onChange={(rotationDeg) => set({ rect: { ...layer.rect, rotationDeg } })} />
        <button type="button" className={styles.actionBtn} onClick={() => set({ rect: { x: 0, y: 0, width: 1, height: 1, rotationDeg: 0 } })}>
          Fill canvas
        </button>
      </div>

      <KeyframeEditor layer={layer} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Timing</div>
        <NumInput label="Start s" value={round(layer.startSec)} step={0.1} onChange={(v) => set({ startSec: Math.max(0, v) })} />
        <NumInput label="Duration s" value={round(layer.durationSec)} step={0.1} onChange={(v) => set({ durationSec: Math.max(0.05, v) })} />
        <NumInput label="Fade in s" value={round(layer.fadeInSec)} step={0.1} onChange={(v) => set({ fadeInSec: Math.max(0, v) })} />
        <NumInput label="Fade out s" value={round(layer.fadeOutSec)} step={0.1} onChange={(v) => set({ fadeOutSec: Math.max(0, v) })} />
        {media.kind === 'video' ? (
          <>
            <NumInput label="In point s" value={round(layer.inSec)} step={0.1} onChange={(v) => set({ inSec: Math.max(0, v) })} />
            <NumInput
              label="Out point s"
              value={layer.outSec === null ? 0 : round(layer.outSec)}
              step={0.1}
              onChange={(v) => set({ outSec: v > layer.inSec ? v : null })}
            />
            <p className={styles.hint}>Out point 0 = end of the clip.</p>
            <div className={styles.row}>
              <label htmlFor="layer-playmode">Play mode</label>
              <select id="layer-playmode" value={layer.playMode} onChange={(e) => set({ playMode: e.target.value as LayerPlayMode })}>
                <option value="loop">Loop</option>
                <option value="once">Once</option>
                <option value="holdLast">Hold last frame</option>
                <option value="pingPong">Ping-pong</option>
              </select>
            </div>
            <NumInput label="Speed ×" value={layer.speed} step={0.05} onChange={(v) => set({ speed: Math.min(16, Math.max(0.05, v)) })} />
            <NumInput label="Volume %" value={Math.round(layer.volume * 100)} step={1} onChange={(v) => set({ volume: Math.min(1, Math.max(0, v / 100)) })} />
            <label className={styles.checkRow}>
              <input type="checkbox" checked={layer.muted} onChange={(e) => set({ muted: e.target.checked })} />
              Muted
            </label>
          </>
        ) : null}
        <button type="button" className={styles.dangerBtn} onClick={() => removeLayer(layer.id)}>
          Delete layer
        </button>
      </div>
    </>
  );
}
