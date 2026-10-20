import { APP_NAME } from '../branding/appName';
import type { ContentTemplate } from './contentTemplate';

/** Drawing options for the template PNG. */
export interface TemplateDrawOptions {
  grid: boolean;
  labels: boolean;
  blendZones: boolean;
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateDrawOptions = { grid: true, labels: true, blendZones: true };

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Grid spacing in canvas pixels: 100 px up to 4K wide, 200 px above. */
export function templateGridStep(width: number, height: number): number {
  return Math.max(width, height) > 4096 ? 200 : 100;
}

/**
 * Draw the template at the mapping canvas resolution (1 template pixel = 1 canvas
 * pixel): screens filled in their colour with a bright outline, blend zones hatched,
 * a pixel grid, and a label per screen.
 */
export function drawContentTemplate(t: ContentTemplate, opts: TemplateDrawOptions = DEFAULT_TEMPLATE_OPTIONS): HTMLCanvasElement {
  const { width: W, height: H, owner, projectorCount } = t;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const fills = t.screens.map((s) => hexRgb(s.color));
  const line = Math.max(1, Math.round(Math.min(W, H) / 1080));
  const hatch = Math.max(8, Math.round(Math.min(W, H) / 60));
  const hatchWidth = Math.max(1, Math.round(hatch / 5));

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      const o = owner[k];
      const p = k * 4;
      d[p + 3] = 255;
      if (!o) {
        d[p] = 12;
        d[p + 1] = 12;
        d[p + 2] = 14;
        continue;
      }
      const [r, g, b] = fills[o - 1];
      // Edge: any neighbour within `line` pixels belongs to another screen (or the canvas border).
      let edge = false;
      for (let dy = -line; dy <= line && !edge; dy++) {
        for (let dx = -line; dx <= line && !edge; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (owner[ny * W + nx] !== o) edge = true;
        }
      }
      if (edge) {
        d[p] = r;
        d[p + 1] = g;
        d[p + 2] = b;
        continue;
      }
      let f = 0.28;
      const n = projectorCount[k];
      if (opts.blendZones && n >= 2) {
        const onA = (x + y) % hatch < hatchWidth;
        const onB = n >= 3 && ((x - y) % hatch + hatch) % hatch < hatchWidth;
        f = onA || onB ? 0.85 : 0.42;
      }
      d[p] = Math.round(r * f);
      d[p + 1] = Math.round(g * f);
      d[p + 2] = Math.round(b * f);
    }
  }
  ctx.putImageData(img, 0, 0);

  const unit = Math.max(10, Math.round(Math.min(Math.max(W, H) / 80, Math.min(W, H) / 12)));
  if (opts.grid) drawGrid(ctx, W, H, unit);
  if (opts.labels) {
    for (const s of t.screens) {
      if (!s.bbox) continue;
      drawScreenLabel(ctx, s, unit, opts.blendZones);
    }
    drawTitle(ctx, t, unit, opts.blendZones);
  }
  return canvas;
}

function drawGrid(ctx: CanvasRenderingContext2D, W: number, H: number, unit: number): void {
  const step = templateGridStep(W, H);
  ctx.save();
  for (let x = step; x < W; x += step) {
    const major = x % (step * 5) === 0;
    ctx.fillStyle = major ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, 0, 1, H);
  }
  for (let y = step; y < H; y += step) {
    const major = y % (step * 5) === 0;
    ctx.fillStyle = major ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, y, W, 1);
  }
  // Canvas centre cross.
  const c = Math.round(unit * 1.5);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(Math.floor(W / 2) - c, Math.floor(H / 2), c * 2, 1);
  ctx.fillRect(Math.floor(W / 2), Math.floor(H / 2) - c, 1, c * 2);
  // Pixel numbers along the top and left on major lines.
  ctx.font = `${Math.round(unit * 0.6)}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.textBaseline = 'top';
  for (let x = step * 5; x < W; x += step * 5) ctx.fillText(String(x), x + 3, 3);
  for (let y = step * 5; y < H; y += step * 5) ctx.fillText(String(y), 3, y + 3);
  ctx.restore();
}

function drawScreenLabel(
  ctx: CanvasRenderingContext2D,
  s: ContentTemplate['screens'][number],
  unit: number,
  blendZones: boolean,
): void {
  const b = s.bbox!;
  const size = Math.max(9, Math.min(unit, Math.round(b.h / 7), Math.round(b.w / 14)));
  const lines = [
    { text: s.name, bold: true },
    { text: `${b.w} × ${b.h} px at ${b.x}, ${b.y}`, bold: false },
    { text: s.physical, bold: false },
  ];
  if (blendZones && s.blendPixels > 0) lines.push({ text: `blend zone ${Math.round((100 * s.blendPixels) / s.pixels)} %`, bold: false });
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = b.x + b.w / 2;
  const total = lines.length * size * 1.3;
  let y = b.y + b.h / 2 - total / 2 + size * 0.65;
  for (const l of lines) {
    ctx.font = `${l.bold ? '600 ' : ''}${Math.round(l.bold ? size * 1.15 : size * 0.85)}px system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, size / 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(l.text, cx, y);
    ctx.fillStyle = l.bold ? s.color : '#f2f2f2';
    ctx.fillText(l.text, cx, y);
    y += size * 1.3;
  }
  ctx.restore();
}

function drawTitle(ctx: CanvasRenderingContext2D, t: ContentTemplate, unit: number, blendZones: boolean): void {
  const size = Math.round(unit * 0.7);
  const text = [
    `${t.mappingName} · ${t.kindLabel} · ${t.width} × ${t.height} px`,
    blendZones && t.projectorsChecked >= 2 ? 'Hatched = blend zone (2+ projectors overlap)' : null,
    `${APP_NAME} content template`,
  ].filter((s): s is string => !!s);
  ctx.save();
  ctx.font = `${size}px system-ui, sans-serif`;
  const w = Math.max(...text.map((s) => ctx.measureText(s).width)) + size;
  const h = text.length * size * 1.35 + size * 0.5;
  const x = size * 0.5;
  const y = t.height - h - size * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e8e8e8';
  ctx.textBaseline = 'top';
  text.forEach((s, i) => ctx.fillText(s, x + size * 0.5, y + size * 0.4 + i * size * 1.35));
  ctx.restore();
}
