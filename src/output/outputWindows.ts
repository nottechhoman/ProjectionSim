/**
 * v2 Output windows — send a projector's feed full-screen to another display, the way
 * media servers do (Output 1 → Projector 1 on display 2, …).
 *
 * Each output is a same-origin popup window with one canvas. The main window renders
 * the projector feed on the GPU at native resolution, reads it back asynchronously and
 * paints it into the popup. When the browser supports the Window Management API
 * (Chrome/Edge 100+), displays can be listed by name and the popup is placed and
 * made full-screen on the chosen display; other browsers open a window you drag to the
 * projector display and click to go full-screen.
 */

export type OutputContent = 'feed' | 'mask' | 'grid';

export interface OutputConfig {
  projectorId: string;
  content: OutputContent;
  /** 1 = native projector resolution, 0.5 = half (lighter on the GPU). */
  scale: 1 | 0.5;
  /** Overlay projector name / resolution / display for identification. */
  identify: boolean;
}

export interface DisplayInfo {
  key: string;
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isPrimary: boolean;
  isInternal: boolean;
  devicePixelRatio: number;
}

export interface OutputEntry {
  id: string;
  config: OutputConfig;
  display: DisplayInfo | null;
  win: Window;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  buffer: HTMLCanvasElement;
  bufferCtx: CanvasRenderingContext2D;
  image: ImageData | null;
  overlay: HTMLDivElement;
  hint: HTMLDivElement;
  /** GPU readback in flight — skip frames until it lands. */
  pending: boolean;
  frames: number;
  fps: number;
  lastFpsAt: number;
  /** Label shown in the overlay (projector name). */
  title: string;
  /** Last frame size in pixels. */
  frameSize: { width: number; height: number } | null;
}

export interface ScreenQuery {
  /** True when the Window Management API is available in this browser. */
  supported: boolean;
  /** True when permission was granted and every display is listed. */
  granted: boolean;
  displays: DisplayInfo[];
  error: string | null;
}

type ScreenDetailed = Screen & {
  label?: string;
  left?: number;
  top?: number;
  availLeft?: number;
  availTop?: number;
  isPrimary?: boolean;
  isInternal?: boolean;
  devicePixelRatio?: number;
};

type ScreenDetails = { screens: ScreenDetailed[]; currentScreen: ScreenDetailed };

type WindowWithScreens = Window & { getScreenDetails?: () => Promise<ScreenDetails> };

function toDisplay(s: ScreenDetailed, i: number): DisplayInfo {
  const left = s.availLeft ?? s.left ?? 0;
  const top = s.availTop ?? s.top ?? 0;
  const label = s.label && s.label.trim() ? s.label : `Display ${i + 1}`;
  return {
    key: `${label}@${left},${top}`,
    label,
    left,
    top,
    width: s.width,
    height: s.height,
    isPrimary: s.isPrimary === true,
    isInternal: s.isInternal === true,
    devicePixelRatio: s.devicePixelRatio ?? 1,
  };
}

export function windowManagementSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as WindowWithScreens).getScreenDetails === 'function';
}

/** Ask the browser for every connected display (prompts for permission once). */
export async function queryDisplays(): Promise<ScreenQuery> {
  const w = window as WindowWithScreens;
  if (!w.getScreenDetails) {
    return {
      supported: false,
      granted: false,
      displays: [toDisplay(window.screen as ScreenDetailed, 0)],
      error: null,
    };
  }
  try {
    const details = await w.getScreenDetails();
    return { supported: true, granted: true, displays: details.screens.map(toDisplay), error: null };
  } catch (err) {
    return {
      supported: true,
      granted: false,
      displays: [toDisplay(window.screen as ScreenDetailed, 0)],
      error:
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Display access was blocked. Allow "Window management" for this site in the browser address bar, then detect again.'
          : 'Could not list displays.',
    };
  }
}

// ---------------------------------------------------------------------------

type Listener = () => void;

