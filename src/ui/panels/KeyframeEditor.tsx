import { useEffect, useState } from 'react';
import { useAppStore } from '../../store';
import type { KeyframeEase, KeyframeProp, Layer } from '../../types';
import { baseValue, KEYFRAME_LABEL, KEYFRAME_PROPS, keyAt, valueAt } from '../../playback/keyframes';
import { transport } from '../../playback/clock';
import { usePlayhead } from '../../playback/useTransport';
import { KEY_COLORS } from './TimelineDock';
import styles from './Inspector.module.css';

const STEP: Record<KeyframeProp, number> = { opacity: 0.05, x: 0.01, y: 0.01, scale: 0.05, rotationDeg: 1 };
const round = (v: number) => Math.round(v * 1000) / 1000;
const rowStyle = { display: 'flex', flexWrap: 'nowrap', alignItems: 'center', gap: 4, marginBottom: 4 } as const;

function ValueBox({ value, step, onCommit, label }: { value: number; step: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(round(value)));
  useEffect(() => setDraft(String(round(value))), [value]);
  return (
    <input
      type="number"
      step={step}
      value={draft}
      aria-label={label}
      style={{ width: 64, font: 'inherit', fontSize: 12, color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 4px' }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const v = Number(draft);
        if (Number.isFinite(v) && Math.abs(v - value) > 1e-9) onCommit(v);
        else setDraft(String(round(value)));
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/**
 * Keyframes for opacity, x, y, scale and rotation at the playhead. With keys on a
 * property, editing its value sets a key at the playhead (auto-key); without, it
 * edits the base value. ◆ adds / removes a key at the playhead.
 */
export function KeyframeEditor({ layer }: { layer: Layer }) {
  const fps = useAppStore((s) => s.show.fps);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const setKeyframe = useAppStore((s) => s.setKeyframe);
  const removeKeyframe = useAppStore((s) => s.removeKeyframe);
  const updateKeyframe = useAppStore((s) => s.updateKeyframe);
  const selected = useAppStore((s) => s.selectedKeyframe);
  const setSelected = useAppStore((s) => s.setSelectedKeyframe);
  const t = usePlayhead();
  const local = Math.min(layer.durationSec, Math.max(0, t - layer.startSec));
  const frame = 1 / fps;

  const setBase = (prop: KeyframeProp, v: number) => {
    if (prop === 'opacity') updateLayer(layer.id, { opacity: Math.min(1, Math.max(0, v)) });
    else if (prop === 'x') updateLayer(layer.id, { rect: { ...layer.rect, x: v } });
    else if (prop === 'y') updateLayer(layer.id, { rect: { ...layer.rect, y: v } });
    else if (prop === 'rotationDeg') updateLayer(layer.id, { rect: { ...layer.rect, rotationDeg: v } });
    else setKeyframe(layer.id, prop, local, v);
  };

  const selKey =
    selected && selected.layerId === layer.id ? layer.keyframes?.[selected.prop]?.find((k) => k.id === selected.keyId) ?? null : null;

  return (
    <div className={styles.section} data-testid="keyframe-editor">
      <div className={styles.sectionTitle}>Keyframes</div>
      <p className={styles.hint}>
        At the playhead (+{local.toFixed(2)} s into the layer). ◆ adds or removes a key; with keys, editing a value keys it.
      </p>
      {KEYFRAME_PROPS.map((prop) => {
        const keys = layer.keyframes?.[prop] ?? [];
        const here = keyAt(keys, local, frame);
        const value = keys.length > 0 ? valueAt(layer, prop, local) : baseValue(layer, prop);
        const prev = [...keys].reverse().find((k) => k.timeSec < local - frame / 2);
        const next = keys.find((k) => k.timeSec > local + frame / 2);
        return (
          <div key={prop} style={rowStyle}>
            <label style={{ minWidth: 70, fontSize: 12 }}>
              <span style={{ color: KEY_COLORS[prop] }}>●</span> {KEYFRAME_LABEL[prop]}
            </label>
            <ValueBox
              value={value}
              step={STEP[prop]}
              label={`${KEYFRAME_LABEL[prop]} value`}
              onCommit={(v) => (keys.length > 0 ? setKeyframe(layer.id, prop, local, v) : setBase(prop, v))}
            />
            <button
              type="button"
              className={styles.actionBtn}
              style={{ padding: '2px 6px', color: here ? '#ffd25a' : undefined }}
              title={here ? 'Remove the key at the playhead' : 'Add a key at the playhead'}
              data-testid={`key-toggle-${prop}`}
              onClick={() => (here ? removeKeyframe(layer.id, prop, here.id) : setKeyframe(layer.id, prop, local, value))}
            >
              {here ? '◆' : '◇'}
            </button>
            <button type="button" className={styles.actionBtn} style={{ padding: '2px 6px' }} disabled={!prev} title="Previous key" onClick={() => prev && transport.seek(layer.startSec + prev.timeSec)}>
              ◀
            </button>
            <button type="button" className={styles.actionBtn} style={{ padding: '2px 6px' }} disabled={!next} title="Next key" onClick={() => next && transport.seek(layer.startSec + next.timeSec)}>
              ▶
            </button>
            <span className={styles.hint}>{keys.length || ''}</span>
          </div>
        );
      })}
      {selKey && selected ? (
        <div style={{ marginTop: 8 }} data-testid="keyframe-selected">
          <div className={styles.sectionTitle}>
            Selected key · {KEYFRAME_LABEL[selected.prop]}
          </div>
          <div style={rowStyle}>
            <label style={{ fontSize: 12 }}>Time +s</label>
            <ValueBox value={selKey.timeSec} step={frame} label="Key time" onCommit={(v) => updateKeyframe(layer.id, selected.prop, selKey.id, { timeSec: v })} />
            <label style={{ fontSize: 12 }}>Value</label>
            <ValueBox value={selKey.value} step={STEP[selected.prop]} label="Key value" onCommit={(v) => updateKeyframe(layer.id, selected.prop, selKey.id, { value: v })} />
          </div>
          <div style={rowStyle}>
            <label style={{ fontSize: 12 }}>Ease</label>
            <select
              value={selKey.ease}
              onChange={(e) => updateKeyframe(layer.id, selected.prop, selKey.id, { ease: e.target.value as KeyframeEase })}
              aria-label="Key ease"
            >
              <option value="linear">Linear</option>
              <option value="easeInOut">Ease in / out</option>
            </select>
            <button type="button" className={styles.dangerBtn} style={{ marginTop: 0 }} onClick={() => removeKeyframe(layer.id, selected.prop, selKey.id)}>
              Delete key
            </button>
            <button type="button" className={styles.actionBtn} onClick={() => setSelected(null)}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
