import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PaneView, ProjectorConfig } from '../types';
import { splitPaneView } from '../ui/multiview/layouts';
import { buildProjectorCamera } from '../optics/projectionMatrix';
import { getProjectorWorldMatrix } from '../optics/projectorWorldMatrix';

/**
 * v9 multiview: extra viewport panes. The main WebGL canvas stays the editing view;
 * each extra pane has its own 2D canvas, camera and orbit controls. Per frame the
 * scene is drawn once per pane into a corner of the main canvas (same renderer,
 * same textures), copied to the pane, and then the main view is drawn over it.
 */

export interface PaneSpec {
  canvas: HTMLCanvasElement;
  view: PaneView;
}

interface Pane {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
  view: PaneView;
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera | null;
  controls: OrbitControls | null;
  /** Ortho half-height in metres at zoom 1. */
  halfHeight: number;
  downAt: { x: number; y: number } | null;
  cleanup: () => void;
}

export interface PaneHost {
  /** Bounds of the stage (screens, objects, projectors). */
  sceneBox(): THREE.Box3;
  projectors(): ProjectorConfig[];
  /** Raster preview canvas of a projector's output (kept up to date while an output pane is open). */
  feedCanvas(projectorId: string): HTMLCanvasElement | null;
  /** Click in a pane (NDC) — select or measure like a click in the main view. */
  pick(ndc: THREE.Vector2, camera: THREE.Camera): void;
}

const ORBIT_DIR = new THREE.Vector3(0.55, 0.4, 0.75).normalize();