class OutputWindowManager {
  private readonly entries = new Map<string, OutputEntry>();
  private readonly listeners = new Set<Listener>();
  private seq = 0;
  private version = 0;
  private pollTimer: number | null = null;
  private frameDriver: (() => void) | null = null;

  /**
   * The engine registers a callback that renders a frame if the main window has not
   * rendered recently. Output windows call it from their own animation loop, so
   * outputs keep updating when the main window is hidden or behind a full-screen
   * output (browsers pause animation in hidden windows).
   */
  setFrameDriver(fn: (() => void) | null): void {
    this.frameDriver = fn;
  }

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** Monotonic version for useSyncExternalStore. */
  getVersion = (): number => this.version;

  list(): OutputEntry[] {
    return [...this.entries.values()];
  }

  get(id: string): OutputEntry | undefined {
    return this.entries.get(id);
  }

  private emit(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  /**
   * Open an output window. Must be called from a user gesture (click) or the browser
   * blocks the popup. Returns null when the popup was blocked.
   */
  open(config: OutputConfig, display: DisplayInfo | null, title: string): OutputEntry | null {
    const id = `out-${++this.seq}`;
    const features = display
      ? `popup,left=${display.left},top=${display.top},width=${display.width},height=${display.height}`
      : 'popup,width=960,height=540';
    // With Window Management permission Chrome honours `fullscreen` on the chosen display.
    const win = window.open('', `napt-output-${id}`, display ? `${features},fullscreen` : features);
    if (!win) return null;

    const entry = this.buildWindow(id, win, config, display, title);
    this.entries.set(id, entry);
    this.ensurePolling();
    this.emit();
    return entry;
  }

  update(id: string, patch: Partial<OutputConfig> & { title?: string }): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    const { title, ...cfg } = patch;
    entry.config = { ...entry.config, ...cfg };
    if (title) entry.title = title;
    this.refreshOverlay(entry);
    if (entry.config.content === 'grid') this.drawGrid(entry);
    this.emit();
  }

  close(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    try {
      if (!entry.win.closed) entry.win.close();
    } catch {
      /* ignore */
    }
    this.emit();
  }

  closeAll(): void {
    for (const id of [...this.entries.keys()]) this.close(id);
  }

  /** Bring an output to the front and ask it to go full-screen (needs a click inside it on most browsers). */
  focus(id: string): void {
    const entry = this.entries.get(id);
    entry?.win.focus();
  }

  /** Paint one GPU frame (bottom-up RGBA rows) into the output window. */
  pushFrame(id: string, pixels: Uint8Array, width: number, height: number): void {
    const entry = this.entries.get(id);
    if (!entry || entry.win.closed) return;
    if (entry.buffer.width !== width || entry.buffer.height !== height) {
      entry.buffer.width = width;
      entry.buffer.height = height;
    }
    if (entry.canvas.width !== width || entry.canvas.height !== height) {
      entry.canvas.width = width;
      entry.canvas.height = height;
    }
    if (!entry.image || entry.image.width !== width || entry.image.height !== height) {
      entry.image = entry.bufferCtx.createImageData(width, height);
    }
    entry.image.data.set(pixels.subarray(0, width * height * 4));
    entry.bufferCtx.putImageData(entry.image, 0, 0);
    // WebGL rows are bottom-up: flip while drawing onto the visible canvas.
    entry.ctx.setTransform(1, 0, 0, -1, 0, height);
    entry.ctx.drawImage(entry.buffer, 0, 0);
    entry.ctx.setTransform(1, 0, 0, 1, 0, 0);
    entry.frameSize = { width, height };
    entry.frames++;
    const now = performance.now();
    if (now - entry.lastFpsAt > 1000) {
      entry.fps = Math.round((entry.frames * 1000) / (now - entry.lastFpsAt));
      entry.frames = 0;
      entry.lastFpsAt = now;
      this.refreshOverlay(entry);
    }
  }

