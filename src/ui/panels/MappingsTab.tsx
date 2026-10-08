import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../../store';
import type {
  DirectFit,
  FeedRect,
  Mapping,
  MappingFiltering,
  MappingKind,
  SceneObject,
  SurfaceUvProjection,
  UvRegion,
  UvWrapMode,
  Vec2,
  Vec3,
} from '../../types';
import {
  activeTrack,
  defaultFeedRect,
  listScreens,
  MAPPING_KINDS,
  MAPPING_KIND_LABEL,
  mappingResolution,
} from '../../mapping/model';
import { feedRectUv } from '../../mapping/sample';
import { quaternionToEulerYXZ } from '../../utils/euler';
import type { SceneEngine } from '../../scene/SceneEngine';
import { MiniNum, svgPoint } from './studioControls';
import styles from './StudioPanel.module.css';

const SURFACE_COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#ba68c8', '#f06292', '#4db6ac', '#e57373', '#aed581'];

function engine(): SceneEngine | undefined {
  return (window as Window & { __projectionLabEngine?: SceneEngine }).__projectionLabEngine;
}

const selectStyle = {
  font: 'inherit',
  background: '#2a2a2e',
  color: '#eee',
  border: '1px solid #3a3a40',
  borderRadius: 4,
  padding: '3px 2px',
} as const;

function Vec3Row({ label, value, step = 0.1, onChange }: { label: string; value: Vec3; step?: number; onChange: (v: Vec3) => void }) {
  return (
    <div className={styles.grid4} style={{ marginTop: 4 }}>
      <span className={styles.rowLabel} style={{ alignSelf: 'end' }}>{label}</span>
      <MiniNum label="X" value={value.x} step={step} onChange={(x) => onChange({ ...value, x })} />
      <MiniNum label="Y" value={value.y} step={step} onChange={(y) => onChange({ ...value, y })} />
      <MiniNum label="Z" value={value.z} step={step} onChange={(z) => onChange({ ...value, z })} />
    </div>
  );
}

/** Rotation as pitch / yaw / roll (degrees). */
function RotationRow({ value, onChange }: { value: Vec3; onChange: (v: Vec3) => void }) {
  return (
    <div className={styles.grid4} style={{ marginTop: 4 }}>
      <span className={styles.rowLabel} style={{ alignSelf: 'end' }}>Rotation °</span>
      <MiniNum label="Pitch" value={value.x} step={1} onChange={(x) => onChange({ ...value, x })} />
      <MiniNum label="Yaw" value={value.y} step={1} onChange={(y) => onChange({ ...value, y })} />
      <MiniNum label="Roll" value={value.z} step={1} onChange={(z) => onChange({ ...value, z })} />
    </div>
  );
}

function frameOf(obj: SceneObject): { center: Vec3; rotation: Vec3 } {
  const e = quaternionToEulerYXZ(obj.transform.quaternion);
  return { center: { ...obj.transform.position }, rotation: { x: e.pitch, y: e.yaw, z: e.roll } };
}

