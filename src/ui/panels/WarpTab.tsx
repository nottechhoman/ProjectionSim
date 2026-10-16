import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useAppStore } from '../../store';
import type { CornerPinWarp, GridInterpolation, GridWarp, ProjectorConfig, Vec2, WarpMode } from '../../types';
import { DEFAULT_PROJECTOR_WARP, IDENTITY_WARP_CORNERS } from '../../types';
import { MiniNum, svgPoint } from './studioControls';
import { applyMat3, fitWarpToRasterPoints, isValidWarpQuad, squareToQuad } from '../../warp/homography';
import {
  colIndices,
  createGridWarp,
  gridFromPoints,
  gridLinePolylines,
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  movePoints,
  resampleGrid,
  resetPoint,
  rowIndices,
  setPoint,
} from '../../warp/gridWarp';
import { parseWarpJson, projectorFolders, WARP_EXPORT_README, warpExportEntries } from '../../warp/warpFile';
import { createZip, type ZipEntry } from '../../utils/zip';
import type { SceneEngine } from '../../scene/SceneEngine';
import styles from './StudioPanel.module.css';

function engine(): SceneEngine | undefined {
  return (window as Window & { __projectionLabEngine?: SceneEngine }).__projectionLabEngine;
}

const GRID_TOOLTIP =
  'Grid warp is 2D output space only: it reshapes the picture inside the projector raster. ' +
  'It does not change the 3D optics or the brightness / pixel-density calculations.';

/** Editor geometry: raster drawn W × H inside a padded viewBox. */
const W = 400;
const PAD = 40;
/** Touch-friendly hit target (CSS pixels, diameter). */
const HIT_PX = 44;

function useUnitsPerPx(svgRef: React.RefObject<SVGSVGElement | null>, viewBoxWidth: number): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => setScale(svg.clientWidth > 0 ? viewBoxWidth / svg.clientWidth : 1);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [svgRef, viewBoxWidth]);
  return scale;
}

function slug(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'projector';
}

