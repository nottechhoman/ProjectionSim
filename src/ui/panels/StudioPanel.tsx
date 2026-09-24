import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../../store';
import type {
  BlendCurve,
  BlendSettings,
  ProjectorConfig,
  SceneObject,
  SurfaceUvMapping,
  SurfaceUvProjection,
  UvRegion,
  UvWrapMode,
  Vec2,
} from '../../types';
import { DEFAULT_PROJECTOR_WARP } from '../../types';
import {
  autoBlendWeights,
  blackFloor,
  lightWeight,
  MAX_AUTO_EXPONENT,
  MAX_BLACK_LEVEL,
  MIN_AUTO_EXPONENT,
  MIN_AUTO_WIDTH,
} from '../../blending/advancedBlend';
import { blendWeightWithGamma } from '../../blending/blendWeights';
import {
  defaultProjectionForType,
  normalizeSurfaceUvMapping,
  surfaceToContentUv,
} from '../../uvmapping/surfaceUv';
import { applyMat3, fitWarpToRasterPoints, isValidWarpQuad, squareToQuad } from '../../warp/homography';
import type { SceneEngine } from '../../scene/SceneEngine';
import { isCompactLayout } from '../deviceProfile';
import { useDeviceProfile } from '../useDeviceProfile';
import styles from './StudioPanel.module.css';
import {
  outputWindows,
  queryDisplays,
  windowManagementSupported,
  type DisplayInfo,
  type OutputConfig,
  type OutputContent,
} from '../../output/outputWindows';

export type StudioTab = 'blend' | 'uv' | 'warp' | 'outputs';
type Tab = StudioTab;

const SURFACE_COLORS = ['#4fc3f7', '#ffb74d', '#81c784', '#ba68c8', '#f06292', '#4db6ac', '#e57373', '#aed581'];

function engine(): SceneEngine | undefined {
  return (window as Window & { __projectionLabEngine?: SceneEngine }).__projectionLabEngine;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}

function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'projector';
}

/** Pointer position inside an SVG in viewBox units. */
function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): Vec2 {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => v.toFixed(2),
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  testId?: string;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        data-testid={testId}
      />
      <input
        className={styles.numBox}
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number(format(value))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
      />
    </div>
  );
}