  /** Projector resolution changed or output opened in grid mode. */
  drawGrid(entry: OutputEntry, width?: number, height?: number): void {
    const w = width ?? entry.frameSize?.width ?? 1920;
    const h = height ?? entry.frameSize?.height ?? 1080;
    entry.canvas.width = w;
    entry.canvas.height = h;
    entry.frameSize = { width: w, height: h };
    drawAlignmentGrid(entry.ctx, w, h, entry.title);
  }

  private ensurePolling(): void {
    if (this.pollTimer !== null) return;
    // Detect windows the user closed with the OS close button.
    this.pollTimer = window.setInterval(() => {
      let changed = false;
      for (const [id, entry] of this.entries) {
        if (entry.win.closed) {
          this.entries.delete(id);
          changed = true;
        }
      }
      if (changed) this.emit();
      if (this.entries.size === 0 && this.pollTimer !== null) {
        window.clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
    }, 500);
  }

  private buildWindow(
    id: string,
    win: Window,
    config: OutputConfig,
    display: DisplayInfo | null,
    title: string,
  ): OutputEntry {
    const doc = win.document;
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"><title>Output</title></head><body></body></html>');
    doc.close();
    doc.title = `Projection Simulator Output — ${title}`;
    const style = doc.createElement('style');
    style.textContent = `
      html,body{margin:0;height:100%;background:#000;overflow:hidden;cursor:none}
      body.show-cursor{cursor:default}
      canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;image-rendering:auto;background:#000}
      .ov{position:absolute;left:24px;top:20px;font:600 22px/1.35 system-ui,sans-serif;color:#fff;
          text-shadow:0 0 6px #000,0 0 2px #000;pointer-events:none;white-space:pre}
      .ov small{font-weight:400;font-size:15px;opacity:.85}
      .hint{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);padding:10px 16px;border-radius:8px;
          background:rgba(20,20,24,.85);color:#ddd;font:14px/1.4 system-ui,sans-serif;transition:opacity .4s;text-align:center}
      .hint button{margin-left:10px;font:inherit;padding:5px 12px;border-radius:6px;border:1px solid #2f7fa8;background:#1e5b7a;color:#fff;cursor:pointer}
      .hidden{opacity:0;pointer-events:none}
    `;
    doc.head.appendChild(style);
    const canvas = doc.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    doc.body.appendChild(canvas);
    const overlay = doc.createElement('div');
    overlay.className = 'ov';
    doc.body.appendChild(overlay);
    const hint = doc.createElement('div');
    hint.className = 'hint';
    hint.innerHTML =
      'Output window — press <b>F</b> or double-click for full screen · <b>Esc</b> to exit · <b>I</b> toggles info';
    const fsBtn = doc.createElement('button');
    fsBtn.textContent = 'Full screen';
    hint.appendChild(fsBtn);
    doc.body.appendChild(hint);

    const buffer = doc.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const bufferCtx = buffer.getContext('2d', { alpha: false, willReadFrequently: false })!;

    const entry: OutputEntry = {
      id,
      config,
      display,
      win,
      canvas,
      ctx,
      buffer,
      bufferCtx,
      image: null,
      overlay,
      hint,
      pending: false,
      frames: 0,
      fps: 0,
      lastFpsAt: performance.now(),
      title,
      frameSize: null,
    };

    const goFullscreen = async () => {
      const el = doc.documentElement as HTMLElement & {
        requestFullscreen: (opts?: FullscreenOptions & { screen?: unknown }) => Promise<void>;
      };
      try {
        const w = win as WindowWithScreens;
        if (entry.display && w.getScreenDetails) {
          const details = await w.getScreenDetails();
          const target =
            details.screens.find((s, i) => toDisplay(s, i).key === entry.display!.key) ?? details.currentScreen;
          await el.requestFullscreen({ screen: target } as FullscreenOptions);
        } else {
          await el.requestFullscreen();
        }
      } catch {
        try {
          await el.requestFullscreen();
        } catch {
          /* user must click again */
        }
      }
    };
    fsBtn.addEventListener('click', () => void goFullscreen());
    doc.addEventListener('dblclick', () => void goFullscreen());
    let hideTimer = 0;
    const showHint = () => {
      hint.classList.remove('hidden');
      doc.body.classList.add('show-cursor');
      win.clearTimeout(hideTimer);
      hideTimer = win.setTimeout(() => {
        hint.classList.add('hidden');
        doc.body.classList.remove('show-cursor');
      }, 2500);
    };
    doc.addEventListener('mousemove', showHint);
    doc.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') void goFullscreen();
      if (e.key === 'i' || e.key === 'I') {
        this.update(id, { identify: !entry.config.identify });
      }
    });
    doc.addEventListener('fullscreenchange', () => {
      if (doc.fullscreenElement) hint.classList.add('hidden');
    });
    win.addEventListener('beforeunload', () => {
      if (this.entries.has(id)) {
        this.entries.delete(id);
        this.emit();
      }
    });
    const loop = () => {
      if (win.closed || !this.entries.has(id)) return;
      try {
        this.frameDriver?.();
      } catch {
        /* keep the loop alive */
      }
      win.requestAnimationFrame(loop);
    };
    win.requestAnimationFrame(loop);
    // Fallback tick: some browsers pause rAF for windows without fresh compositor frames.
    const tick = win.setInterval(() => {
      if (win.closed || !this.entries.has(id)) {
        win.clearInterval(tick);
        return;
      }
      try {
        this.frameDriver?.();
      } catch {
        /* ignore */
      }
    }, 33);
    showHint();
    this.refreshOverlay(entry);
    if (config.content === 'grid') this.drawGrid(entry);
    return entry;
  }

  private refreshOverlay(entry: OutputEntry): void {
    const { overlay, config } = entry;
    overlay.style.display = config.identify ? 'block' : 'none';
    const size = entry.frameSize ? `${entry.frameSize.width}×${entry.frameSize.height}` : '—';
    const what = config.content === 'feed' ? 'Feed' : config.content === 'mask' ? 'Blend mask' : 'Alignment grid';
    const disp = entry.display ? `${entry.display.label} (${entry.display.width}×${entry.display.height})` : 'Window';
    overlay.innerHTML = '';
    const t = entry.win.document.createElement('div');
    t.textContent = entry.title;
    const s = entry.win.document.createElement('small');
    s.textContent = `${what} · ${size}${config.content !== 'grid' ? ` · ${entry.fps} fps` : ''}\n${disp}`;
    overlay.append(t, s);
  }
}

