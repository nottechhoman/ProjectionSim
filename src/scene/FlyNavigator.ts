import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Fly navigation (Unity / Unreal style): hold the right mouse button, then
 *   mouse = look around, W A S D = forward / left / back / right, Q / E = down / up,
 *   Shift = 3× faster, wheel = flying speed.
 * Keys only fly while the button is held, so W / E / M / L keep their usual
 * shortcuts the rest of the time. Releasing hands the camera back to orbit, with
 * the orbit target placed in front of the camera.
 */

export interface FlyKeys {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fast: boolean;
}

export const NO_KEYS: FlyKeys = { forward: false, back: false, left: false, right: false, up: false, down: false, fast: false };
export const FAST_FACTOR = 3;
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 40;
const LOOK_SENSITIVITY = 0.0035; // radians per pixel
const MAX_PITCH = THREE.MathUtils.degToRad(89);

/** Camera-relative movement for one frame (pure). yaw/pitch in radians, YXZ order like the camera. */
export function flyDelta(keys: FlyKeys, yaw: number, pitch: number, speed: number, dt: number): THREE.Vector3 {
  const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
  const move = new THREE.Vector3();
  if (keys.forward) move.add(forward);
  if (keys.back) move.sub(forward);
  if (keys.right) move.add(right);
  if (keys.left) move.sub(right);
  if (keys.up) move.y += 1;
  if (keys.down) move.y -= 1;
  if (move.lengthSq() === 0) return move;
  return move.normalize().multiplyScalar(speed * (keys.fast ? FAST_FACTOR : 1) * Math.max(0, dt));
}

export function clampPitch(p: number): number {
  return Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));
}

export function nextSpeed(speed: number, wheelDeltaY: number): number {
  const s = wheelDeltaY < 0 ? speed * 1.25 : wheelDeltaY > 0 ? speed / 1.25 : speed;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, s));
}

const KEY_MAP: Record<string, keyof FlyKeys> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  KeyE: 'up',
  KeyQ: 'down',
  ShiftLeft: 'fast',
  ShiftRight: 'fast',
};

export class FlyNavigator {
  speed = 3; // metres per second
  private active = false;
  private keys: FlyKeys = { ...NO_KEYS };
  private yaw = 0;
  private pitch = 0;
  private lastX = 0;
  private lastY = 0;
  private orbitDistance = 10;
  private readonly hint: HTMLDivElement;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly canvas: HTMLCanvasElement,
    private readonly controls: OrbitControls,
  ) {
    this.hint = document.createElement('div');
    this.hint.style.cssText =
      'position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:5;padding:6px 12px;border-radius:8px;' +
      'background:rgba(10,12,16,0.82);color:#e8eaef;font:12px system-ui,sans-serif;pointer-events:none;display:none;white-space:nowrap;';
    this.hint.dataset.testid = 'fly-hint';
    canvas.parentElement?.appendChild(this.hint);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.stop);
    // Capture phase: while flying, keys belong to the camera, not to shortcuts.
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    canvas.addEventListener('wheel', this.onWheel, { passive: false, capture: true });
  }

  get flying(): boolean {
    return this.active;
  }

  /** Move the camera for this frame. */
  update(dt: number): void {
    if (!this.active) return;
    const delta = flyDelta(this.keys, this.yaw, this.pitch, this.speed, Math.min(dt, 0.1));
    this.camera.position.add(delta);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.updateMatrixWorld();
  }

  dispose(): void {
    this.stop();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('blur', this.stop);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.canvas.removeEventListener('wheel', this.onWheel, { capture: true });
    this.hint.remove();
  }

  private onContextMenu = (e: Event) => e.preventDefault();

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 2 || e.pointerType === 'touch') return;
    e.preventDefault();
    const euler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    this.yaw = euler.y;
    this.pitch = clampPitch(euler.x);
    this.orbitDistance = Math.max(1, this.camera.position.distanceTo(this.controls.target));
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.keys = { ...NO_KEYS, fast: e.shiftKey };
    this.active = true;
    this.controls.enabled = false;
    this.canvas.style.cursor = 'crosshair';
    this.showHint();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.active) return;
    this.yaw -= (e.clientX - this.lastX) * LOOK_SENSITIVITY;
    this.pitch = clampPitch(this.pitch - (e.clientY - this.lastY) * LOOK_SENSITIVITY);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.active && e.button === 2) this.stop();
  };

  /** Hand the camera back to orbit: target straight ahead at the old distance. */
  private stop = () => {
    if (!this.active) return;
    this.active = false;
    this.keys = { ...NO_KEYS };
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.controls.target.copy(this.camera.position).addScaledVector(forward, this.orbitDistance);
    this.controls.enabled = true;
    this.controls.update();
    this.canvas.style.cursor = '';
    this.hint.style.display = 'none';
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.active) return;
    const key = KEY_MAP[e.code];
    if (!key) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.keys[key] = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const key = KEY_MAP[e.code];
    if (!key) return;
    this.keys[key] = false;
    if (this.active) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.active) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.speed = nextSpeed(this.speed, e.deltaY);
    this.showHint();
  };

  private showHint(): void {
    this.hint.textContent = `Flying · W A S D move · Q / E down / up · Shift faster · wheel speed ${this.speed.toFixed(1)} m/s`;
    this.hint.style.display = 'block';
  }
}