function downloadBytes(bytes: Uint8Array, filename: string, type: string): void {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function maskPng(projectorId: string): Promise<Uint8Array | null> {
  const canvas = engine()?.renderProjectorFeed(projectorId, 'mask');
  if (!canvas) return null;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

// ---------------------------------------------------------------------------

export function WarpTab() {
  const projectors = useAppStore((s) => s.projectors);
  const selectedProjectorId = useAppStore((s) => s.selectedProjectorId);
  const setSelectedProjector = useAppStore((s) => s.setSelectedProjector);
  const updateWarp = useAppStore((s) => s.updateProjectorWarp);

  const projector = projectors.find((p) => p.id === selectedProjectorId) ?? projectors[0];
  if (!projector) return <div className={styles.section}><p className={styles.hint}>No projectors.</p></div>;
  const warp = projector.warp ?? DEFAULT_PROJECTOR_WARP;

  const modes: { id: WarpMode; label: string; title?: string }[] = [
    { id: 'none', label: 'None' },
    { id: 'cornerPin', label: 'Corner-pin' },
    { id: 'grid', label: 'Grid', title: GRID_TOOLTIP },
  ];

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
        <div className={styles.row}>
          <span className={styles.rowLabel}>Warp</span>
          <div className={styles.seg} role="radiogroup" aria-label="Warp mode">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={warp.mode === m.id}
                className={warp.mode === m.id ? styles.segOn : undefined}
                title={m.title}
                onClick={() => warp.mode !== m.id && updateWarp(projector.id, { mode: m.id })}
                data-testid={`warp-mode-${m.id}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {warp.mode === 'none' ? (
          <p className={styles.hint}>No warp: the projector shows its feed unchanged. Settings of the other modes are kept.</p>
        ) : null}
      </div>
      {warp.mode === 'cornerPin' ? <CornerPinEditor projector={projector} pin={warp.cornerPin} /> : null}
      {warp.mode === 'grid' ? <GridEditor projector={projector} grid={warp.grid} /> : null}
      <WarpFiles projector={projector} projectors={projectors} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Corner pin
// ---------------------------------------------------------------------------

function CornerPinEditor({ projector, pin }: { projector: ProjectorConfig; pin: CornerPinWarp }) {
  const updateWarp = useAppStore((s) => s.updateProjectorWarp);
  const checkpoint = useAppStore((s) => s.pushSceneHistoryCheckpoint);
  const [message, setMessage] = useState<string | null>(null);
  const aspect = projector.optics.aspectRatio || 16 / 9;
  const H = Math.round(W / aspect);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIdx = useRef<number | null>(null);
  const unitsPerPx = useUnitsPerPx(svgRef, W + PAD * 2);

  const setCorners = (corners: CornerPinWarp['corners'], record = true) =>
    updateWarp(projector.id, { cornerPin: { corners } }, record);

  const toSvg = (p: Vec2) => ({ x: p.x * W, y: (1 - p.y) * H });
  const valid = isValidWarpQuad(pin.corners);
  const m = squareToQuad(pin.corners);
  const gridLines: string[] = [];
  if (valid) {
    const n = 8;
    const seg = (a: Vec2, b: Vec2) => {
      const pa = applyMat3(m, a);
      const pb = applyMat3(m, b);
      if (!pa || !pb) return;
      const sa = toSvg(pa);
      const sb = toSvg(pb);
      gridLines.push(`M${sa.x},${sa.y}L${sb.x},${sb.y}`);
    };
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Short segments so perspective stays exact.
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
    setCorners(pin.corners.map((c, i) => (i === idx ? { x, y } : { ...c })) as CornerPinWarp['corners'], false);
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
    setCorners(fit.corners);
    const clipped = pts!.some((p) => p && (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1));
    setMessage(
      clipped
        ? 'Fitted, but the target extends beyond the raster — corners were clamped to the raster edge.'
        : 'Image corners pinned to the calculation target corners.',
    );
  };

  const labels = ['Bottom-left', 'Bottom-right', 'Top-right', 'Top-left'];
  const quadPath = pin.corners.map((c, i) => `${i === 0 ? 'M' : 'L'}${toSvg(c).x},${toSvg(c).y}`).join('') + 'Z';
  const hitR = (HIT_PX / 2) * unitsPerPx;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Corner pin — physical raster</div>
        <svg
          ref={svgRef}
          className={styles.editor}
          viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          data-testid="warp-editor"
        >
          <rect x={0} y={0} width={W} height={H} fill="#0e0e10" stroke="#666" strokeDasharray="5 4" />
          <path d={quadPath} fill={projector.color} fillOpacity={0.14} stroke={projector.color} strokeWidth={2} />
          <path d={gridLines.join('')} stroke={projector.color} strokeOpacity={0.45} strokeWidth={0.8} fill="none" />
          {pin.corners.map((c, i) => {
            const p = toSvg(c);
            return (
              <g key={i} onPointerDown={(e) => onDown(e, i)} style={{ cursor: 'grab' }}>
                <circle cx={p.x} cy={p.y} r={hitR} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={8} fill="#fff" stroke={projector.color} strokeWidth={3} />
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
          <button type="button" className={styles.btn} onClick={() => setCorners(structuredClone(IDENTITY_WARP_CORNERS))} data-testid="warp-corner-reset">
            Reset
          </button>
        </div>
        {message ? <p className={styles.hint}>{message}</p> : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Corners (raster UV, 0–1, bottom-left origin)</div>
        <div className={styles.grid2}>
          {pin.corners.map((c, i) => (
            <div key={i} className={styles.grid2}>
              <MiniNum
                label={`${labels[i]} X`}
                value={c.x}
                onChange={(v) => setCorners(pin.corners.map((cc, j) => (j === i ? { ...cc, x: v } : cc)) as CornerPinWarp['corners'])}
              />
              <MiniNum
                label="Y"
                value={c.y}
                onChange={(v) => setCorners(pin.corners.map((cc, j) => (j === i ? { ...cc, y: v } : cc)) as CornerPinWarp['corners'])}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

interface GridDrag {
  index: number;
  start: GridWarp;
  pointer: Vec2;
  /** Shift-drag: move the point's whole row or column (decided by the first movement). */
  line: boolean;
  axis: 'row' | 'col' | null;
}

function GridEditor({ projector, grid }: { projector: ProjectorConfig; grid: GridWarp }) {
  const updateWarp = useAppStore((s) => s.updateProjectorWarp);
  const checkpoint = useAppStore((s) => s.pushSceneHistoryCheckpoint);
  const revision = useAppStore((s) => s.rasterPreviewRevision);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const aspect = projector.optics.aspectRatio || 16 / 9;
  const H = Math.round(W / aspect);
  const svgRef = useRef<SVGSVGElement>(null);
  const bgRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<GridDrag | null>(null);
  const unitsPerPx = useUnitsPerPx(svgRef, W + PAD * 2);
  const { width: resW, height: resH } = projector.optics.resolution;
  const sel = selected !== null && selected < grid.points.length ? selected : null;

  // Live output behind the grid (the projector's warped feed preview).
  useEffect(() => {
    const src = engine()?.getRasterPreviewCanvas(projector.id);
    const dst = bgRef.current;
    if (!dst) return;
    const ctx = dst.getContext('2d');
    if (!ctx) return;
    if (!src || src.width === 0) {
      ctx.clearRect(0, 0, dst.width, dst.height);
      return;
    }
    if (dst.width !== src.width || dst.height !== src.height) {
      dst.width = src.width;
      dst.height = src.height;
    }
    ctx.drawImage(src, 0, 0);
  }, [projector.id, revision]);

  const setGrid = (next: GridWarp, record = true) => updateWarp(projector.id, { grid: next }, record);

  const toSvg = (p: Vec2) => ({ x: p.x * W, y: (1 - p.y) * H });
  const toUv = (clientX: number, clientY: number): Vec2 | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const p = svgPoint(svg, clientX, clientY);
    return { x: p.x / W, y: 1 - p.y / H };
  };

  const onDown = (e: ReactPointerEvent, index: number) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    svgRef.current?.focus();
    const pointer = toUv(e.clientX, e.clientY);
    if (!pointer) return;
    checkpoint();
    setSelected(index);
    drag.current = { index, start: grid, pointer, line: e.shiftKey, axis: null };
  };
  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toUv(e.clientX, e.clientY);
    if (!p) return;
    const dx = p.x - d.pointer.x;
    const dy = p.y - d.pointer.y;
    if (d.line) {
      if (!d.axis) {
        // Wait for a clear direction (3 CSS px) before choosing row or column.
        const px = Math.hypot(dx * W, dy * H) / Math.max(unitsPerPx, 1e-6);
        if (px < 3) return;
        d.axis = Math.abs(dx * aspect) >= Math.abs(dy) ? 'row' : 'col';
      }
      const r = Math.floor(d.index / d.start.cols);
      const c = d.index % d.start.cols;
      const indices = d.axis === 'row' ? rowIndices(d.start, r) : colIndices(d.start, c);
      setGrid(movePoints(d.start, indices, dx, dy), false);
      return;
    }
    const s = d.start.points[d.index];
    setGrid(setPoint(d.start, d.index, { x: s.x + dx, y: s.y + dy }), false);
  };
  const onUp = () => {
    drag.current = null;
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (sel === null) return;
    const step = e.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step / resW;
    else if (e.key === 'ArrowRight') dx = step / resW;
    else if (e.key === 'ArrowUp') dy = step / resH;
    else if (e.key === 'ArrowDown') dy = -step / resH;
    else return;
    e.preventDefault();
    e.stopPropagation();
    setGrid(movePoints(grid, [sel], dx, dy));
  };

  const setSize = (cols: number, rows: number) => {
    if (cols === grid.cols && rows === grid.rows) return;
    setGrid(resampleGrid(grid, cols, rows));
    setSelected(null);
  };

  const fitToTarget = () => {
    const pts = engine()?.projectTargetGridToRaster(projector.id, grid.cols, grid.rows);
    const fit = pts ? gridFromPoints(grid.cols, grid.rows, pts, grid.interpolation) : null;
    if (!fit) {
      setMessage('Could not fit: the calculation target is not fully in front of this projector.');
      return;
    }
    setGrid(fit);
    const clipped = fit.points.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1);
    setMessage(
      clipped
        ? 'Fitted, but part of the target is outside the raster — that part of the image will be cut off.'
        : `Grid points placed on the calculation target (${grid.cols}×${grid.rows}).`,
    );
  };

  const lines = gridLinePolylines(grid)
    .map((line) => line.map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * W).toFixed(2)},${((1 - p.y) * H).toFixed(2)}`).join(''))
    .join('');
  const hitR = (HIT_PX / 2) * unitsPerPx;
  const dotR = 5 * Math.max(1, unitsPerPx * 0.8);
  const selPoint = sel !== null ? grid.points[sel] : null;
  const vbW = W + PAD * 2;
  const vbH = H + PAD * 2;

  return (
    <>
      <div className={styles.section}>
        <div className={styles.sectionTitle} title={GRID_TOOLTIP}>
          Grid warp — physical raster <span aria-hidden="true">ⓘ</span>
        </div>
        <div style={{ position: 'relative' }}>
          <canvas
            ref={bgRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `${(PAD / vbW) * 100}%`,
              top: `${(PAD / vbH) * 100}%`,
              width: `${(W / vbW) * 100}%`,
              height: `${(H / vbH) * 100}%`,
              opacity: 0.85,
              pointerEvents: 'none',
            }}
          />
          <svg
            ref={svgRef}
            className={styles.editor}
            style={{ position: 'relative', background: 'transparent', display: 'block' }}
            viewBox={`${-PAD} ${-PAD} ${vbW} ${vbH}`}
            tabIndex={0}
            onKeyDown={onKeyDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerDown={() => setSelected(null)}
            data-testid="warp-grid-editor"
          >
            <rect x={0} y={0} width={W} height={H} fill="none" stroke="#666" strokeDasharray="5 4" />
            <path d={lines} stroke="#ffd23c" strokeOpacity={0.9} strokeWidth={1.2 * Math.max(1, unitsPerPx * 0.6)} fill="none" />
            {grid.points.map((pt, i) => {
              const p = toSvg(pt);
              const on = i === sel;
              return (
                <g key={i} onPointerDown={(e) => onDown(e, i)} style={{ cursor: 'grab' }} data-testid={`warp-grid-point-${i}`}>
                  <circle cx={p.x} cy={p.y} r={hitR} fill="transparent" />
                  <circle cx={p.x} cy={p.y} r={on ? dotR * 1.4 : dotR} fill={on ? '#ffd23c' : '#fff'} stroke="#000" strokeWidth={1} />
                </g>
              );
            })}
          </svg>
        </div>
        <p className={styles.hint}>
          Drag a point; Shift-drag moves its whole row or column. Arrow keys nudge the selected point
          1 px (Shift: 10 px). The yellow lines are where the unwarped image grid lands in the raster.
          2D output only — the 3D optics and brightness / pixel-density calculations are unchanged.
        </p>
        <div className={styles.grid2}>
          <MiniNumInt label="Columns" value={grid.cols} onCommit={(v) => setSize(v, grid.rows)} testId="warp-grid-cols" />
          <MiniNumInt label="Rows" value={grid.rows} onCommit={(v) => setSize(grid.cols, v)} testId="warp-grid-rows" />
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Curve</span>
          <select
            value={grid.interpolation}
            onChange={(e) => setGrid({ ...grid, interpolation: e.target.value as GridInterpolation })}
            data-testid="warp-grid-interp"
          >
            <option value="bezier">Smooth (Catmull-Rom)</option>
            <option value="linear">Linear</option>
          </select>
        </div>
        <div className={styles.btnRow}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={fitToTarget} data-testid="warp-grid-fit">
            Fit to calculation target
          </button>
          <button
            type="button"
            className={styles.btn}
            onClick={() => setGrid(createGridWarp(grid.cols, grid.rows, grid.interpolation))}
            data-testid="warp-grid-reset"
          >
            Reset grid
          </button>
        </div>
        {message ? <p className={styles.hint}>{message}</p> : null}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>
          Selected point{sel !== null ? ` — row ${Math.floor(sel / grid.cols)}, column ${sel % grid.cols}` : ''}
        </div>
        {selPoint && sel !== null ? (
          <>
            <div className={styles.grid2}>
              <MiniNum label="X (0–1)" value={selPoint.x} step={0.001} onChange={(v) => setGrid(setPoint(grid, sel, { ...selPoint, x: v }))} />
              <MiniNum label="Y (0–1)" value={selPoint.y} step={0.001} onChange={(v) => setGrid(setPoint(grid, sel, { ...selPoint, y: v }))} />
            </div>
            <p className={styles.hint}>
              {Math.round(selPoint.x * resW * 10) / 10} px, {Math.round(selPoint.y * resH * 10) / 10} px from the bottom-left corner.
            </p>
            <div className={styles.btnRow}>
              <button type="button" className={styles.btn} onClick={() => setGrid(resetPoint(grid, sel))} data-testid="warp-point-reset">
                Reset selected point
              </button>
            </div>
          </>
        ) : (
          <p className={styles.hint}>Click a grid point to select it.</p>
        )}
      </div>
    </>
  );
}

/** Integer input that commits on blur / Enter (resampling on every keystroke would be jumpy). */
function MiniNumInt({ label, value, onCommit, testId }: { label: string; value: number; onCommit: (v: number) => void; testId: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const v = Math.round(Number(draft));
    if (!Number.isFinite(v)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, v));
    setDraft(String(clamped));
    onCommit(clamped);
  };
  return (
    <label className={styles.mini}>
      {label}
      <input
        type="number"
        min={MIN_GRID_SIZE}
        max={MAX_GRID_SIZE}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        data-testid={testId}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

function WarpFiles({ projector, projectors }: { projector: ProjectorConfig; projectors: ProjectorConfig[] }) {
  const updateWarp = useAppStore((s) => s.updateProjectorWarp);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportOne = async () => {
    setBusy(true);
    try {
      const entries: ZipEntry[] = [
        ...warpExportEntries(projector, await maskPng(projector.id)),
        { name: 'README.txt', data: WARP_EXPORT_README },
      ];
      downloadBytes(createZip(entries), `${slug(projector.name)}-warp.zip`, 'application/zip');
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      const folders = projectorFolders(projectors);
      const entries: ZipEntry[] = [];
      for (let i = 0; i < projectors.length; i++) {
        entries.push(...warpExportEntries(projectors[i], await maskPng(projectors[i].id), folders[i]));
      }
      entries.push({ name: 'README.txt', data: WARP_EXPORT_README });
      downloadBytes(createZip(entries), 'all-projectors-warp.zip', 'application/zip');
    } finally {
      setBusy(false);
    }
  };

  const importJson = async (file: File) => {
    try {
      const { warp, projectorName } = parseWarpJson(await file.text());
      updateWarp(projector.id, warp);
      setMessage(
        `Imported ${warp.mode === 'grid' ? `${warp.grid.cols}×${warp.grid.rows} grid` : warp.mode === 'cornerPin' ? 'corner pin' : 'no-warp'} settings${projectorName ? ` from “${projectorName}”` : ''} into ${projector.name}.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not read the warp file.');
    }
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>Export / import</div>
      <p className={styles.hint}>
        Zip with the warp mesh (OBJ), control points (CSV), blend mask (PNG), our warp JSON and a
        README on axes. Import accepts our warp JSON only.
      </p>
      <div className={styles.btnRow}>
        <button type="button" className={styles.btn} disabled={busy} onClick={() => void exportOne()} data-testid="warp-export">
          Export {projector.name}
        </button>
        <button type="button" className={styles.btn} disabled={busy} onClick={() => void exportAll()} data-testid="warp-export-all">
          Export all projectors
        </button>
        <button type="button" className={styles.btn} onClick={() => fileRef.current?.click()}>
          Import warp JSON…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          data-testid="warp-import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void importJson(f);
          }}
        />
      </div>
      {message ? <p className={styles.hint}>{message}</p> : null}
    </div>
  );
}
