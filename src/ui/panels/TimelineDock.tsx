import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../../store';
import { activeTrack } from '../../mapping/model';
import { transport } from '../../playback/clock';
import { usePlayhead } from '../../playback/useTransport';
import { clipLength } from '../../playback/evaluate';
import { moveClip, trimClipEnd, trimClipStart } from '../../playback/edit';
import { formatTimecode, snapToFrame } from '../../playback/timecode';
import { sectionAt } from '../../playback/showControl';
import { mediaTextureCache } from '../../media';
import type { KeyframeEase, KeyframeProp, Layer, ObjectChannel, SceneObject } from '../../types';
import { OBJECT_CHANNEL_COLOR, OBJECT_CHANNEL_LABEL, OBJECT_CHANNELS } from '../../playback/objectAnimation';
import { KEYFRAME_LABEL, KEYFRAME_PROPS } from '../../playback/keyframes';

export const KEY_COLORS: Record<KeyframeProp, string> = {
  opacity: '#ffffff',
  x: '#ff7a7a',
  y: '#7aff9b',
  scale: '#ffd25a',
  rotationDeg: '#8fb8ff',
};
import { MappingSelect } from './LayersPanel';
import { TrackSelector } from './TrackSelector';
import styles from './TimelineDock.module.css';

type DragMode = 'move' | 'trimL' | 'trimR';

const TICK_STEPS = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

function pickTickStep(pps: number): number {
  return TICK_STEPS.find((s) => s * pps >= 70) ?? 600;
}

function mediaDuration(layer: Layer): number | null {
  if (layer.media.kind !== 'video' || !layer.media.assetId) return null;
  const d = mediaTextureCache.get(layer.media.assetId)?.video?.duration;
  return d && Number.isFinite(d) ? d : null;
}

/**
 * Timeline dock: ruler, one row per layer (top layer first) with a draggable /
 * trimmable clip bar, and the playhead. Compact mode (tablet) drops the mapping
 * column and uses taller touch rows.
 */