function MiniNum({ label, value, step = 0.01, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(String(+value.toFixed(4)));
  useEffect(() => setDraft(String(+value.toFixed(4))), [value]);
  return (
    <label className={styles.mini}>
      {label}
      <input
        type="number"
        step={step}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Blend tab
// ---------------------------------------------------------------------------

function CrossoverChart({ settings, projectors }: { settings: BlendSettings; projectors: ProjectorConfig[] }) {
  const W = 400;
  const H = 130;
  const samples = 60;
  const overlapFrac = 0.3;
  const a = projectors[0];
  const b = projectors[1];
  const curves = useMemo(() => {
    const la: number[] = [];
    const lb: number[] = [];
    const sum: number[] = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const qa = { x: 1 - overlapFrac + overlapFrac * t, y: 0.5 };
      const qb = { x: overlapFrac * t, y: 0.5 };
      let wa: number;
      let wb: number;
      if (settings.mode === 'auto') {
        [wa, wb] = autoBlendWeights([qa, qb], settings);
      } else {
        const ea = a?.blendEdges ?? { left: 0, right: overlapFrac, top: 0, bottom: 0 };
        const eb = b?.blendEdges ?? { left: overlapFrac, right: 0, top: 0, bottom: 0 };
        wa = blendWeightWithGamma(qa.x, 0.5, ea, false, a?.blendGamma ?? 1);
        wb = blendWeightWithGamma(qb.x, 0.5, eb, false, b?.blendGamma ?? 1);
      }
      const bl = settings.blackLevel;
      const A = (1 - bl) * lightWeight(wa, settings);
      const B = (1 - bl) * lightWeight(wb, settings);
      la.push(A);
      lb.push(B);
      sum.push(A + B + blackFloor(2, 2, settings));
    }
    return { la, lb, sum };
  }, [settings, a, b]);
  const maxY = Math.max(1.2, ...curves.sum) * 1.05;
  const path = (vals: number[]) =>
    vals
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / samples) * W).toFixed(1)},${(H - (v / maxY) * H).toFixed(1)}`)
      .join(' ');
  const oneY = H - (1 / maxY) * H;
  return (
    <div>
      <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" data-testid="blend-chart">
        <line x1={0} x2={W} y1={oneY} y2={oneY} stroke="#555" strokeDasharray="4 4" />
        <path d={path(curves.la)} fill="none" stroke="#4fc3f7" strokeWidth={2} />
        <path d={path(curves.lb)} fill="none" stroke="#ff7043" strokeWidth={2} />
        <path d={path(curves.sum)} fill="none" stroke="#e8e8e8" strokeWidth={2.5} />
      </svg>
      <div className={styles.legend}>
        <span><i className={styles.swatch} style={{ background: '#4fc3f7' }} />Left projector light</span>
        <span><i className={styles.swatch} style={{ background: '#ff7043' }} />Right projector light</span>
        <span><i className={styles.swatch} style={{ background: '#e8e8e8' }} />Sum (flat = seamless)</span>
      </div>
    </div>
  );
}

function BlendTab() {
  const settings = useAppStore((s) => s.blendSettings);
  const setBlendSettings = useAppStore((s) => s.setBlendSettings);
  const analysis = useAppStore((s) => s.blendAnalysis);
  const projectors = useAppStore((s) => s.projectors);
  const compositeMode = useAppStore((s) => s.projectionCompositeMode);
  const setCompositeMode = useAppStore((s) => s.setProjectionCompositeMode);
  const previewMode = useAppStore((s) => s.materialPreviewMode);
  const setPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);
  const autoBlendFromOverlap = useAppStore((s) => s.autoBlendFromOverlap);
  const enabled = projectors.filter((p) => p.enabled);
  const [exporting, setExporting] = useState(false);

  const exportAll = (kind: 'mask' | 'color') => {
    const eng = engine();
    if (!eng) return;
    setExporting(true);
    // Let the button state paint before the synchronous GPU readbacks.
    requestAnimationFrame(() => {
      try {
        for (const p of enabled.slice(0, 4)) {
          const canvas = eng.renderProjectorFeed(p.id, kind);
          if (canvas) downloadCanvas(canvas, `${slug(p.name)}-${kind === 'mask' ? 'blend-mask' : 'feed'}-${canvas.width}x${canvas.height}.png`);
        }
      } finally {
        setExporting(false);
      }
    });
  };

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Blend engine</div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Mode</span>
          <div className={styles.seg}>
            {(['manual', 'auto'] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={settings.mode === m ? styles.segOn : undefined}
                onClick={() => setBlendSettings({ mode: m })}
                data-testid={`blend-mode-${m}`}
              >
                {m === 'manual' ? 'Manual feathers' : 'Auto (geometry)'}
              </button>
            ))}
          </div>
        </div>
        {settings.mode === 'auto' ? (
          <>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Curve</span>
              <select value={settings.curve} onChange={(e) => setBlendSettings({ curve: e.target.value as BlendCurve })}>
                <option value="linear">Linear</option>
                <option value="smoothstep">Smoothstep (S-curve)</option>
                <option value="cosine">Cosine</option>
                <option value="power">Power (quadratic)</option>
              </select>
            </div>
            <Slider label="Ramp width" value={settings.width} min={MIN_AUTO_WIDTH} max={1} step={0.01} onChange={(v) => setBlendSettings({ width: v })} />
            <Slider label="Sharpness" value={settings.exponent} min={MIN_AUTO_EXPONENT} max={MAX_AUTO_EXPONENT} step={0.05} onChange={(v) => setBlendSettings({ exponent: v })} />
            <p className={styles.hint}>
              Every projector reaching a point gets a weight from its distance to its own (warped)
              image edge; weights are normalised to sum to 1. Works for any overlap shape, curved
              screens, keystoned projectors and 3–4-way corners.
            </p>
          </>
        ) : (
          <>
            <p className={styles.hint}>
              Per-projector left/right/top/bottom feathers from the Inspector (Blend edges).
            </p>
            <div className={styles.btnRow}>
              <button type="button" className={styles.btn} onClick={autoBlendFromOverlap} disabled={enabled.length < 2}>
                Derive feathers from overlap
              </button>
            </div>
          </>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Gamma &amp; black level</div>
        <label className={styles.check}>
          <input type="checkbox" checked={settings.gammaCorrect} onChange={(e) => setBlendSettings({ gammaCorrect: e.target.checked })} />
          Gamma-correct blend mask (pre-compensate display γ)
        </label>
        <Slider label="Display γ" value={settings.displayGamma} min={1} max={3} step={0.05} onChange={(v) => setBlendSettings({ displayGamma: v })} />
        <Slider
          label="Black level"
          value={settings.blackLevel}
          min={0}
          max={MAX_BLACK_LEVEL}
          step={0.001}
          format={(v) => v.toFixed(3)}
          onChange={(v) => setBlendSettings({ blackLevel: v })}
          testId="black-level"
        />
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={settings.blackLevelCompensation}
            onChange={(e) => setBlendSettings({ blackLevelCompensation: e.target.checked })}
          />
          Black-level compensation (lift non-overlap areas)
        </label>
        <p className={styles.hint}>
          Black level is the light a projector leaks when showing black (≈0.1–0.5 % for real
          projectors; exaggerate it to see the effect). Use the <b>Black</b> test pattern to check it.
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Crossover (2 projectors, 30 % overlap)</div>
        <CrossoverChart settings={settings} projectors={enabled} />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Uniformity on calculation target</div>
        {analysis && analysis.coveredSamples > 0 ? (
          <>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <div className={`${styles.statValue} ${analysis.uniformFraction > 0.98 ? styles.good : styles.bad}`} data-testid="blend-uniformity">
                  {pct(analysis.uniformFraction)}
                </div>
                <div className={styles.statLabel}>within ±2 % of 1.0</div>
              </div>
              <div className={styles.stat}>
                <div className={`${styles.statValue} ${analysis.worstSeamDeviation < 0.02 ? styles.good : styles.bad}`}>
                  {pct(analysis.worstSeamDeviation)}
                </div>
                <div className={styles.statLabel}>worst seam error</div>
              </div>
              <div className={styles.stat}>
                <div className={styles.statValue}>{analysis.maxOverlap}×</div>
                <div className={styles.statLabel}>max overlap</div>
              </div>
            </div>
            <p className={styles.hint}>
              Light-sum range {analysis.minSum.toFixed(3)}–{analysis.maxSum.toFixed(3)} over{' '}
              {analysis.coveredSamples} covered samples ({analysis.overlapSamples} in overlaps).
              {compositeMode !== 'blended' ? ' Composite is not Blend — the viewport shows raw additive light.' : ''}
            </p>
          </>
        ) : (
          <p className={styles.hint}>Needs an enabled projector hitting a flat or curved calculation target.</p>
        )}
        <div className={styles.btnRow}>
          <button
            type="button"
            className={`${styles.btn} ${compositeMode === 'blended' ? styles.btnPrimary : ''}`}
            onClick={() => setCompositeMode('blended')}
            disabled={enabled.length < 2}
          >
            Composite: Blend
          </button>
          <button
            type="button"
            className={`${styles.btn} ${previewMode === 'blendSum' ? styles.btnPrimary : ''}`}
            onClick={() => setPreviewMode(previewMode === 'blendSum' ? 'projectionPreview' : 'blendSum')}
            data-testid="preview-blend-sum"
          >
            Blend Σ heatmap
          </button>
        </div>
        <p className={styles.hint}>Σ heatmap: green = seamless, blue = dark seam, red = hot seam.</p>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Export</div>
        <div className={styles.btnRow}>
          <button type="button" className={styles.btn} disabled={exporting || enabled.length === 0} onClick={() => exportAll('mask')} data-testid="export-masks">
            Blend masks (PNG)
          </button>
          <button type="button" className={styles.btn} disabled={exporting || enabled.length === 0} onClick={() => exportAll('color')}>
            Projector feeds (PNG)
          </button>
        </div>
        <p className={styles.hint}>
          One file per enabled projector at native resolution (capped at 4096 px). Masks are
          signal-space (gamma-corrected when enabled) — the image you would load into a media
          server or projector blend layer.
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// UV mapping tab
// ---------------------------------------------------------------------------

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se';

function mappingOf(obj: SceneObject): SurfaceUvMapping {
  return obj.uvMapping
    ? normalizeSurfaceUvMapping(obj.uvMapping)
    : { ...normalizeSurfaceUvMapping(undefined), projection: defaultProjectionForType(obj.type) };
}

function UvTab() {
  const sceneObjects = useAppStore((s) => s.sceneObjects);
  const selectedObjectId = useAppStore((s) => s.selectedObjectId);
  const setSelectedObject = useAppStore((s) => s.setSelectedObject);
  const update = useAppStore((s) => s.updateSceneObjectUvMapping);
  const checkpoint = useAppStore((s) => s.pushSceneHistoryCheckpoint);
  const contentCanvas = useAppStore((s) => s.contentCanvas);
  const mappingMode = useAppStore((s) => s.mappingMode);
  const setMappingMode = useAppStore((s) => s.setMappingMode);
  const previewMode = useAppStore((s) => s.materialPreviewMode);
  const setPreviewMode = useAppStore((s) => s.setMaterialPreviewMode);
  const projectors = useAppStore((s) => s.projectors);
  const sharedSourceId = useAppStore((s) => s.sharedContentSourceProjectorId);

  const surfaces = sceneObjects.filter((o) => o.receivesProjection && o.type !== 'ledWall');
  const [localSel, setLocalSel] = useState<string | null>(null);
  const selected =
    surfaces.find((o) => o.id === selectedObjectId) ??
    surfaces.find((o) => o.id === localSel) ??
    surfaces[0] ??
    null;
  const mapping = selected ? mappingOf(selected) : null;

  const source = projectors.find((p) => p.id === sharedSourceId) ?? projectors[0];
  const aspect = contentCanvas.enabled
    ? contentCanvas.widthPx / contentCanvas.heightPx
    : source?.optics.aspectRatio ?? 16 / 9;
  const W = 400;
  const H = Math.round(W / aspect);
  const pad = 14;

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; mode: DragMode; start: Vec2; region: UvRegion } | null>(null);

  const [segments, setSegments] = useState<[number, number, number, number][]>([]);
  const dimsKey = selected ? JSON.stringify([selected.dimensions, selected.curved, selected.modelAssetId, selected.modelScale]) : '';
  useEffect(() => {
    if (!selected || !mapping) {
      setSegments([]);
      return;
    }
    const t = setTimeout(() => setSegments(engine()?.getSurfaceUvSegments(selected.id, mapping.projection) ?? []), 30);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, mapping?.projection, dimsKey]);

  const set = (patch: Partial<SurfaceUvMapping>, history = true) => {
    if (selected) update(selected.id, patch, history);
  };

  const onPointerDown = (e: ReactPointerEvent, obj: SceneObject, mode: DragMode) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setSelectedObject(obj.id);
    setLocalSel(obj.id);
    checkpoint();
    const p = svgPoint(svg, e.clientX, e.clientY);
    drag.current = { id: obj.id, mode, start: p, region: { ...mappingOf(obj).region } };
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
      } else {
        r.width = Math.max(min, r.width + dx);
      }
      if (d.mode === 'nw' || d.mode === 'ne') {
        const ny = Math.min(r.y + r.height - min, r.y + dy);
        r.height += r.y - ny;
        r.y = ny;
      } else {
        r.height = Math.max(min, r.height + dy);
      }
    }
    update(d.id, { region: r, enabled: true }, false);
  };

  const endDrag = () => {
    drag.current = null;
  };

  const layoutSideBySide = () => {
    const targets = surfaces;
    if (targets.length === 0) return;
    checkpoint();
    targets.forEach((obj, i) => {
      update(
        obj.id,
        { enabled: true, region: { x: i / targets.length, y: 0, width: 1 / targets.length, height: 1 } },
        false,
      );
    });
  };

  const toSvg = (c: Vec2) => ({ x: c.x * W, y: (1 - c.y) * H });
  const wire = useMemo(() => {
    if (!mapping) return '';
    const parts: string[] = [];
    for (const [ax, ay, bx, by] of segments) {
      const a = surfaceToContentUv({ x: ax, y: ay }, mapping);
      const b = surfaceToContentUv({ x: bx, y: by }, mapping);
      if (!a || !b) continue;
      // Wrapped (repeat / mirror) UVs jump across tile borders — drop those edges.
      if (mapping.wrap !== 'clamp' && (Math.abs(a.x - b.x) > 0.5 / mapping.repeatU || Math.abs(a.y - b.y) > 0.5 / mapping.repeatV)) continue;
      const pa = toSvg(a);
      const pb = toSvg(b);
      parts.push(`M${pa.x.toFixed(1)},${pa.y.toFixed(1)}L${pb.x.toFixed(1)},${pb.y.toFixed(1)}`);
    }
    return parts.join('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, mapping, W, H]);

  const sharedActive = mappingMode === 'sharedCanvas' || contentCanvas.enabled;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Surfaces</div>
        <div className={styles.surfaceList}>
          {surfaces.length === 0 ? <p className={styles.hint}>No receiving surfaces.</p> : null}
          {surfaces.map((obj, i) => {
            const m = mappingOf(obj);
            return (
              <button
                type="button"
                key={obj.id}
                className={`${styles.surfaceItem} ${selected?.id === obj.id ? styles.surfaceItemOn : ''}`}
                onClick={() => {
                  setSelectedObject(obj.id);
                  setLocalSel(obj.id);
                }}
              >
                <i className={styles.swatch} style={{ background: SURFACE_COLORS[i % SURFACE_COLORS.length] }} />
                {obj.name}
                <span className={styles.surfaceMeta}>
                  {m.enabled ? `${m.projection} · ${Math.round(m.region.width * 100)}×${Math.round(m.region.height * 100)}%` : 'legacy shared'}
                </span>
              </button>
            );
          })}
        </div>
        {!sharedActive ? (
          <p className={styles.warn}>
            UV mapping applies in Shared mapping (or with the content canvas).{' '}
            <button type="button" className={styles.btn} onClick={() => setMappingMode('sharedCanvas')}>
              Switch to Shared
            </button>
          </p>
        ) : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          UV editor — content space {contentCanvas.enabled ? `(canvas ${contentCanvas.widthPx}×${contentCanvas.heightPx})` : `(source ${source?.name ?? ''})`}
        </div>
        <svg
          ref={svgRef}
          className={styles.editor}
          viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          data-testid="uv-editor"
        >
          <rect x={0} y={0} width={W} height={H} fill="#1b1b1f" stroke="#555" />
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} stroke="#2c2c33">
              <line x1={((i + 1) / 10) * W} x2={((i + 1) / 10) * W} y1={0} y2={H} />
              <line y1={((i + 1) / 10) * H} y2={((i + 1) / 10) * H} x1={0} x2={W} />
            </g>
          ))}
          {surfaces.map((obj, i) => {
            const m = mappingOf(obj);
            if (!m.enabled) return null;
            const color = SURFACE_COLORS[i % SURFACE_COLORS.length];
            const r = m.region;
            const isSel = obj.id === selected?.id;
            const x = r.x * W;
            const y = r.y * H;
            const w = r.width * W;
            const h = r.height * H;
            return (
              <g key={obj.id} opacity={isSel ? 1 : 0.6}>
                <rect
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={color}
                  fillOpacity={isSel ? 0.12 : 0.08}
                  stroke={color}
                  strokeWidth={isSel ? 2 : 1}
                  style={{ cursor: 'move' }}
                  onPointerDown={(e) => onPointerDown(e, obj, 'move')}
                />
                <text x={x + 5} y={y + 13} fill={color} fontSize={11} pointerEvents="none">
                  {obj.name}
                </text>
                {isSel
                  ? ([
                      ['nw', x, y],
                      ['ne', x + w, y],
                      ['sw', x, y + h],
                      ['se', x + w, y + h],
                    ] as [DragMode, number, number][]).map(([mode, hx, hy]) => (
                      <rect
                        key={mode}
                        x={hx - 5}
                        y={hy - 5}
                        width={10}
                        height={10}
                        fill="#fff"
                        stroke={color}
                        strokeWidth={2}
                        style={{ cursor: `${mode}-resize` }}
                        onPointerDown={(e) => onPointerDown(e, obj, mode)}
                      />
                    ))
                  : null}
              </g>
            );
          })}
          {mapping?.enabled && wire ? (
            <path d={wire} stroke="#e0e0e0" strokeOpacity={0.55} strokeWidth={0.6} fill="none" pointerEvents="none" />
          ) : null}
        </svg>
        <p className={styles.hint}>
          Drag a region to move it, corners to resize (Shift snaps to 5 %). The white wireframe is
          the selected surface&apos;s UV layout after flip / rotate / repeat.
        </p>
        <div className={styles.btnRow}>
          <button type="button" className={styles.btn} onClick={layoutSideBySide} disabled={surfaces.length === 0}>
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

      {selected && mapping ? (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{selected.name} — mapping</div>
          <label className={styles.check}>
            <input type="checkbox" checked={mapping.enabled} onChange={(e) => set({ enabled: e.target.checked })} data-testid="uv-enabled" />
            Use per-surface UV mapping
          </label>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Projection</span>
            <select value={mapping.projection} onChange={(e) => set({ projection: e.target.value as SurfaceUvProjection, enabled: true })}>
              <option value="meshUv">Mesh UV (from geometry)</option>
              <option value="planar">Planar (box-fit)</option>
              <option value="cylindrical">Cylindrical (arc-fit)</option>
              <option value="spherical">Spherical</option>
            </select>
          </div>
          <div className={styles.grid4}>
            <MiniNum label="Region X" value={mapping.region.x} onChange={(v) => set({ region: { ...mapping.region, x: v } })} />
            <MiniNum label="Region Y" value={mapping.region.y} onChange={(v) => set({ region: { ...mapping.region, y: v } })} />
            <MiniNum label="Width" value={mapping.region.width} onChange={(v) => set({ region: { ...mapping.region, width: v } })} />
            <MiniNum label="Height" value={mapping.region.height} onChange={(v) => set({ region: { ...mapping.region, height: v } })} />
          </div>
          <div className={styles.grid4} style={{ marginTop: 6 }}>
            <MiniNum label="Rotate °" value={mapping.rotationDeg} step={1} onChange={(v) => set({ rotationDeg: v })} />
            <MiniNum label="Repeat U" value={mapping.repeatU} step={0.1} onChange={(v) => set({ repeatU: v })} />
            <MiniNum label="Repeat V" value={mapping.repeatV} step={0.1} onChange={(v) => set({ repeatV: v })} />
            <label className={styles.mini}>
              Wrap
              <select
                value={mapping.wrap}
                onChange={(e) => set({ wrap: e.target.value as UvWrapMode })}
                style={{ font: 'inherit', background: '#2a2a2e', color: '#eee', border: '1px solid #3a3a40', borderRadius: 4, padding: '3px 2px' }}
              >
                <option value="clamp">Clamp</option>
                <option value="repeat">Repeat</option>
                <option value="mirror">Mirror</option>
              </select>
            </label>
          </div>
          <div className={styles.btnRow}>
            <label className={styles.check}>
              <input type="checkbox" checked={mapping.flipU} onChange={(e) => set({ flipU: e.target.checked })} /> Flip U
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={mapping.flipV} onChange={(e) => set({ flipV: e.target.checked })} /> Flip V
            </label>
            <button type="button" className={styles.btn} onClick={() => set({ rotationDeg: (mapping.rotationDeg + 90) % 360 })}>
              Rotate 90°
            </button>
            <button type="button" className={styles.btn} onClick={() => set({ region: { x: 0, y: 0, width: 1, height: 1 } })}>
              Full content
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Warp tab
// ---------------------------------------------------------------------------

function WarpTab() {
  const projectors = useAppStore((s) => s.projectors);
  const selectedProjectorId = useAppStore((s) => s.selectedProjectorId);
  const setSelectedProjector = useAppStore((s) => s.setSelectedProjector);
  const updateWarp = useAppStore((s) => s.updateProjectorWarp);
  const resetWarp = useAppStore((s) => s.resetProjectorWarp);
  const checkpoint = useAppStore((s) => s.pushSceneHistoryCheckpoint);
  const [message, setMessage] = useState<string | null>(null);

  const projector = projectors.find((p) => p.id === selectedProjectorId) ?? projectors[0];
  const warp = projector?.warp ?? DEFAULT_PROJECTOR_WARP;
  const aspect = projector?.optics.aspectRatio ?? 16 / 9;
  const W = 400;
  const H = Math.round(W / aspect);
  const pad = 40;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef<number | null>(null);

  if (!projector) return <div className={styles.section}><p className={styles.hint}>No projectors.</p></div>;

  const toSvg = (p: Vec2) => ({ x: p.x * W, y: (1 - p.y) * H });
  const valid = isValidWarpQuad(warp.corners);
  const m = squareToQuad(warp.corners);
  const gridLines: string[] = [];
  if (valid) {
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const seg = (a: Vec2, b: Vec2) => {
        const pa = applyMat3(m, a);
        const pb = applyMat3(m, b);
        if (!pa || !pb) return;
        const sa = toSvg(pa);
        const sb = toSvg(pb);
        gridLines.push(`M${sa.x},${sa.y}L${sb.x},${sb.y}`);
      };
      // Draw each grid line as several short segments so perspective stays exact.
      for (let k = 0; k < n; k++) {
        seg({ x: t, y: k / n }, { x: t, y: (k + 1) / n });
        seg({ x: k / n, y: t }, { x: (k + 1) / n, y: t });
      }
    }
  }

  const onDown = (e: ReactPointerEvent, idx: number) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    checkpoint();
    dragIdx.current = idx;
    if (!warp.enabled) updateWarp(projector.id, { enabled: true }, false);
  };
  const onMove = (e: ReactPointerEvent) => {
    const idx = dragIdx.current;
    const svg = svgRef.current;
    if (idx === null || !svg) return;
    const p = svgPoint(svg, e.clientX, e.clientY);
    let x = p.x / W;
    let y = 1 - p.y / H;
    if (e.shiftKey) {
      x = Math.round(x * 40) / 40;
      y = Math.round(y * 40) / 40;
    }
    x = Math.min(1.25, Math.max(-0.25, x));
    y = Math.min(1.25, Math.max(-0.25, y));
    const corners = warp.corners.map((c, i) => (i === idx ? { x, y } : { ...c })) as typeof warp.corners;
    updateWarp(projector.id, { corners, enabled: true }, false);
  };
  const onUp = () => {
    dragIdx.current = null;
  };

  const fitToTarget = () => {
    const pts = engine()?.projectTargetCornersToRaster(projector.id);
    const fit = pts ? fitWarpToRasterPoints(pts) : null;
    if (!fit) {
      setMessage('Could not fit: the calculation target is not fully in front of this projector.');
      return;
    }
    updateWarp(projector.id, fit);
    const clipped = pts!.some((p) => p && (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1));
    setMessage(
      clipped
        ? 'Fitted, but the target extends beyond the raster — corners were clamped to the raster edge.'
        : 'Image corners pinned to the calculation target corners.',
    );
  };

  const labels = ['Bottom-left', 'Bottom-right', 'Top-right', 'Top-left'];
  const quadPath = warp.corners.map((c, i) => `${i === 0 ? 'M' : 'L'}${toSvg(c).x},${toSvg(c).y}`).join('') + 'Z';

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Projector</div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Output</span>
          <select value={projector.id} onChange={(e) => setSelectedProjector(e.target.value)}>
            {projectors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.optics.resolution.width}×{p.optics.resolution.height}
              </option>
            ))}
          </select>
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={warp.enabled}
            onChange={(e) => updateWarp(projector.id, { enabled: e.target.checked })}
            data-testid="warp-enabled"
          />
          Corner-pin warp enabled
        </label>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Corner pin — physical raster</div>
        <svg
          ref={svgRef}
          className={styles.editor}
          viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          data-testid="warp-editor"
        >
          <rect x={0} y={0} width={W} height={H} fill="#0e0e10" stroke="#666" strokeDasharray="5 4" />
          <path d={quadPath} fill={projector.color} fillOpacity={warp.enabled ? 0.14 : 0.05} stroke={projector.color} strokeWidth={2} />
          <path d={gridLines.join('')} stroke={projector.color} strokeOpacity={0.45} strokeWidth={0.8} fill="none" />
          {warp.corners.map((c, i) => {
            const p = toSvg(c);
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={8} fill="#fff" stroke={projector.color} strokeWidth={3} style={{ cursor: 'grab' }} onPointerDown={(e) => onDown(e, i)} />
                <text x={p.x + 11} y={p.y - 9} fill="#bbb" fontSize={10} pointerEvents="none">
                  {labels[i]}
                </text>
              </g>
            );
          })}
        </svg>
        {!valid ? <p className={styles.warn}>Quad is not convex — warp is ignored until corners are fixed.</p> : null}
        <p className={styles.hint}>
          The dashed box is the projector&apos;s full raster; the coloured quad is where the image is
          placed inside it. Light outside the quad is black. Blend weights follow the warped edge.
        </p>
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={fitToTarget} data-testid="warp-fit">
            Fit to calculation target
          </button>
          <button type="button" className={styles.btn} onClick={() => resetWarp(projector.id)}>
            Reset
          </button>
        </div>
        {message ? <p className={styles.hint}>{message}</p> : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Corners (raster UV, 0–1, bottom-left origin)</div>
        <div className={styles.grid2}>
          {warp.corners.map((c, i) => (
            <div key={i} className={styles.grid2}>
              <MiniNum
                label={`${labels[i]} X`}
                value={c.x}
                onChange={(v) =>
                  updateWarp(projector.id, {
                    enabled: true,
                    corners: warp.corners.map((cc, j) => (j === i ? { ...cc, x: v } : cc)) as typeof warp.corners,
                  })
                }
              />
              <MiniNum
                label="Y"
                value={c.y}
                onChange={(v) =>
                  updateWarp(projector.id, {
                    enabled: true,
                    corners: warp.corners.map((cc, j) => (j === i ? { ...cc, y: v } : cc)) as typeof warp.corners,
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}


// ---------------------------------------------------------------------------
// Outputs tab — full-screen projector outputs on other displays
// ---------------------------------------------------------------------------

interface RowState {
  displayKey: string;
  content: OutputContent;
  scale: 1 | 0.5;
}

const WINDOW_KEY = '__window__';

function OutputsTab() {
  const projectors = useAppStore((s) => s.projectors);
  useSyncExternalStore(outputWindows.subscribe, outputWindows.getVersion);
  const open = outputWindows.list();
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const supported = windowManagementSupported();

  const rowFor = (id: string): RowState => rows[id] ?? { displayKey: WINDOW_KEY, content: 'feed', scale: 1 };
  const setRow = (id: string, patch: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...rowFor(id), ...patch } }));

  const detect = async () => {
    setStatus('Detecting displays…');
    const q = await queryDisplays();
    setDisplays(q.granted ? q.displays : []);
    if (!q.supported) {
      setStatus('This browser cannot list displays. Outputs open as windows — drag each to its projector display and press F.');
    } else if (!q.granted) {
      setStatus(q.error);
    } else {
      setStatus(`${q.displays.length} display${q.displays.length === 1 ? '' : 's'} found.`);
      // Pre-assign projectors to non-primary displays in order.
      const external = q.displays.filter((d) => !d.isPrimary);
      setRows((r) => {
        const next = { ...r };
        projectors.forEach((p, i) => {
          const d = external[i];
          if (d && !next[p.id]) next[p.id] = { displayKey: d.key, content: 'feed', scale: 1 };
        });
        return next;
      });
    }
  };

  const openFor = (projectorId: string): boolean => {
    const p = projectors.find((x) => x.id === projectorId);
    if (!p) return false;
    const row = rowFor(projectorId);
    const display = displays.find((d) => d.key === row.displayKey) ?? null;
    const config: OutputConfig = { projectorId, content: row.content, scale: row.scale, identify: false };
    const entry = outputWindows.open(config, display, p.name);
    setStatus(
      entry
        ? display
          ? `Opened ${p.name} on ${display.label}. If it is not full screen yet, click inside it or press F.`
          : `Opened ${p.name} in a window — drag it to the projector display and press F for full screen.`
        : 'The browser blocked the output window. Allow pop-ups for this site and try again.',
    );
    return entry !== null;
  };

  const openAll = () => {
    const todo = projectors.filter((x) => x.enabled && !open.some((o) => o.config.projectorId === x.id));
    let opened = 0;
    for (const p of todo) if (openFor(p.id)) opened++;
    if (todo.length > 1) {
      setStatus(
        opened === todo.length
          ? `Opened ${opened} outputs.`
          : `The browser allowed ${opened} of ${todo.length} windows from one click. Allow pop-ups for this site (address bar) or use each projector's Open output button.`,
      );
    }
  };

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Displays</div>
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void detect()} data-testid="detect-displays">
            Detect displays
          </button>
          <button type="button" className={styles.btn} onClick={openAll} disabled={projectors.every((p) => !p.enabled)}>
            Open all outputs
          </button>
          <button type="button" className={styles.btn} onClick={() => outputWindows.closeAll()} disabled={open.length === 0}>
            Close all
          </button>
        </div>
        {displays.length > 0 ? (
          <div className={styles.surfaceList} style={{ marginTop: 8 }}>
            {displays.map((d, i) => (
              <div key={d.key} className={styles.surfaceItem} style={{ cursor: 'default' }}>
                <b>{i + 1}</b> {d.label}
                <span className={styles.surfaceMeta}>
                  {d.width}×{d.height}
                  {d.devicePixelRatio !== 1 ? ` @${d.devicePixelRatio}x` : ''}
                  {d.isPrimary ? ' · main' : ''}
                  {d.isInternal ? ' · built-in' : ''}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        {status ? <p className={styles.hint}>{status}</p> : null}
        {!supported ? (
          <p className={styles.warn}>
            Picking a display by name needs Chrome or Edge. In this browser, outputs open as windows you
            drag onto the projector display.
          </p>
        ) : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Projector outputs</div>
        {projectors.map((p) => {
          const row = rowFor(p.id);
          const live = open.filter((o) => o.config.projectorId === p.id);
          return (
            <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid #2a2a2e' }}>
              <div className={styles.row}>
                <i className={styles.swatch} style={{ background: p.color }} />
                <b style={{ flex: 1 }}>
                  {p.name}
                  <span style={{ color: '#888', fontWeight: 400 }}>
                    {' '}
                    — {p.optics.resolution.width}×{p.optics.resolution.height}
                    {p.enabled ? '' : ' (disabled)'}
                  </span>
                </b>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Display</span>
                <select value={row.displayKey} onChange={(e) => setRow(p.id, { displayKey: e.target.value })}>
                  <option value={WINDOW_KEY}>Window (drag to a display)</option>
                  {displays.map((d, i) => (
                    <option key={d.key} value={d.key}>
                      {i + 1}: {d.label} — {d.width}×{d.height}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.row}>
                <span className={styles.rowLabel}>Send</span>
                <select
                  value={row.content}
                  onChange={(e) => {
                    const content = e.target.value as OutputContent;
                    setRow(p.id, { content });
                    live.forEach((o) => outputWindows.update(o.id, { content }));
                  }}
                >
                  <option value="feed">Projector feed (mapped + blended)</option>
                  <option value="mask">Blend mask only</option>
                  <option value="grid">Alignment grid</option>
                </select>
                <select
                  value={String(row.scale)}
                  style={{ flex: '0 0 92px' }}
                  onChange={(e) => {
                    const scale = (e.target.value === '0.5' ? 0.5 : 1) as 1 | 0.5;
                    setRow(p.id, { scale });
                    live.forEach((o) => outputWindows.update(o.id, { scale }));
                  }}
                >
                  <option value="1">Native</option>
                  <option value="0.5">Half res</option>
                </select>
              </div>
              <div className={styles.btnRow}>
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => openFor(p.id)} data-testid={`open-output-${p.id}`}>
                  {live.length ? 'Open another' : 'Open output'}
                </button>
                {live.map((o) => (
                  <span key={o.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <span className={styles.hint} style={{ margin: 0 }}>
                      ● live on {o.display?.label ?? 'window'}
                      {o.frameSize ? ` · ${o.frameSize.width}×${o.frameSize.height}` : ''}
                      {o.config.content !== 'grid' ? ` · ${o.fps} fps` : ''}
                    </span>
                    <label className={styles.check} style={{ margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={o.config.identify}
                        onChange={(e) => outputWindows.update(o.id, { identify: e.target.checked })}
                      />
                      Identify
                    </label>
                    <button type="button" className={styles.btn} onClick={() => outputWindows.focus(o.id)}>
                      Show
                    </button>
                    <button type="button" className={styles.btn} onClick={() => outputWindows.close(o.id)}>
                      Close
                    </button>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        <p className={styles.hint}>
          Each output shows exactly what that projector would receive: surface UV mapping, corner-pin
          warp and the blend mask, at the projector&apos;s native resolution. Set your displays to
          <b> extended</b> (not mirrored) and match each display&apos;s resolution to its projector.
          In an output window: <b>F</b> / double-click = full screen, <b>Esc</b> = exit, <b>I</b> = info
          overlay.
        </p>
      </div>
    </>
  );
}

export function StudioPanel() {
  const deviceProfile = useDeviceProfile();
  const compact = isCompactLayout(deviceProfile);
  const visible = useAppStore((s) => s.uvEditorPanelVisible);
  const toggle = useAppStore((s) => s.toggleUvEditorPanel);
  const tab = useAppStore((s) => s.studioTab);
  const setTab = useAppStore((s) => s.setStudioTab);
  if (!visible) return null;
  return (
    <div className={compact ? styles.compactShell : styles.shell} data-testid="studio-panel">
      <div className={styles.panel}>
        <div className={styles.header}>
          <span className={styles.title}>Mapping &amp; Blend Studio</span>
          <button type="button" className={styles.closeBtn} onClick={toggle} title="Close">
            ×
          </button>
        </div>
        <div className={styles.tabs}>
          {(
            [
              ['blend', 'Edge Blend'],
              ['uv', 'UV Mapping'],
              ['warp', 'Warp'],
              ['outputs', 'Outputs'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
              onClick={() => setTab(id)}
              data-testid={`studio-tab-${id}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className={styles.body}>
          {tab === 'blend' ? <BlendTab /> : tab === 'uv' ? <UvTab /> : tab === 'warp' ? <WarpTab /> : <OutputsTab />}
        </div>
      </div>
    </div>
  );
}