/** Aim a perspective camera through a projector's lens, framing its whole image. */
export function aimThroughProjector(camera: THREE.PerspectiveCamera, projector: ProjectorConfig, viewAspect: number): void {
  const cam = buildProjectorCamera(projector.optics, getProjectorWorldMatrix(projector));
  const { throwRatio, aspectRatio, lensShiftH, lensShiftV } = projector.optics;
  const tanHalfW = 1 / (2 * throwRatio);
  const tanHalfH = tanHalfW / aspectRatio;
  const centre = new THREE.Vector3(lensShiftH * 2 * tanHalfW, lensShiftV * 2 * tanHalfH, -1).applyQuaternion(cam.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  const tanHalfFov = Math.max(tanHalfH, tanHalfW / (viewAspect || 1)) * 1.12;
  camera.fov = THREE.MathUtils.clamp((2 * Math.atan(tanHalfFov) * 180) / Math.PI, 5, 120);
  camera.aspect = viewAspect || 1;
  camera.near = 0.1;
  camera.far = 500;
  camera.updateProjectionMatrix();
  camera.position.copy(cam.position);
  camera.up.copy(up);
  camera.lookAt(cam.position.clone().add(centre.normalize()));
}

export class MultiviewPanes {
  private panes: Pane[] = [];
  private readonly size = new THREE.Vector2();

  constructor(private readonly host: PaneHost) {}

  get count(): number {
    return this.panes.length;
  }

  /** True when an output pane needs projector raster previews. */
  get needsFeeds(): boolean {
    return this.panes.some((p) => splitPaneView(p.view)[0] === 'output');
  }

  setPanes(specs: PaneSpec[]): void {
    // Drop panes whose canvas went away; keep camera state for the rest.
    for (const pane of this.panes) {
      if (!specs.some((s) => s.canvas === pane.canvas)) pane.cleanup();
    }
    const next: Pane[] = [];
    for (const spec of specs) {
      let pane = this.panes.find((p) => p.canvas === spec.canvas);
      if (!pane) pane = this.createPane(spec.canvas, spec.view);
      if (pane.view !== spec.view) this.configure(pane, spec.view);
      next.push(pane);
    }
    this.panes = next;
  }

  /** Re-frame every pane (Fit, new scene). */
  resetAll(): void {
    for (const pane of this.panes) this.configure(pane, pane.view);
  }

  /** Re-frame one pane (double-click). */
  reset(canvas: HTMLCanvasElement): void {
    const pane = this.panes.find((p) => p.canvas === canvas);
    if (pane) this.configure(pane, pane.view);
  }

  private createPane(canvas: HTMLCanvasElement, view: PaneView): Pane {
    const pane: Pane = {
      canvas,
      ctx: canvas.getContext('2d'),
      view,
      camera: null,
      controls: null,
      halfHeight: 5,
      downAt: null,
      cleanup: () => {},
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 0) pane.downAt = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const down = pane.downAt;
      pane.downAt = null;
      if (!down || !pane.camera || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.host.pick(ndc, pane.camera);
    };
    const onDbl = () => this.configure(pane, pane.view);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('dblclick', onDbl);
    canvas.style.touchAction = 'none';
    pane.cleanup = () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', onDbl);
      pane.controls?.dispose();
      pane.controls = null;
    };
    this.configure(pane, view);
    return pane;
  }

  private configure(pane: Pane, view: PaneView): void {
    pane.view = view;
    pane.controls?.dispose();
    pane.controls = null;
    pane.camera = null;
    const [kind, arg] = splitPaneView(view);
    const aspect = pane.canvas.clientWidth / Math.max(1, pane.canvas.clientHeight) || 1;
    if (kind === 'output') return;
    if (kind === 'projector') {
      pane.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 500);
      return;
    }
    const box = this.host.sceneBox();
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(2, sphere.radius);
    const centre = sphere.center;
    const ext = box.getSize(new THREE.Vector3());
    if (arg === 'persp') {
      const cam = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
      const distance = (radius / Math.sin(THREE.MathUtils.degToRad(25))) * 1.05;
      cam.position.copy(centre).addScaledVector(ORBIT_DIR, distance);
      cam.lookAt(centre);
      pane.camera = cam;
    } else {
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 8 + 100);
      const away = radius * 4;
      if (arg === 'top') {
        cam.position.set(centre.x, centre.y + away, centre.z);
        cam.up.set(0, 0, -1);
      } else if (arg === 'front') {
        cam.position.set(centre.x, centre.y, centre.z + away);
      } else {
        cam.position.set(centre.x + away, centre.y, centre.z);
      }
      cam.lookAt(centre);
      // Fit the stage's extent across this view (plan: X × Z, front: X × Y, side: Z × Y).
      const across = arg === 'side' ? ext.z : ext.x;
      const up = arg === 'top' ? ext.z : ext.y;
      pane.halfHeight = Math.max(1, (Math.max(up, across / aspect) / 2) * 1.1);
      pane.camera = cam;
    }
    const controls = new OrbitControls(pane.camera, pane.canvas);
    controls.target.copy(centre);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.screenSpacePanning = true;
    if (pane.camera instanceof THREE.OrthographicCamera) {
      // Plan / elevation views stay square to the stage: pan and zoom only.
      controls.enableRotate = false;
      controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
      controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    } else {
      controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    }
    controls.update();
    pane.controls = controls;
  }

  /**
   * Draw every pane. Call with materials already swapped in (projection preview) and
   * before the main view is rendered — this uses the main canvas as scratch space.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, mainCanvas: HTMLCanvasElement, hidden: THREE.Object3D[]): void {
    if (this.panes.length === 0) return;
    renderer.getSize(this.size);
    const mainW = this.size.x;
    const mainH = this.size.y;
    if (mainW === 0 || mainH === 0) return;
    const dpr = renderer.getPixelRatio();
    const wasVisible = hidden.map((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));

    for (const pane of this.panes) {
      const w = pane.canvas.clientWidth;
      const h = pane.canvas.clientHeight;
      if (w === 0 || h === 0 || !pane.ctx) continue;
      const pw = Math.max(1, Math.round(w * dpr));
      const ph = Math.max(1, Math.round(h * dpr));
      if (pane.canvas.width !== pw || pane.canvas.height !== ph) {
        pane.canvas.width = pw;
        pane.canvas.height = ph;
      }
      const ctx = pane.ctx;
      const [kind, arg] = splitPaneView(pane.view);

      if (kind === 'output') {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, pw, ph);
        const feed = this.host.feedCanvas(arg);
        if (feed && feed.width > 0 && feed.height > 0) {
          const s = Math.min(pw / feed.width, ph / feed.height);
          const dw = feed.width * s;
          const dh = feed.height * s;
          ctx.drawImage(feed, (pw - dw) / 2, (ph - dh) / 2, dw, dh);
        }
        continue;
      }

      const camera = pane.camera;
      if (!camera) continue;
      const aspect = w / h;
      if (kind === 'projector') {
        const projector = this.host.projectors().find((p) => p.id === arg);
        if (!projector || !(camera instanceof THREE.PerspectiveCamera)) {
          ctx.fillStyle = '#111';
          ctx.fillRect(0, 0, pw, ph);
          continue;
        }
        aimThroughProjector(camera, projector, aspect);
      } else {
        pane.controls?.update();
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.aspect = aspect;
        } else {
          const hh = pane.halfHeight;
          camera.left = -hh * aspect;
          camera.right = hh * aspect;
          camera.top = hh;
          camera.bottom = -hh;
        }
        camera.updateProjectionMatrix();
      }

      // Render into the top-left corner of the main canvas (scaled down if the pane is bigger).
      const scale = Math.min(1, mainW / w, mainH / h);
      const rw = Math.max(1, Math.floor(w * scale));
      const rh = Math.max(1, Math.floor(h * scale));
      renderer.setViewport(0, mainH - rh, rw, rh);
      renderer.render(scene, camera);
      ctx.drawImage(mainCanvas, 0, 0, Math.floor(rw * dpr), Math.floor(rh * dpr), 0, 0, pw, ph);
    }

    renderer.setViewport(0, 0, mainW, mainH);
    hidden.forEach((o, i) => (o.visible = wasVisible[i]));
  }

  dispose(): void {
    for (const pane of this.panes) pane.cleanup();
    this.panes = [];
  }
}