export function MappingsTab() {
  const show = useAppStore((s) => s.show);
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const projectors = useAppStore((s) => s.projectors);
  const selectedId = useAppStore((s) => s.selectedMappingId);
  const select = useAppStore((s) => s.setSelectedMappingId);
  const addMapping = useAppStore((s) => s.addMapping);
  const duplicateMapping = useAppStore((s) => s.duplicateMapping);
  const removeMapping = useAppStore((s) => s.removeMapping);
  const [newKind, setNewKind] = useState<MappingKind>('direct');

  const mappings = show.mappings;
  const selected = mappings.find((m) => m.id === selectedId) ?? mappings[0] ?? null;
  const track = activeTrack(show);
  const screens = listScreens(sceneObjects);

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Mappings</div>
        <p className={styles.hint}>
          A mapping decides how a layer&apos;s canvas lands on screens. Each layer picks one mapping; every
          screen shows its layers composited bottom to top, and projectors light the textured screens.
        </p>
        <div className={styles.surfaceList} data-testid="mapping-list">
          {mappings.length === 0 ? <p className={styles.hint}>No mappings yet.</p> : null}
          {mappings.map((m) => {
            const uses = track.layers.filter((l) => l.mappingId === m.id).length;
            return (
              <button
                type="button"
                key={m.id}
                className={`${styles.surfaceItem} ${selected?.id === m.id ? styles.surfaceItemOn : ''}`}
                onClick={() => select(m.id)}
                data-testid={`mapping-item-${m.id}`}
              >
                {m.name}
                <span className={styles.surfaceMeta}>
                  {MAPPING_KIND_LABEL[m.kind].split(' ')[0]} · {m.screenIds.length} screen{m.screenIds.length === 1 ? '' : 's'} · {uses} layer{uses === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
        <div className={styles.btnRow}>
          <select value={newKind} onChange={(e) => setNewKind(e.target.value as MappingKind)} style={selectStyle} aria-label="New mapping kind">
            {MAPPING_KINDS.map((k) => (
              <option key={k} value={k}>{MAPPING_KIND_LABEL[k]}</option>
            ))}
          </select>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => addMapping(newKind)} data-testid="mapping-add">
            + Add
          </button>
          <button type="button" className={styles.btn} disabled={!selected} onClick={() => selected && duplicateMapping(selected.id)}>
            Duplicate
          </button>
          <button
            type="button"
            className={styles.btn}
            disabled={!selected}
            onClick={() => {
              if (selected && window.confirm(`Delete mapping "${selected.name}"? Its layers keep playing but show nowhere until re-assigned.`)) {
                removeMapping(selected.id);
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
      {selected ? <MappingEditor key={selected.id} mapping={selected} screens={screens} /> : null}
      {selected ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Layers on this mapping</div>
          {track.layers.filter((l) => l.mappingId === selected.id).length === 0 ? (
            <p className={styles.hint}>None — pick this mapping in a layer&apos;s mapping dropdown.</p>
          ) : (
            <p className={styles.hint}>
              {track.layers.filter((l) => l.mappingId === selected.id).map((l) => l.name).join(', ')}
            </p>
          )}
          <p className={styles.hint}>{projectors.length} projector{projectors.length === 1 ? '' : 's'} in the scene.</p>
        </div>
      ) : null}
    </>
  );
}

function MappingEditor({ mapping, screens }: { mapping: Mapping; screens: SceneObject[] }) {
  const projectors = useAppStore((s) => s.projectors);
  const update = useAppStore((s) => s.updateMapping);
  const setKind = useAppStore((s) => s.setMappingKind);
  const set = (patch: Partial<Mapping>, history = true) => update(mapping.id, patch, history);
  const res = mappingResolution(mapping, projectors);
  const locked = mapping.kind === 'perspective' && !!mapping.perspective?.lockToProjectorId;
  const [name, setName] = useState(mapping.name);
  useEffect(() => setName(mapping.name), [mapping.name]);

  const toggleScreen = (id: string, on: boolean) => {
    const screenIds = on ? [...mapping.screenIds, id] : mapping.screenIds.filter((s) => s !== id);
    const patch: Partial<Mapping> = { screenIds };
    if (mapping.kind === 'feed' && mapping.feed) {
      const rects = on
        ? [...mapping.feed.rects.filter((r) => r.screenId !== id), defaultFeedRect(id)]
        : mapping.feed.rects.filter((r) => r.screenId !== id);
      patch.feed = { rects };
    }
    set(patch);
  };

  const firstScreen = screens.find((s) => mapping.screenIds.includes(s.id)) ?? screens[0];

  return (
    <>
      <div className={styles.section} data-testid="mapping-editor">
        <div className={styles.sectionTitle}>Edit mapping</div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name !== mapping.name && set({ name: name.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            data-testid="mapping-name"
            style={{ ...selectStyle, flex: 1 }}
          />
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Kind</span>
          <select value={mapping.kind} onChange={(e) => setKind(mapping.id, e.target.value as MappingKind)} data-testid="mapping-kind">
            {MAPPING_KINDS.map((k) => (
              <option key={k} value={k}>{MAPPING_KIND_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div className={styles.grid4}>
          <MiniNum label="Canvas W" value={res.w} step={1} onChange={(w) => !locked && set({ resolution: { ...mapping.resolution, w: Math.max(1, Math.round(w)) } })} />
          <MiniNum label="Canvas H" value={res.h} step={1} onChange={(h) => !locked && set({ resolution: { ...mapping.resolution, h: Math.max(1, Math.round(h)) } })} />
          <label className={styles.mini}>
            Filtering
            <select value={mapping.filtering} onChange={(e) => set({ filtering: e.target.value as MappingFiltering })} style={selectStyle}>
              <option value="nearest">Nearest</option>
              <option value="bilinear">Bilinear</option>
              <option value="msaa2x">MSAA 2×</option>
            </select>
          </label>
        </div>
        {locked ? <p className={styles.hint}>Canvas follows the locked projector&apos;s resolution.</p> : null}
        <div className={styles.sectionTitle} style={{ marginTop: 10 }}>Screens</div>
        {screens.length === 0 ? <p className={styles.hint}>No screens: turn on “Receives projection” on an object, or add an LED wall.</p> : null}
        <div className={styles.btnRow} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          {screens.map((obj) => (
            <label key={obj.id} className={styles.check}>
              <input
                type="checkbox"
                checked={mapping.screenIds.includes(obj.id)}
                onChange={(e) => toggleScreen(obj.id, e.target.checked)}
                data-testid={`mapping-screen-${obj.id}`}
              />
              {obj.name} <span className={styles.surfaceMeta}>{obj.type}</span>
            </label>
          ))}
        </div>
      </div>

      {mapping.kind === 'direct' ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Direct</div>
          <p className={styles.hint}>The canvas covers each screen&apos;s own UV layout.</p>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Fit</span>
            <select value={mapping.direct?.fit ?? 'stretch'} onChange={(e) => set({ direct: { fit: e.target.value as DirectFit } })}>
              <option value="stretch">Stretch</option>
              <option value="fit">Fit (letterbox)</option>
              <option value="crop">Crop (fill)</option>
              <option value="pixel">Pixel 1:1</option>
            </select>
          </div>
        </div>
      ) : null}

      {mapping.kind === 'perspective' && mapping.perspective ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Perspective</div>
          <p className={styles.hint}>Projects the canvas from a viewpoint onto the screens.</p>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Lock to</span>
            <select
              value={mapping.perspective.lockToProjectorId ?? ''}
              onChange={(e) =>
                set({ perspective: { ...mapping.perspective!, lockToProjectorId: e.target.value || null, projectorOnly: e.target.value ? mapping.perspective!.projectorOnly : false } })
              }
              data-testid="mapping-lock"
            >
              <option value="">Free camera</option>
              {projectors.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {mapping.perspective.lockToProjectorId ? (
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={mapping.perspective.projectorOnly}
                onChange={(e) => set({ perspective: { ...mapping.perspective!, projectorOnly: e.target.checked } })}
              />
              Only this projector shows it (raw per-projector content)
            </label>
          ) : (
            <>
              <Vec3Row label="Eye (m)" value={mapping.perspective.eye} onChange={(eye) => set({ perspective: { ...mapping.perspective!, eye } })} />
              <RotationRow value={mapping.perspective.rotation} onChange={(rotation) => set({ perspective: { ...mapping.perspective!, rotation } })} />
              <div className={styles.grid4} style={{ marginTop: 4 }}>
                <MiniNum label="FOV ° (V)" value={mapping.perspective.fovDeg} step={1} onChange={(fovDeg) => set({ perspective: { ...mapping.perspective!, fovDeg: Math.min(170, Math.max(1, fovDeg)) } })} />
              </div>
            </>
          )}
        </div>
      ) : null}

      {mapping.kind === 'parallel' && mapping.parallel ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Parallel</div>
          <p className={styles.hint}>Orthographic projection along the frame&apos;s −Z axis.</p>
          <Vec3Row label="Centre (m)" value={mapping.parallel.center} onChange={(center) => set({ parallel: { ...mapping.parallel!, center } })} />
          <RotationRow value={mapping.parallel.rotation} onChange={(rotation) => set({ parallel: { ...mapping.parallel!, rotation } })} />
          <div className={styles.grid4} style={{ marginTop: 4 }}>
            <MiniNum label="Width m" value={mapping.parallel.size.w} step={0.1} onChange={(w) => set({ parallel: { ...mapping.parallel!, size: { ...mapping.parallel!.size, w: Math.max(0.01, w) } } })} />
            <MiniNum label="Height m" value={mapping.parallel.size.h} step={0.1} onChange={(h) => set({ parallel: { ...mapping.parallel!, size: { ...mapping.parallel!.size, h: Math.max(0.01, h) } } })} />
          </div>
          {firstScreen ? (
            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.btn}
                onClick={() =>
                  set({
                    parallel: {
                      ...frameOf(firstScreen),
                      size: { w: firstScreen.dimensions.width, h: firstScreen.dimensions.height },
                    },
                  })
                }
              >
                Fit to {firstScreen.name}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mapping.kind === 'cylindrical' && mapping.cylindrical ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Cylindrical</div>
          <p className={styles.hint}>Wraps the canvas around a vertical axis (u = azimuth, v = height).</p>
          <Vec3Row label="Axis (m)" value={mapping.cylindrical.center} onChange={(center) => set({ cylindrical: { ...mapping.cylindrical!, center } })} />
          <RotationRow value={mapping.cylindrical.rotation} onChange={(rotation) => set({ cylindrical: { ...mapping.cylindrical!, rotation } })} />
          <div className={styles.grid4} style={{ marginTop: 4 }}>
            <MiniNum label="Arc °" value={mapping.cylindrical.arcDeg} step={1} onChange={(arcDeg) => set({ cylindrical: { ...mapping.cylindrical!, arcDeg: Math.min(360, Math.max(1, arcDeg)) } })} />
            <MiniNum label="Height m" value={mapping.cylindrical.height} step={0.1} onChange={(height) => set({ cylindrical: { ...mapping.cylindrical!, height: Math.max(0.01, height) } })} />
          </div>
          {firstScreen?.curved ? (
            <div className={styles.btnRow}>
              <button
                type="button"
                className={styles.btn}
                onClick={() =>
                  set({
                    cylindrical: {
                      ...frameOf(firstScreen),
                      arcDeg: firstScreen.curved!.arcAngleDeg,
                      height: firstScreen.curved!.height,
                    },
                  })
                }
              >
                Fit to {firstScreen.name}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {mapping.kind === 'spherical' && mapping.spherical ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Spherical</div>
          <p className={styles.hint}>Equirectangular: u = azimuth, v = elevation, seen from the centre.</p>
          <Vec3Row label="Centre (m)" value={mapping.spherical.center} onChange={(center) => set({ spherical: { ...mapping.spherical!, center } })} />
          <RotationRow value={mapping.spherical.rotation} onChange={(rotation) => set({ spherical: { ...mapping.spherical!, rotation } })} />
          <div className={styles.grid4} style={{ marginTop: 4 }}>
            <MiniNum label="Arc °" value={mapping.spherical.arcDeg} step={1} onChange={(arcDeg) => set({ spherical: { ...mapping.spherical!, arcDeg: Math.min(360, Math.max(1, arcDeg)) } })} />
            <MiniNum label="Elevation °" value={mapping.spherical.elevationDeg} step={1} onChange={(elevationDeg) => set({ spherical: { ...mapping.spherical!, elevationDeg: Math.min(180, Math.max(1, elevationDeg)) } })} />
          </div>
        </div>
      ) : null}

      {mapping.kind === 'feed' ? <FeedEditor mapping={mapping} screens={screens} /> : null}
    </>
  );
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

/** Region editor: where each screen sits in the mapping canvas. */
function FeedEditor({ mapping, screens }: { mapping: Mapping; screens: SceneObject[] }) {
  const projectors = useAppStore((s) => s.projectors);
  const update = useAppStore((s) => s.updateMapping);
  const checkpoint = useAppStore((s) => s.pushSceneHistoryCheckpoint);
  const previewMode = useAppStore((s) => s.materialPreviewMode);
  const setPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);
  const rects = mapping.feed?.rects ?? [];
  const [selId, setSelId] = useState<string | null>(rects[0]?.screenId ?? null);
  const selected = rects.find((r) => r.screenId === selId) ?? rects[0] ?? null;
  const res = mappingResolution(mapping, projectors);
  const W = 400;
  const H = Math.round(W / (res.w / Math.max(1, res.h)));
  const pad = 14;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; mode: DragMode; start: Vec2; region: UvRegion } | null>(null);
  const [segments, setSegments] = useState<[number, number, number, number][]>([]);
  const nameOf = (id: string) => screens.find((s) => s.id === id)?.name ?? id;

  const setRect = (screenId: string, patch: Partial<FeedRect>, history = true) => {
    update(
      mapping.id,
      { feed: { rects: rects.map((r) => (r.screenId === screenId ? { ...r, ...patch } : r)) } },
      history,
    );
  };

  useEffect(() => {
    if (!selected) {
      setSegments([]);
      return;
    }
    const t = setTimeout(() => setSegments(engine()?.getSurfaceUvSegments(selected.screenId, selected.projection) ?? []), 30);
    return () => clearTimeout(t);
  }, [selected?.screenId, selected?.projection]);

  const onPointerDown = (e: ReactPointerEvent, rect: FeedRect, mode: DragMode) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelId(rect.screenId);
    checkpoint();
    drag.current = { id: rect.screenId, mode, start: svgPoint(svg, e.clientX, e.clientY), region: { ...rect.region } };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    const svg = svgRef.current;
    if (!d || !svg) return;
    const p = svgPoint(svg, e.clientX, e.clientY);
    let dx = (p.x - d.start.x) / W;
    let dy = (p.y - d.start.y) / H;
    if (e.shiftKey) {
      dx = Math.round(dx * 20) / 20;
      dy = Math.round(dy * 20) / 20;
    }
    const r = { ...d.region };
    const min = 0.02;
    if (d.mode === 'move') {
      r.x += dx;
      r.y += dy;
    } else {
      if (d.mode === 'nw' || d.mode === 'sw') {
        const nx = Math.min(r.x + r.width - min, r.x + dx);
        r.width += r.x - nx;
        r.x = nx;
      } else r.width = Math.max(min, r.width + dx);
      if (d.mode === 'nw' || d.mode === 'ne') {
        const ny = Math.min(r.y + r.height - min, r.y + dy);
        r.height += r.y - ny;
        r.y = ny;
      } else r.height = Math.max(min, r.height + dy);
    }
    setRect(d.id, { region: r }, false);
  };

  const layoutSideBySide = () => {
    if (rects.length === 0) return;
    update(mapping.id, {
      feed: { rects: rects.map((r, i) => ({ ...r, region: { x: i / rects.length, y: 0, width: 1 / rects.length, height: 1 } })) },
    });
  };

  const wire = useMemo(() => {
    if (!selected) return '';
    const parts: string[] = [];
    for (const [ax, ay, bx, by] of segments) {
      const a = feedRectUv(selected, { x: ax, y: ay });
      const b = feedRectUv(selected, { x: bx, y: by });
      if (!a || !b) continue;
      if (selected.wrap !== 'clamp' && (Math.abs(a.x - b.x) > 0.5 / selected.repeatU || Math.abs(a.y - b.y) > 0.5 / selected.repeatV)) continue;
      parts.push(`M${(a.x * W).toFixed(1)},${((1 - a.y) * H).toFixed(1)}L${(b.x * W).toFixed(1)},${((1 - b.y) * H).toFixed(1)}`);
    }
    return parts.join('');
  }, [segments, selected, W, H]);

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Feed — canvas regions ({res.w}×{res.h})</div>
        <svg
          ref={svgRef}
          className={styles.editor}
          viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
          data-testid="uv-editor"
        >
          <rect x={0} y={0} width={W} height={H} fill="#1b1b1f" stroke="#555" />
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} stroke="#2c2c33">
              <line x1={((i + 1) / 10) * W} x2={((i + 1) / 10) * W} y1={0} y2={H} />
              <line y1={((i + 1) / 10) * H} y2={((i + 1) / 10) * H} x1={0} x2={W} />
            </g>
          ))}
          {rects.map((rect, i) => {
            const color = SURFACE_COLORS[i % SURFACE_COLORS.length];
            const r = rect.region;
            const isSel = rect.screenId === selected?.screenId;
            const x = r.x * W;
            const y = r.y * H;
            const w = r.width * W;
            const h = r.height * H;
            return (
              <g key={rect.screenId} opacity={isSel ? 1 : 0.6}>
                <rect x={x} y={y} width={w} height={h} fill={color} fillOpacity={isSel ? 0.12 : 0.08} stroke={color} strokeWidth={isSel ? 2 : 1} style={{ cursor: 'move' }} onPointerDown={(e) => onPointerDown(e, rect, 'move')} />
                <text x={x + 5} y={y + 13} fill={color} fontSize={11} pointerEvents="none">{nameOf(rect.screenId)}</text>
                {isSel
                  ? ([
                      ['nw', x, y],
                      ['ne', x + w, y],
                      ['sw', x, y + h],
                      ['se', x + w, y + h],
                    ] as [DragMode, number, number][]).map(([mode, hx, hy]) => (
                      <rect key={mode} x={hx - 5} y={hy - 5} width={10} height={10} fill="#fff" stroke={color} strokeWidth={2} style={{ cursor: `${mode}-resize` }} onPointerDown={(e) => onPointerDown(e, rect, mode)} />
                    ))
                  : null}
              </g>
            );
          })}
          {wire ? <path d={wire} stroke="#e0e0e0" strokeOpacity={0.55} strokeWidth={0.6} fill="none" pointerEvents="none" /> : null}
        </svg>
        <p className={styles.hint}>Drag a region to move it, corners to resize (Shift snaps to 5 %). The wireframe is the selected screen&apos;s surface UV.</p>
        <div className={styles.btnRow}>
          <button type="button" className={styles.btn} onClick={layoutSideBySide} disabled={rects.length === 0}>
            Auto-layout side by side
          </button>
          <button
            type="button"
            className={`${styles.btn} ${previewMode === 'surfaceUv' ? styles.btnPrimary : ''}`}
            onClick={() => setPreviewMode(previewMode === 'surfaceUv' ? 'projectionPreview' : 'surfaceUv')}
            data-testid="preview-surface-uv"
          >
            Surface UV preview
          </button>
        </div>
      </div>
      {selected ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{nameOf(selected.screenId)} — region</div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Surface UV</span>
            <select value={selected.projection} onChange={(e) => setRect(selected.screenId, { projection: e.target.value as SurfaceUvProjection })}>
              <option value="meshUv">Mesh UV (from geometry)</option>
              <option value="planar">Planar (box-fit)</option>
              <option value="cylindrical">Cylindrical (arc-fit)</option>
              <option value="spherical">Spherical</option>
            </select>
          </div>
          <div className={styles.grid4}>
            <MiniNum label="Region X" value={selected.region.x} onChange={(v) => setRect(selected.screenId, { region: { ...selected.region, x: v } })} />
            <MiniNum label="Region Y" value={selected.region.y} onChange={(v) => setRect(selected.screenId, { region: { ...selected.region, y: v } })} />
            <MiniNum label="Width" value={selected.region.width} onChange={(v) => setRect(selected.screenId, { region: { ...selected.region, width: v } })} />
            <MiniNum label="Height" value={selected.region.height} onChange={(v) => setRect(selected.screenId, { region: { ...selected.region, height: v } })} />
          </div>
          <div className={styles.grid4} style={{ marginTop: 6 }}>
            <MiniNum label="Rotate °" value={selected.rotationDeg} step={1} onChange={(v) => setRect(selected.screenId, { rotationDeg: v })} />
            <MiniNum label="Repeat U" value={selected.repeatU} step={0.1} onChange={(v) => setRect(selected.screenId, { repeatU: v })} />
            <MiniNum label="Repeat V" value={selected.repeatV} step={0.1} onChange={(v) => setRect(selected.screenId, { repeatV: v })} />
            <label className={styles.mini}>
              Wrap
              <select value={selected.wrap} onChange={(e) => setRect(selected.screenId, { wrap: e.target.value as UvWrapMode })} style={selectStyle}>
                <option value="clamp">Clamp</option>
                <option value="repeat">Repeat</option>
                <option value="mirror">Mirror</option>
              </select>
            </label>
          </div>
          <div className={styles.btnRow}>
            <label className={styles.check}>
              <input type="checkbox" checked={selected.flipU} onChange={(e) => setRect(selected.screenId, { flipU: e.target.checked })} /> Flip U
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={selected.flipV} onChange={(e) => setRect(selected.screenId, { flipV: e.target.checked })} /> Flip V
            </label>
            <button type="button" className={styles.btn} onClick={() => setRect(selected.screenId, { rotationDeg: (selected.rotationDeg + 90) % 360 })}>
              Rotate 90°
            </button>
            <button type="button" className={styles.btn} onClick={() => setRect(selected.screenId, { region: { x: 0, y: 0, width: 1, height: 1 } })}>
              Full canvas
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
