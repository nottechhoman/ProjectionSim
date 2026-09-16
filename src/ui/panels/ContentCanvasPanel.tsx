import { useMemo, useRef } from 'react';
import { findPrimaryReceiver } from '../../projection/sharedCanvasMapping';
import { projectorsFootprintsOnCanvas } from '../../projection/canvasFootprints';
import {
  clampContentCanvasSize,
  fittedLayerRect,
} from '../../projection/contentCanvas';
import { useAppStore } from '../../store';
import type { ContentCanvasLayer, TestPattern } from '../../types';
import { getDeviceProfile, isCompactLayout } from '../deviceProfile';
import { useDeviceProfile } from '../useDeviceProfile';
import { NumInput } from '../components/NumInput';
import styles from './ContentCanvasPanel.module.css';

const PATTERNS: { value: TestPattern; label: string }[] = [
  { value: 'checkerboard', label: 'Checkerboard' },
  { value: 'uvGrid', label: 'UV Grid' },
  { value: 'colorBars', label: 'Color Bars' },
  { value: 'white', label: 'White' },
  { value: 'projectorId', label: 'Solid tint' },
];

export function ContentCanvasPanel() {
  const deviceProfile = useDeviceProfile();
  const compact = isCompactLayout(deviceProfile);
  const visible = useAppStore((s) => s.contentCanvasPanelVisible);
  const canvas = useAppStore((s) => s.contentCanvas);
  const selectedLayerId = useAppStore((s) => s.selectedContentLayerId);
  const projectors = useAppStore((s) => s.projectors);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const toggle = useAppStore((s) => s.toggleContentCanvasPanel);
  const setEnabled = useAppStore((s) => s.setContentCanvasEnabled);
  const setSize = useAppStore((s) => s.setContentCanvasSize);
  const addLayer = useAppStore((s) => s.addContentCanvasLayer);
  const updateLayer = useAppStore((s) => s.updateContentCanvasLayer);
  const removeLayer = useAppStore((s) => s.removeContentCanvasLayer);
  const moveLayer = useAppStore((s) => s.moveContentCanvasLayer);
  const selectLayer = useAppStore((s) => s.setSelectedContentLayerId);
  const importMedia = useAppStore((s) => s.importContentCanvasMedia);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const engine = (window as Window & { __projectionLabEngine?: { maxTextureSize?: number } })
    .__projectionLabEngine;
  const maxTextureSize = engine?.maxTextureSize ?? 16384;
  const effective = clampContentCanvasSize(
    canvas.widthPx,
    canvas.heightPx,
    getDeviceProfile(),
    maxTextureSize,
  );

  const receiver = findPrimaryReceiver(sceneObjects);
  const footprints = useMemo(
    () => projectorsFootprintsOnCanvas(projectors, receiver, canvas),
    [projectors, receiver, canvas],
  );

  const selected = canvas.layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const aspect = canvas.widthPx / Math.max(1, canvas.heightPx);

  if (!visible) return null;

  return (
    <div className={compact ? styles.compactShell : styles.shell} data-testid="content-canvas-panel">
      <div className={styles.panel}>
        <div className={styles.header} data-panel-header>
          <span>
            Content Canvas{' '}
            <span className={styles.sizeLabel}>
              {effective.widthPx} × {effective.heightPx}
            </span>
          </span>
          <button type="button" className={styles.collapseBtn} onClick={toggle} title="Close canvas panel">
            ×
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.previewWrap} style={{ aspectRatio: String(aspect) }}>
            <div className={styles.previewStack}>
              {canvas.layers
                .filter((layer) => layer.visible)
                .map((layer) => (
                  <LayerPreview key={layer.id} layer={layer} canvas={canvas} />
                ))}
            </div>
            <svg className={styles.overlay} viewBox={`0 0 ${canvas.widthPx} ${canvas.heightPx}`} preserveAspectRatio="none">
              <defs>
                <pattern
                  id="canvasOverlapHatch"
                  width="12"
                  height="12"
                  patternUnits="userSpaceOnUse"
                  patternTransform="rotate(45)"
                >
                  <line x1="0" y1="0" x2="0" y2="12" stroke="#fff" strokeWidth="6" opacity="0.35" />
                </pattern>
                {footprints.map((foot) => (
                  <clipPath key={`clip-${foot.projectorId}`} id={`clip-${foot.projectorId}`}>
                    <polygon points={foot.points.map((p) => `${p.x},${p.y}`).join(' ')} />
                  </clipPath>
                ))}
              </defs>
            {footprints.map((a, i) =>
              footprints.slice(i + 1).map((b) => (
                <polygon
                  key={`${a.projectorId}-${b.projectorId}`}
                  className={styles.hatch}
                  points={b.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  clipPath={`url(#clip-${a.projectorId})`}
                />
              )),
            )}
            {footprints.map((foot) => (
              <polygon
                key={foot.projectorId}
                points={foot.points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={foot.color}
                strokeWidth={Math.max(canvas.widthPx, canvas.heightPx) * 0.004}
              />
            ))}
            </svg>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Canvas</div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={canvas.enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enabled — map this canvas to the receiving surface
            </label>
            {effective.clamped ? (
              <p className={styles.clampNote}>
                Requested {canvas.widthPx} × {canvas.heightPx}, clamped to {effective.widthPx} ×{' '}
                {effective.heightPx} (max {effective.maxDimension} on this device).
              </p>
            ) : (
              <p className={styles.hint}>Canvas UV fills the primary receiver 1:1. Top-left is the authoring origin.</p>
            )}
            <NumInput label="W" value={canvas.widthPx} onChange={(v) => setSize(v, canvas.heightPx)} />
            <NumInput label="H" value={canvas.heightPx} onChange={(v) => setSize(canvas.widthPx, v)} />
          </div>

          <div className={styles.section}>
            <div className={styles.sectionTitle}>Layers</div>
            {canvas.layers.length === 0 ? (
              <p className={styles.hint}>Add a pattern or media layer to author shared content.</p>
            ) : (
              canvas.layers.map((layer, index) => (
                <div key={layer.id} className={styles.layerRow}>
                  <button
                    type="button"
                    className={`${styles.layerBtn} ${layer.id === selectedLayerId ? styles.layerBtnActive : ''}`}
                    onClick={() => selectLayer(layer.id)}
                  >
                    {layer.name} · {Math.round(layer.opacity * 100)}%
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => moveLayer(layer.id, 'down')}
                    disabled={index === 0}
                    title="Send backward"
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => moveLayer(layer.id, 'up')}
                    disabled={index === canvas.layers.length - 1}
                    title="Bring forward"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                    title={layer.visible ? 'Hide' : 'Show'}
                  >
                    {layer.visible ? '👁' : '–'}
                  </button>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    onClick={() => removeLayer(layer.id)}
                    title="Remove layer"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
            <div className={styles.addRow}>
              <button type="button" className={styles.addBtn} onClick={() => imageInputRef.current?.click()}>
                + Image
              </button>
              <button type="button" className={styles.addBtn} onClick={() => videoInputRef.current?.click()}>
                + Video
              </button>
              <button type="button" className={styles.addBtn} onClick={() => addLayer('pattern')}>
                + Pattern
              </button>
              <button type="button" className={styles.addBtn} onClick={() => addLayer('solid')}>
                + Solid
              </button>
            </div>
            <input
              ref={imageInputRef}
              className={styles.hiddenFile}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importMedia(file, 'image');
                e.target.value = '';
              }}
            />
            <input
              ref={videoInputRef}
              className={styles.hiddenFile}
              type="file"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importMedia(file, 'video');
                e.target.value = '';
              }}
            />
          </div>

          {selected ? <LayerInspector layer={selected} onChange={updateLayer} /> : null}
        </div>
      </div>
    </div>
  );
}