export function TimelineDock({ compact = false }: { compact?: boolean }) {
  const show = useAppStore((s) => s.show);
  const selectedLayerId = useAppStore((s) => s.selectedLayerId);
  const selectLayer = useAppStore((s) => s.setSelectedLayerId);
  const updateLayer = useAppStore((s) => s.updateLayer);
  const setTrackDuration = useAppStore((s) => s.setTrackDuration);
  const checkpoint = useAppStore((s) => s.pushSceneHistoryCheckpoint);
  const track = activeTrack(show);
  const fps = show.fps;
  const t = usePlayhead();
  const playMode = useAppStore((s) => s.playMode);
  const currentSectionId = sectionAt(track, t)?.id ?? null;

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(600);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth || 600));
    ro.observe(el);
    setViewWidth(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);

  const pps = Math.max(2, ((viewWidth - 12) / Math.max(1, track.durationSec)) * zoom);
  const laneWidth = Math.max(viewWidth, track.durationSec * pps + 12);
  const rowH = compact ? 40 : 30;
  const labelW = compact ? 120 : 210;
  const tickStep = pickTickStep(pps);

  const drag = useRef<{ id: string; mode: DragMode; startX: number; layer: Layer } | null>(null);
  const keyDrag = useRef<{ layerId: string; prop: KeyframeProp; keyId: string; startX: number; timeSec: number } | null>(null);
  const selectedKeyframe = useAppStore((s) => s.selectedKeyframe);
  const setSelectedKeyframe = useAppStore((s) => s.setSelectedKeyframe);
  const updateKeyframe = useAppStore((s) => s.updateKeyframe);
  const scrub = useRef(false);

  // v10: animated scene objects as collapsible rows below the layers.
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const autoKey = useAppStore((s) => s.autoKey);
  const setAutoKey = useAppStore((s) => s.setAutoKey);
  const selectedObjectKey = useAppStore((s) => s.selectedObjectKey);
  const setSelectedObjectKey = useAppStore((s) => s.setSelectedObjectKey);
  const updateObjectKeyframe = useAppStore((s) => s.updateObjectKeyframe);
  const removeObjectKeyframe = useAppStore((s) => s.removeObjectKeyframe);
  const selectObject = useAppStore((s) => s.setSelectedObject);
  const selectedObjectId = useAppStore((s) => s.selectedObjectId);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const objKeyDrag = useRef<{ objectId: string; channel: ObjectChannel; keyId: string; startX: number; timeSec: number; moved: boolean } | null>(null);
  const longPress = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatedObjects: SceneObject[] = sceneObjects.filter((o) => track.objectAnimations?.[o.id] !== undefined);
  type ObjRow = { kind: 'group'; obj: SceneObject } | { kind: 'channel'; obj: SceneObject; channel: ObjectChannel };
  const objRows: ObjRow[] = animatedObjects.flatMap((obj) =>
    collapsed.has(obj.id)
      ? [{ kind: 'group' as const, obj }]
      : [{ kind: 'group' as const, obj }, ...OBJECT_CHANNELS.map((channel) => ({ kind: 'channel' as const, obj, channel }))],
  );
  const selObjKey = selectedObjectKey
    ? track.objectAnimations?.[selectedObjectKey.objectId]?.[selectedObjectKey.channel]?.find((k) => k.id === selectedObjectKey.keyId) ?? null
    : null;
  const toggleCollapsed = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clearLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current);
    longPress.current = null;
  };

  const objectDiamond = (obj: SceneObject, channel: ObjectChannel, key: { id: string; timeSec: number; ease: KeyframeEase }, top: string) => {
    const sel = selectedObjectKey?.keyId === key.id && selectedObjectKey.objectId === obj.id && selectedObjectKey.channel === channel;
    return (
      <span
        key={`${channel}-${key.id}`}
        className={`${styles.diamond} ${sel ? styles.diamondSel : ''}`}
        style={{ left: key.timeSec * pps, top, background: OBJECT_CHANNEL_COLOR[channel] }}
        title={`${obj.name} · ${OBJECT_CHANNEL_LABEL[channel]} at ${formatTimecode(key.timeSec, fps)} (${key.ease}) — drag to move, right-click or long-press to delete`}
        data-testid={`objkey-${obj.id}-${channel}-${key.id}`}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearLongPress();
          removeObjectKeyframe(obj.id, channel, key.id);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          e.preventDefault();
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          selectObject(obj.id);
          setSelectedObjectKey({ objectId: obj.id, channel, keyId: key.id });
          checkpoint();
          objKeyDrag.current = { objectId: obj.id, channel, keyId: key.id, startX: e.clientX, timeSec: key.timeSec, moved: false };
          if (e.pointerType !== 'mouse') {
            clearLongPress();
            longPress.current = setTimeout(() => {
              longPress.current = null;
              if (objKeyDrag.current && !objKeyDrag.current.moved) {
                objKeyDrag.current = null;
                removeObjectKeyframe(obj.id, channel, key.id);
              }
            }, 550);
          }
        }}
        onPointerMove={(e) => {
          const d = objKeyDrag.current;
          if (!d) return;
          if (Math.abs(e.clientX - d.startX) > 3) {
            d.moved = true;
            clearLongPress();
          }
          if (!d.moved) return;
          const time = Math.max(0, snapToFrame(d.timeSec + (e.clientX - d.startX) / pps, fps));
          updateObjectKeyframe(d.objectId, d.channel, d.keyId, { timeSec: time }, false);
        }}
        onPointerUp={() => {
          clearLongPress();
          objKeyDrag.current = null;
        }}
        onPointerCancel={() => {
          clearLongPress();
          objKeyDrag.current = null;
        }}
      />
    );
  };

  const secAt = (clientX: number) => {
    const el = scrollerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + el.scrollLeft) / pps);
  };

  const onClipDown = (e: ReactPointerEvent, layer: Layer, mode: DragMode) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    selectLayer(layer.id);
    checkpoint();
    drag.current = { id: layer.id, mode, startX: e.clientX, layer: structuredClone(layer) };
  };

  const onClipMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dt = (e.clientX - d.startX) / pps;
    const l = d.layer;
    const patch =
      d.mode === 'move'
        ? moveClip(l, l.startSec + dt, fps)
        : d.mode === 'trimL'
          ? trimClipStart(l, l.startSec + dt, fps)
          : trimClipEnd(l, l.startSec + l.durationSec + dt, fps);
    updateLayer(d.id, patch, false);
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onRulerDown = (e: ReactPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    scrub.current = true;
    transport.seek(snapToFrame(Math.min(track.durationSec, secAt(e.clientX)), fps));
  };
  const onRulerMove = (e: ReactPointerEvent) => {
    if (!scrub.current) return;
    transport.seek(snapToFrame(Math.min(track.durationSec, secAt(e.clientX)), fps));
  };

  const ticks = useMemo(() => {
    const out: number[] = [];
    for (let s = 0; s <= track.durationSec + 1e-6; s += tickStep) out.push(s);
    return out;
  }, [track.durationSec, tickStep]);

  const rows = [...track.layers].reverse();
  const [durationDraft, setDurationDraft] = useState(String(track.durationSec));
  useEffect(() => setDurationDraft(String(track.durationSec)), [track.durationSec]);

  const style = { '--row-h': `${rowH}px`, '--label-w': `${labelW}px` } as CSSProperties;

  return (
    <div className={styles.timeline} style={style} data-testid="timeline-dock">
      <div className={styles.bar}>
        <TrackSelector />
        <span>Length</span>
        <input
          aria-label="Track length (seconds)"
          value={durationDraft}
          onChange={(e) => setDurationDraft(e.target.value)}
          onBlur={() => {
            const v = Number(durationDraft);
            if (Number.isFinite(v) && v > 0) setTrackDuration(v);
            else setDurationDraft(String(track.durationSec));
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span>s</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="With auto-key on, dragging the Move / Rotate gizmo on an animated object writes a key at the playhead">
          <input type="checkbox" checked={autoKey} onChange={(e) => setAutoKey(e.target.checked)} data-testid="timeline-autokey" />
          Auto-key
        </label>
        {selObjKey && selectedObjectKey ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} data-testid="objkey-selected">
            <span style={{ color: OBJECT_CHANNEL_COLOR[selectedObjectKey.channel] }}>◆</span>
            {OBJECT_CHANNEL_LABEL[selectedObjectKey.channel]} {formatTimecode(selObjKey.timeSec, fps)}
            <select
              value={selObjKey.ease}
              aria-label="Key easing"
              data-testid="objkey-ease"
              onChange={(e) => updateObjectKeyframe(selectedObjectKey.objectId, selectedObjectKey.channel, selObjKey.id, { ease: e.target.value as KeyframeEase })}
            >
              <option value="linear">Linear</option>
              <option value="easeInOut">Ease in / out</option>
            </select>
            <button
              type="button"
              className={styles.zoomBtn}
              title="Delete this key"
              onClick={() => removeObjectKeyframe(selectedObjectKey.objectId, selectedObjectKey.channel, selObjKey.id)}
            >
              ✕
            </button>
          </span>
        ) : null}
        <span className={styles.spacer} />
        <button type="button" className={styles.zoomBtn} onClick={() => setZoom((z) => Math.max(1, z / 1.5))} title="Zoom out" aria-label="Zoom out">−</button>
        <button type="button" className={styles.zoomBtn} onClick={() => setZoom((z) => Math.min(64, z * 1.5))} title="Zoom in" aria-label="Zoom in">+</button>
      </div>
      <div className={styles.grid}>
        <div className={styles.labels}>
          <div className={styles.rulerLabel} />
          {rows.map((layer) => (
            <div
              key={layer.id}
              className={`${styles.label} ${layer.id === selectedLayerId ? styles.labelOn : ''} ${layer.enabled ? '' : styles.labelOff}`}
              onClick={() => selectLayer(layer.id)}
              title={layer.name}
            >
              <span className={styles.labelName}>{layer.name}</span>
              {!compact ? (
                <MappingSelect layer={layer} mappings={show.mappings} onChange={(mappingId) => updateLayer(layer.id, { mappingId })} />
              ) : null}
              {layer.media.kind === 'video' ? (
                <button
                  type="button"
                  className={styles.mini}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(layer.id, { muted: !layer.muted });
                  }}
                  title={layer.muted ? 'Unmute' : 'Mute'}
                  aria-label={layer.muted ? `Unmute ${layer.name}` : `Mute ${layer.name}`}
                >
                  {layer.muted ? '🔇' : '🔊'}
                </button>
              ) : null}
            </div>
          ))}
          {objRows.map((r) =>
            r.kind === 'group' ? (
              <div
                key={`g-${r.obj.id}`}
                className={`${styles.label} ${r.obj.id === selectedObjectId ? styles.labelOn : ''}`}
                onClick={() => selectObject(r.obj.id)}
                title={`${r.obj.name} (animated object)`}
                data-testid={`objrow-${r.obj.id}`}
              >
                <button
                  type="button"
                  className={styles.mini}
                  aria-label={collapsed.has(r.obj.id) ? `Expand ${r.obj.name}` : `Collapse ${r.obj.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapsed(r.obj.id);
                  }}
                >
                  {collapsed.has(r.obj.id) ? '▸' : '▾'}
                </button>
                <span className={styles.labelName}>◇ {r.obj.name}</span>
              </div>
            ) : (
              <div key={`c-${r.obj.id}-${r.channel}`} className={styles.label} style={{ paddingLeft: 30, color: 'var(--muted)' }}>
                <span style={{ color: OBJECT_CHANNEL_COLOR[r.channel] }}>●</span>
                <span className={styles.labelName}>{OBJECT_CHANNEL_LABEL[r.channel]}</span>
              </div>
            ),
          )}
        </div>
        <div className={styles.scroller} ref={scrollerRef}>
          <div className={styles.lanes} style={{ width: laneWidth }}>
            <div className={styles.ruler} onPointerDown={onRulerDown} onPointerMove={onRulerMove} onPointerUp={() => (scrub.current = false)} data-testid="timeline-ruler">
              {ticks.map((s) => (
                <span key={s} className={styles.tick} style={{ left: s * pps }}>
                  {formatTimecode(s, fps).slice(3, 8)}
                </span>
              ))}
              {ticks.map((s) => (
                <span key={`m${s}`} className={styles.minorTick} style={{ left: (s + tickStep / 2) * pps }} />
              ))}
              {track.sections.map((sec) => (
                <span
                  key={sec.id}
                  className={`${styles.sectionBand} ${playMode !== 'play' && sec.id === currentSectionId ? styles.sectionBandOn : ''}`}
                  style={{ left: sec.startSec * pps, width: Math.max(2, (sec.endSec - sec.startSec) * pps) }}
                  title={`${sec.name} · at end: ${sec.endAction}`}
                >
                  {sec.name} · {sec.endAction}
                </span>
              ))}
              {track.cues.map((cue) => (
                <span
                  key={cue.id}
                  className={styles.cueMark}
                  style={{ left: cue.timeSec * pps }}
                  title={`${cue.name} · ${formatTimecode(cue.timeSec, fps)}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    transport.seek(cue.timeSec);
                  }}
                >
                  {cue.name}
                </span>
              ))}
            </div>
            {rows.map((layer) => {
              const len = clipLength(layer, mediaDuration(layer));
              const loopEvery = len && layer.playMode !== 'once' ? len / layer.speed : null;
              const marks: number[] = [];
              if (loopEvery && loopEvery * pps > 6) {
                for (let s = loopEvery; s < layer.durationSec - 1e-3 && marks.length < 200; s += loopEvery) marks.push(s);
              }
              const kindClass = layer.media.kind === 'video' ? styles.clipVideo : layer.media.kind === 'image' ? styles.clipImage : '';
              return (
                <div key={layer.id} className={styles.lane}>
                  <div
                    className={`${styles.clip} ${kindClass} ${layer.id === selectedLayerId ? styles.clipSel : ''} ${layer.enabled ? '' : styles.clipOff}`}
                    style={{ left: layer.startSec * pps, width: Math.max(4, layer.durationSec * pps) }}
                    onPointerDown={(e) => onClipDown(e, layer, 'move')}
                    onPointerMove={onClipMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    data-testid={`clip-${layer.id}`}
                    title={`${layer.name} · ${formatTimecode(layer.startSec, fps)} → ${formatTimecode(layer.startSec + layer.durationSec, fps)}`}
                  >
                    {layer.fadeInSec > 0 ? <span className={styles.fade} style={{ left: 0, width: layer.fadeInSec * pps, clipPath: 'polygon(0 0, 100% 0, 0 100%)' }} /> : null}
                    {layer.fadeOutSec > 0 ? <span className={styles.fade} style={{ right: 0, width: layer.fadeOutSec * pps, clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }} /> : null}
                    {marks.map((s) => (
                      <span key={s} className={styles.loopMark} style={{ left: s * pps }} />
                    ))}
                    {layer.name}
                    <span className={`${styles.handle} ${styles.handleL}`} onPointerDown={(e) => onClipDown(e, layer, 'trimL')} onPointerMove={onClipMove} onPointerUp={endDrag} />
                    <span className={`${styles.handle} ${styles.handleR}`} onPointerDown={(e) => onClipDown(e, layer, 'trimR')} onPointerMove={onClipMove} onPointerUp={endDrag} />
                  </div>
                  {KEYFRAME_PROPS.flatMap((prop, pi) =>
                    (layer.keyframes?.[prop] ?? []).map((key) => {
                      const sel = selectedKeyframe?.keyId === key.id;
                      return (
                        <span
                          key={`${prop}-${key.id}`}
                          className={`${styles.diamond} ${sel ? styles.diamondSel : ''}`}
                          style={{ left: (layer.startSec + key.timeSec) * pps, top: `calc(50% + ${(pi - 2) * 3}px)`, background: KEY_COLORS[prop] }}
                          title={`${KEYFRAME_LABEL[prop]} = ${+key.value.toFixed(3)} at +${key.timeSec.toFixed(2)} s (${key.ease}) — drag to move, Delete to remove`}
                          data-testid={`key-${prop}-${key.id}`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
                            selectLayer(layer.id);
                            setSelectedKeyframe({ layerId: layer.id, prop, keyId: key.id });
                            checkpoint();
                            keyDrag.current = { layerId: layer.id, prop, keyId: key.id, startX: e.clientX, timeSec: key.timeSec };
                          }}
                          onPointerMove={(e) => {
                            const d = keyDrag.current;
                            if (!d) return;
                            const time = Math.max(0, snapToFrame(d.timeSec + (e.clientX - d.startX) / pps, fps));
                            updateKeyframe(d.layerId, d.prop, d.keyId, { timeSec: time }, false);
                          }}
                          onPointerUp={() => (keyDrag.current = null)}
                          onPointerCancel={() => (keyDrag.current = null)}
                        />
                      );
                    }),
                  )}
                </div>
              );
            })}
            {rows.length === 0 ? <div className={styles.empty}>No layers — add a video, image or pattern.</div> : null}
            {objRows.map((r) => {
              const anim = track.objectAnimations?.[r.obj.id];
              if (r.kind === 'group') {
                // Collapsed: every channel's keys on one row; expanded: a summary row.
                return (
                  <div key={`g-${r.obj.id}`} className={styles.lane}>
                    {collapsed.has(r.obj.id)
                      ? OBJECT_CHANNELS.flatMap((channel, ci) => (anim?.[channel] ?? []).map((key) => objectDiamond(r.obj, channel, key, `calc(50% + ${(ci - 1) * 3}px)`)))
                      : null}
                  </div>
                );
              }
              return (
                <div key={`c-${r.obj.id}-${r.channel}`} className={styles.lane}>
                  {(anim?.[r.channel] ?? []).map((key) => objectDiamond(r.obj, r.channel, key, '50%'))}
                </div>
              );
            })}
            <div className={styles.playhead} style={{ left: Math.min(t, track.durationSec) * pps }} data-testid="timeline-playhead" />
          </div>
        </div>
      </div>
    </div>
  );
}