/** Classic projector alignment grid: 10 % grid, centre cross, corner marks, circles. */
export function drawAlignmentGrid(ctx: CanvasRenderingContext2D, w: number, h: number, title: string): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const minor = Math.max(1, Math.round(Math.min(w, h) / 540));
  ctx.lineWidth = minor;
  ctx.strokeStyle = '#3a3a3a';
  for (let i = 1; i < 20; i++) {
    const x = Math.round((i / 20) * w) + 0.5;
    const y = Math.round((i / 20) * h) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#bbb';
  for (let i = 1; i < 10; i++) {
    const x = Math.round((i / 10) * w) + 0.5;
    const y = Math.round((i / 10) * h) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.lineWidth = minor * 3;
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(minor * 1.5, minor * 1.5, w - minor * 3, h - minor * 3);
  ctx.strokeStyle = '#ffd54f';
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.strokeStyle = '#4fc3f7';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, h * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  const r = h * 0.12;
  for (const [cx, cy] of [
    [r * 1.3, r * 1.3],
    [w - r * 1.3, r * 1.3],
    [r * 1.3, h - r * 1.3],
    [w - r * 1.3, h - r * 1.3],
  ]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${Math.round(h / 22)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, w / 2, h / 2 - h * 0.08);
  ctx.font = `${Math.round(h / 34)}px system-ui, sans-serif`;
  ctx.fillText(`${w} × ${h}`, w / 2, h / 2 + h * 0.08);
}

export const outputWindows = new OutputWindowManager();

if (typeof window !== 'undefined') {
  (window as Window & { __naptOutputs?: OutputWindowManager }).__naptOutputs = outputWindows;
}