function LayerInspector({
  layer,
  onChange,
}: {
  layer: ContentCanvasLayer;
  onChange: (id: string, patch: Partial<ContentCanvasLayer>) => void;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{layer.name}</div>
      <NumInput label="X" value={layer.x} onChange={(v) => onChange(layer.id, { x: v })} />
      <NumInput label="Y" value={layer.y} onChange={(v) => onChange(layer.id, { y: v })} />
      <NumInput label="W" value={layer.width} onChange={(v) => onChange(layer.id, { width: Math.max(1, v) })} />
      <NumInput label="H" value={layer.height} onChange={(v) => onChange(layer.id, { height: Math.max(1, v) })} />
      <NumInput
        label="Rot"
        value={layer.rotationDeg}
        onChange={(v) => onChange(layer.id, { rotationDeg: v })}
      />
      <NumInput
        label="Opac"
        value={Math.round(layer.opacity * 100)}
        onChange={(v) => onChange(layer.id, { opacity: Math.min(1, Math.max(0, v / 100)) })}
      />
      <div className={styles.row}>
        <label>Fit</label>
        <select
          value={layer.fit}
          onChange={(e) => onChange(layer.id, { fit: e.target.value as ContentCanvasLayer['fit'] })}
        >
          <option value="contain">Contain</option>
          <option value="cover">Cover</option>
          <option value="stretch">Stretch</option>
        </select>
      </div>
      {layer.kind === 'pattern' ? (
        <div className={styles.row}>
          <label>Pattern</label>
          <select
            value={layer.pattern ?? 'uvGrid'}
            onChange={(e) => onChange(layer.id, { pattern: e.target.value as TestPattern })}
          >
            {PATTERNS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {layer.kind === 'solid' || layer.kind === 'pattern' ? (
        <div className={styles.row}>
          <label>Color</label>
          <input
            type="color"
            value={layer.color}
            onChange={(e) => onChange(layer.id, { color: e.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}

function LayerPreview({
  layer,
  canvas,
}: {
  layer: ContentCanvasLayer;
  canvas: { widthPx: number; heightPx: number };
}) {
  const mediaAspect = layer.width / Math.max(1, layer.height);
  const fitted = fittedLayerRect(layer, mediaAspect);
  const pct = (value: number, total: number) => `${(value / total) * 100}%`;
  return (
    <div
      className={styles.layer}
      style={{
        left: pct(layer.x, canvas.widthPx),
        top: pct(layer.y, canvas.heightPx),
        width: pct(layer.width, canvas.widthPx),
        height: pct(layer.height, canvas.heightPx),
        opacity: layer.opacity,
        transform: `rotate(${layer.rotationDeg}deg)`,
        transformOrigin: 'center center',
      }}
    >
      <div
        className={styles.layerInner}
        style={{
          left: pct(fitted.x - layer.x, layer.width),
          top: pct(fitted.y - layer.y, layer.height),
          width: pct(fitted.width, layer.width),
          height: pct(fitted.height, layer.height),
          background: previewBackground(layer),
        }}
      />
    </div>
  );
}

function previewBackground(layer: ContentCanvasLayer): string {
  if (layer.kind === 'solid') return layer.color;
  if (layer.kind === 'pattern') {
    if (layer.pattern === 'uvGrid') {
      return 'linear-gradient(to right, #000, #e04040)';
    }
    if (layer.pattern === 'colorBars') {
      return 'linear-gradient(to right, #e04040, #40c040 50%, #4040c0)';
    }
    if (layer.pattern === 'white') return '#fff';
    if (layer.pattern === 'projectorId') return layer.color;
    return 'repeating-conic-gradient(#111 0% 25%, #ccc 0% 50%) 0 0 / 16px 16px';
  }
  return '#445';
}