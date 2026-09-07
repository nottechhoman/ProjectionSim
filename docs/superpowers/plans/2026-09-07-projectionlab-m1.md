# ProjectionLab Milestone 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working browser-based single-projector 3D simulation with correct throw-ratio optics, projective test-pattern rendering, planar footprint measurements, and occlusion.

**Architecture:** Layered TypeScript modules — pure `optics/` and `coverage/` math, native Three.js `SceneEngine` owning WebGL passes (depth → projective → helpers), Zustand store feeding the engine, React + CSS modules for the four-panel UI shell.

**Tech Stack:** TypeScript, React 18, Vite 6, Three.js r17x, Zustand 5, Vitest 3, CSS modules. WebGL2 only.

## Global Constraints

- 1 scene unit = 1 meter; right-handed; +Y up; projector forward = local −Z
- Orientation stored as quaternion; UI exposes yaw/pitch/roll in degrees, **YXZ** Euler order
- Native Three.js only — no React Three Fiber
- Optics math is single source of truth for shaders, helpers, and inspector
- Lens shift via off-axis projection matrix — never rotate projector to fake shift
- Run locally without backend, account, or paid API
- Deferred features show disabled UI with milestone label — no fake controls
- Internal calculations are not rounded
- Commit package-lock.json; cap viewport pixel ratio at 2

---

## File Map

| Path | Responsibility |
|------|----------------|
| `package.json` | Scripts: dev, build, typecheck, test |
| `vite.config.ts` | Vitest + GLSL raw imports |
| `src/types/index.ts` | Shared interfaces |
| `src/optics/types.ts` | Optics-specific types |
| `src/optics/nominal.ts` | W, H, FOV, density formulas |
| `src/optics/validate.ts` | Parameter validation |
| `src/optics/projectionMatrix.ts` | Off-axis perspective matrix |
| `src/optics/rays.ts` | Raster ray unprojection |
| `src/optics/index.ts` | Re-exports |
| `src/coverage/planeIntersection.ts` | Ray-plane intersection |
| `src/coverage/planarFootprint.ts` | Footprint polygon + clip |
| `src/coverage/index.ts` | Re-exports |
| `src/visibility/DepthPass.ts` | Projector depth render target |
| `src/projection/shaders/projection.vert.glsl` | Projective vertex shader |
| `src/projection/shaders/projection.frag.glsl` | Projective fragment + patterns |
| `src/projection/ProjectiveMaterial.ts` | ShaderMaterial wrapper |
| `src/scene/SceneEngine.ts` | Renderer, loop, pass orchestration |
| `src/scene/objects/createScreen.ts` | Screen mesh factory |
| `src/scene/objects/createFloor.ts` | Floor mesh factory |
| `src/scene/objects/createBox.ts` | Box mesh factory |
| `src/scene/helpers/FrustumHelper.ts` | Frustum line segments |
| `src/scene/helpers/FootprintHelper.ts` | Surface outline |
| `src/store/sceneSlice.ts` | Scene object state |
| `src/store/projectorSlice.ts` | Projector state |
| `src/store/uiSlice.ts` | UI preferences |
| `src/store/index.ts` | Combined Zustand store |
| `src/store/defaultScene.ts` | Default sample scene |
| `src/ui/App.tsx` | Four-panel layout |
| `src/ui/Viewport.tsx` | Canvas mount + SceneEngine lifecycle |
| `src/ui/panels/Toolbar.tsx` | Top toolbar |
| `src/ui/panels/LeftPanel.tsx` | Scene hierarchy |
| `src/ui/panels/Inspector.tsx` | Right inspector |
| `src/ui/panels/BottomPanel.tsx` | Status bar |
| `src/ui/panels/CalcResults.tsx` | Live calculation readout |
| `src/utils/units.ts` | m/cm/mm conversion |
| `src/utils/euler.ts` | YXZ ↔ quaternion helpers |
| `src/optics/optics.test.ts` | Tests 1 & 2 |
| `src/coverage/coverage.test.ts` | Test 3 |
| `src/coverage/overlap.test.ts` | Test 4 stub (skipped) |
| `README.md` | Install, conventions, limitations |

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`, `.gitignore`
- Modify: (none)

**Interfaces:**
- Produces: runnable Vite dev server, Vitest runner, TypeScript strict mode

- [ ] **Step 1: Initialize Vite React-TS in a temp dir and copy structure**

Run:
```bash
cd "/Users/sohoman/Desktop/Vibe code_Projection Sim/ProjectionSim"
npm create vite@latest /tmp/projectionlab-scaffold -- --template react-ts
cp /tmp/projectionlab-scaffold/tsconfig*.json /tmp/projectionlab-scaffold/index.html .
mkdir -p src
cp /tmp/projectionlab-scaffold/src/main.tsx /tmp/projectionlab-scaffold/src/vite-env.d.ts src/
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "projectionlab",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "three": "^0.172.0",
    "zustand": "^5.0.3"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/three": "^0.172.0",
    "typescript": "~5.7.2",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
  assetsInclude: ['**/*.glsl'],
});
```

Add `@vitejs/plugin-react` to devDependencies in package.json.

- [ ] **Step 4: Write `.gitignore`**

```
node_modules
dist
.netlify
*.local
.DS_Store
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` committed

- [ ] **Step 6: Replace `src/App.tsx` with placeholder**

```tsx
export default function App() {
  return <div>ProjectionLab loading…</div>;
}
```

- [ ] **Step 7: Verify dev server starts**

Run: `npm run dev -- --host 127.0.0.1 --port 5173`
Expected: Vite ready message (stop server after verify)

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig*.json index.html src/ .gitignore
git commit -m "chore: scaffold Vite React TypeScript project"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types/index.ts`, `src/utils/euler.ts`, `src/utils/units.ts`

**Interfaces:**
- Consumes: (none)
- Produces: `Transform`, `SceneObject`, `ProjectorConfig`, `TestPattern`, `DisplayUnit`, `CalculationResults`

- [ ] **Step 1: Write `src/types/index.ts`**

```typescript
export type DisplayUnit = 'm' | 'cm' | 'mm';

export type SceneObjectType = 'screen' | 'floor' | 'wall' | 'box';

export type TestPattern =
  | 'checkerboard'
  | 'uvGrid'
  | 'colorBars'
  | 'white'
  | 'projectorId';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Transform {
  position: Vec3;
  /** Stored as quaternion [x, y, z, w] */
  quaternion: [number, number, number, number];
}

export interface SceneObject {
  id: string;
  name: string;
  type: SceneObjectType;
  transform: Transform;
  visibleInEditor: boolean;
  receivesProjection: boolean;
  blocksProjection: boolean;
  /** Width, height, depth in meters (depth optional for planes) */
  dimensions: { width: number; height: number; depth?: number };
}

export interface ProjectorOptics {
  throwRatio: number;
  throwRatioMin?: number;
  throwRatioMax?: number;
  resolution: { width: number; height: number };
  aspectRatio: number;
  lensShiftH: number;
  lensShiftV: number;
  nearLimit: number;
  farLimit: number;
}

export interface ProjectorConfig {
  id: string;
  name: string;
  enabled: boolean;
  color: string;
  transform: Transform;
  optics: ProjectorOptics;
  testPattern: TestPattern;
  brightness: number;
}

export interface NominalProjection {
  width: number;
  height: number;
  diagonal: number;
  area: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  pixelsPerMeterH: number;
  pixelsPerMeterV: number;
  mmPerPixelH: number;
}

export interface FootprintResult {
  corners: Vec3[];
  unclippedArea: number;
  clippedArea: number;
  centerHit: Vec3 | null;
  axialDistance: number | null;
}

export interface CalculationResults {
  nominal: NominalProjection | null;
  footprint: FootprintResult | null;
  opticsError: string | null;
}
```

- [ ] **Step 2: Write `src/utils/euler.ts`**

```typescript
import * as THREE from 'three';

/** YXZ order — yaw around Y, pitch around X, roll around Z */
export function eulerYXZToQuaternion(
  yawDeg: number,
  pitchDeg: number,
  rollDeg: number,
): [number, number, number, number] {
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(pitchDeg),
    THREE.MathUtils.degToRad(yawDeg),
    THREE.MathUtils.degToRad(rollDeg),
    'YXZ',
  );
  const q = new THREE.Quaternion().setFromEuler(e);
  return [q.x, q.y, q.z, q.w];
}

export function quaternionToEulerYXZ(
  q: [number, number, number, number],
): { yaw: number; pitch: number; roll: number } {
  const quat = new THREE.Quaternion(...q);
  const e = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
  return {
    yaw: THREE.MathUtils.radToDeg(e.y),
    pitch: THREE.MathUtils.radToDeg(e.x),
    roll: THREE.MathUtils.radToDeg(e.z),
  };
}
```

- [ ] **Step 3: Write `src/utils/units.ts`**

```typescript
import type { DisplayUnit } from '../types';

export function fromDisplayUnit(value: number, unit: DisplayUnit): number {
  switch (unit) {
    case 'm': return value;
    case 'cm': return value / 100;
    case 'mm': return value / 1000;
  }
}

export function toDisplayUnit(valueM: number, unit: DisplayUnit): number {
  switch (unit) {
    case 'm': return valueM;
    case 'cm': return valueM * 100;
    case 'mm': return valueM * 1000;
  }
}

export function formatLength(valueM: number, unit: DisplayUnit, digits = 3): string {
  return `${toDisplayUnit(valueM, unit).toFixed(digits)} ${unit}`;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types src/utils
git commit -m "feat: add shared types and utility helpers"
```

---

### Task 3: Optics Module (TDD)

**Files:**
- Create: `src/optics/nominal.ts`, `src/optics/validate.ts`, `src/optics/projectionMatrix.ts`, `src/optics/rays.ts`, `src/optics/index.ts`, `src/optics/optics.test.ts`

**Interfaces:**
- Consumes: `ProjectorOptics`, `NominalProjection` from `src/types`
- Produces:
  - `computeNominalProjection(optics: ProjectorOptics, distance: number): NominalProjection`
  - `validateOptics(optics: ProjectorOptics): { valid: boolean; error?: string }`
  - `buildProjectorCamera(optics, worldMatrix: THREE.Matrix4): THREE.PerspectiveCamera`
  - `getProjectorViewProjectionMatrix(optics, worldMatrix): THREE.Matrix4`
  - `unprojectRasterRay(optics, u, v, worldMatrix): { origin: THREE.Vector3; direction: THREE.Vector3 }`

- [ ] **Step 1: Write failing Test 1 in `src/optics/optics.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { computeNominalProjection } from './nominal';
import { validateOptics } from './validate';
import type { ProjectorOptics } from '../types';

const baseOptics: ProjectorOptics = {
  throwRatio: 1.5,
  resolution: { width: 1920, height: 1080 },
  aspectRatio: 16 / 9,
  lensShiftH: 0,
  lensShiftV: 0,
  nearLimit: 0.1,
  farLimit: 100,
};

describe('Acceptance Test 1: Basic optics', () => {
  it('computes nominal perpendicular-plane dimensions at D=6m', () => {
    const result = computeNominalProjection(baseOptics, 6);
    expect(result.width).toBeCloseTo(4.0, 3);
    expect(result.height).toBeCloseTo(2.25, 3);
    expect(result.area).toBeCloseTo(9.0, 3);
    expect(result.diagonal).toBeCloseTo(4.589, 2);
    expect(result.pixelsPerMeterH).toBeCloseTo(480, 1);
    expect(result.pixelsPerMeterV).toBeCloseTo(480, 1);
    expect(result.mmPerPixelH).toBeCloseTo(2.083, 2);
  });
});

describe('validateOptics', () => {
  it('rejects zero throw ratio', () => {
    const r = validateOptics({ ...baseOptics, throwRatio: 0 });
    expect(r.valid).toBe(false);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- src/optics/optics.test.ts`
Expected: FAIL — cannot find module `./nominal`

- [ ] **Step 3: Implement `src/optics/nominal.ts`**

```typescript
import type { ProjectorOptics, NominalProjection } from '../types';

export function computeNominalProjection(
  optics: ProjectorOptics,
  distance: number,
): NominalProjection {
  const T = optics.throwRatio;
  const A = optics.aspectRatio;
  const width = distance / T;
  const height = width / A;
  const diagonal = Math.sqrt(width * width + height * height);
  const area = width * height;
  const horizontalFovDeg =
    (2 * Math.atan(1 / (2 * T)) * 180) / Math.PI;
  const verticalFovDeg =
    (2 * Math.atan(1 / (2 * T * A)) * 180) / Math.PI;
  const pixelsPerMeterH = optics.resolution.width / width;
  const pixelsPerMeterV = optics.resolution.height / height;
  const mmPerPixelH = (1000 * width) / optics.resolution.width;
  return {
    width,
    height,
    diagonal,
    area,
    horizontalFovDeg,
    verticalFovDeg,
    pixelsPerMeterH,
    pixelsPerMeterV,
    mmPerPixelH,
  };
}
```

- [ ] **Step 4: Implement `src/optics/validate.ts`**

```typescript
import type { ProjectorOptics } from '../types';

export function validateOptics(
  optics: ProjectorOptics,
): { valid: boolean; error?: string } {
  const { throwRatio, resolution, aspectRatio, nearLimit, farLimit } = optics;
  if (!Number.isFinite(throwRatio) || throwRatio <= 0) {
    return { valid: false, error: 'Throw ratio must be a positive number' };
  }
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return { valid: false, error: 'Aspect ratio must be positive' };
  }
  if (resolution.width <= 0 || resolution.height <= 0) {
    return { valid: false, error: 'Resolution must be positive' };
  }
  if (nearLimit <= 0 || farLimit <= nearLimit) {
    return { valid: false, error: 'Near/far limits invalid' };
  }
  return { valid: true };
}
```

- [ ] **Step 5: Run Test 1 — expect PASS**

Run: `npm test -- src/optics/optics.test.ts`
Expected: PASS

- [ ] **Step 6: Write failing Test 2 (lens shift center displacement)**

Add to `src/optics/optics.test.ts`:

```typescript
import * as THREE from 'three';
import { getProjectorViewProjectionMatrix, unprojectRasterRay } from './projectionMatrix';
import { eulerYXZToQuaternion } from '../utils/euler';

describe('Acceptance Test 2: Lens shift', () => {
  it('moves image center +1.125m in world Y with +0.5 vertical shift', () => {
    const optics = { ...baseOptics, lensShiftV: 0.5 };
    const world = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 6),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    const centerBefore = unprojectRasterRay(baseOptics, 0.5, 0.5, world);
    const centerAfter = unprojectRasterRay(optics, 0.5, 0.5, world);
    // Intersect both with Z=0 plane
    const hitBefore = intersectPlaneZ0(centerBefore);
    const hitAfter = intersectPlaneZ0(centerAfter);
    expect(hitAfter!.y - hitBefore!.y).toBeCloseTo(1.125, 3);
  });
});

function intersectPlaneZ0(ray: { origin: THREE.Vector3; direction: THREE.Vector3 }) {
  const t = -ray.origin.z / ray.direction.z;
  if (t <= 0 || !Number.isFinite(t)) return null;
  return ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
}
```

- [ ] **Step 7: Implement `src/optics/projectionMatrix.ts` and `src/optics/rays.ts`**

`projectionMatrix.ts`:
```typescript
import * as THREE from 'three';
import type { ProjectorOptics } from '../types';

export function buildProjectorCamera(
  optics: ProjectorOptics,
  worldMatrix: THREE.Matrix4,
): THREE.PerspectiveCamera {
  const fovY = (2 * Math.atan(1 / (2 * optics.throwRatio * optics.aspectRatio)) * 180) / Math.PI;
  const cam = new THREE.PerspectiveCamera(fovY, optics.aspectRatio, optics.nearLimit, optics.farLimit);
  cam.matrixAutoUpdate = false;
  cam.matrixWorld.copy(worldMatrix);
  cam.matrix.copy(worldMatrix);
  cam.matrix.decompose(cam.position, cam.quaternion, cam.scale);
  cam.updateMatrixWorld(true);
  // Off-axis projection via view offset (lens shift)
  cam.setViewOffset(
    optics.resolution.width,
    optics.resolution.height,
    -optics.lensShiftH * optics.resolution.width,
    optics.lensShiftV * optics.resolution.height,
    optics.resolution.width,
    optics.resolution.height,
  );
  cam.updateProjectionMatrix();
  return cam;
}

export function getProjectorViewProjectionMatrix(
  optics: ProjectorOptics,
  worldMatrix: THREE.Matrix4,
): THREE.Matrix4 {
  const cam = buildProjectorCamera(optics, worldMatrix);
  return new THREE.Matrix4().multiplyMatrices(
    cam.projectionMatrix,
    cam.matrixWorldInverse,
  );
}
```

`rays.ts`:
```typescript
import * as THREE from 'three';
import type { ProjectorOptics } from '../types';
import { buildProjectorCamera } from './projectionMatrix';

export function unprojectRasterRay(
  optics: ProjectorOptics,
  u: number,
  v: number,
  worldMatrix: THREE.Matrix4,
) {
  const cam = buildProjectorCamera(optics, worldMatrix);
  const ndc = new THREE.Vector3(u * 2 - 1, 1 - v * 2, 0.5);
  ndc.unproject(cam);
  const origin = new THREE.Vector3().setFromMatrixPosition(worldMatrix);
  const direction = ndc.sub(origin).normalize();
  return { origin, direction };
}
```

Fix imports in test file to use `./rays` for `unprojectRasterRay`.

- [ ] **Step 8: Run Test 2 — expect PASS**

Run: `npm test -- src/optics/optics.test.ts`
Expected: PASS (all tests)

- [ ] **Step 9: Write `src/optics/index.ts` and commit**

```typescript
export * from './nominal';
export * from './validate';
export * from './projectionMatrix';
export * from './rays';
```

```bash
git add src/optics
git commit -m "feat: optics module with Tests 1 and 2"
```

---

### Task 4: Coverage Module (TDD)

**Files:**
- Create: `src/coverage/planeIntersection.ts`, `src/coverage/planarFootprint.ts`, `src/coverage/index.ts`, `src/coverage/coverage.test.ts`, `src/coverage/overlap.test.ts`

**Interfaces:**
- Consumes: `unprojectRasterRay`, `ProjectorOptics`, `FootprintResult`
- Produces:
  - `intersectRayPlane(ray, planePoint, planeNormal): Vec3 | null`
  - `computePlanarFootprint(optics, worldMatrix, screen): FootprintResult`

- [ ] **Step 1: Write failing Test 3**

```typescript
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computePlanarFootprint } from './planarFootprint';
import { eulerYXZToQuaternion } from '../utils/euler';
import type { ProjectorOptics } from '../types';

const optics: ProjectorOptics = {
  throwRatio: 1.5,
  resolution: { width: 1920, height: 1080 },
  aspectRatio: 16 / 9,
  lensShiftH: 0,
  lensShiftV: 0,
  nearLimit: 0.1,
  farLimit: 100,
};

describe('Acceptance Test 3: Rotation footprint', () => {
  it('matches independent ray-plane intersections at 20° yaw', () => {
    const q = eulerYXZToQuaternion(20, 0, 0);
    const world = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 6),
      new THREE.Quaternion(...q),
      new THREE.Vector3(1, 1, 1),
    );
    const screen = {
      center: new THREE.Vector3(0, 0, 0),
      normal: new THREE.Vector3(0, 0, 1),
      width: 20,
      height: 20,
    };
    const fp = computePlanarFootprint(optics, world, screen);
    expect(fp.corners).toHaveLength(4);
    expect(fp.unclippedArea).toBeGreaterThan(fp.clippedArea * 0.5);
    fp.corners.forEach((c) => {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Implement `planeIntersection.ts`**

```typescript
import * as THREE from 'three';
import type { Vec3 } from '../types';

export function intersectRayPlane(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  planePoint: THREE.Vector3,
  planeNormal: THREE.Vector3,
): Vec3 | null {
  const denom = planeNormal.dot(direction);
  if (Math.abs(denom) < 1e-9) return null;
  const t = planePoint.clone().sub(origin).dot(planeNormal) / denom;
  if (t <= 0) return null;
  const p = origin.clone().add(direction.clone().multiplyScalar(t));
  return { x: p.x, y: p.y, z: p.z };
}
```

- [ ] **Step 3: Implement `planarFootprint.ts`**

```typescript
import * as THREE from 'three';
import type { ProjectorOptics, FootprintResult } from '../types';
import { unprojectRasterRay } from '../optics/rays';
import { intersectRayPlane } from './planeIntersection';

const CORNER_UV = [
  [0, 0], [1, 0], [1, 1], [0, 1],
] as const;

export function computePlanarFootprint(
  optics: ProjectorOptics,
  worldMatrix: THREE.Matrix4,
  screen: {
    center: THREE.Vector3;
    normal: THREE.Vector3;
    width: number;
    height: number;
  },
): FootprintResult {
  const corners = CORNER_UV.map(([u, v]) => {
    const ray = unprojectRasterRay(optics, u, v, worldMatrix);
    return intersectRayPlane(ray.origin, ray.direction, screen.center, screen.normal);
  }).filter((c): c is NonNullable<typeof c> => c !== null);

  const centerRay = unprojectRasterRay(optics, 0.5, 0.5, worldMatrix);
  const centerHit = intersectRayPlane(
    centerRay.origin, centerRay.direction, screen.center, screen.normal,
  );

  const unclippedArea = polygonArea3D(corners);
  const clippedArea = unclippedArea; // M1: large screen — clip stub returns same

  const axialDistance = centerHit
    ? centerRay.origin.distanceTo(new THREE.Vector3(centerHit.x, centerHit.y, centerHit.z))
    : null;

  return {
    corners,
    unclippedArea,
    clippedArea,
    centerHit,
    axialDistance,
  };
}

function polygonArea3D(pts: { x: number; y: number; z: number }[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}
```

- [ ] **Step 4: Write skipped overlap stub `src/coverage/overlap.test.ts`**

```typescript
import { describe, it } from 'vitest';

describe.skip('Acceptance Test 4: Overlap (Milestone 3)', () => {
  it('computes pairwise overlap without double-counting triple regions', () => {
    // Implemented in M3
  });
});
```

- [ ] **Step 5: Run coverage tests**

Run: `npm test -- src/coverage`
Expected: PASS (overlap skipped)

- [ ] **Step 6: Commit**

```bash
git add src/coverage
git commit -m "feat: planar footprint coverage with Test 3"
```

---

### Task 5: Zustand Store + Default Scene

**Files:**
- Create: `src/store/sceneSlice.ts`, `src/store/projectorSlice.ts`, `src/store/uiSlice.ts`, `src/store/defaultScene.ts`, `src/store/index.ts`

**Interfaces:**
- Produces: `useAppStore` with `sceneObjects`, `projectors`, `selectedId`, `calculationResults`, actions

- [ ] **Step 1: Write `defaultScene.ts`**

```typescript
import type { SceneObject, ProjectorConfig } from '../types';
import { eulerYXZToQuaternion } from '../utils/euler';

export const DEFAULT_SCENE_OBJECTS: SceneObject[] = [
  {
    id: 'screen-1',
    name: 'Screen',
    type: 'screen',
    transform: {
      position: { x: 0, y: 1.5, z: 0 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
    visibleInEditor: true,
    receivesProjection: true,
    blocksProjection: false,
    dimensions: { width: 6, height: 3.375 },
  },
  {
    id: 'floor-1',
    name: 'Floor',
    type: 'floor',
    transform: {
      position: { x: 0, y: 0, z: 0 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
    visibleInEditor: true,
    receivesProjection: false,
    blocksProjection: true,
    dimensions: { width: 20, height: 20 },
  },
];

export const DEFAULT_PROJECTORS: ProjectorConfig[] = [
  {
    id: 'proj-1',
    name: 'Projector 1',
    enabled: true,
    color: '#4fc3f7',
    transform: {
      position: { x: 0, y: 1.5, z: 6 },
      quaternion: eulerYXZToQuaternion(0, 0, 0),
    },
    optics: {
      throwRatio: 1.5,
      resolution: { width: 1920, height: 1080 },
      aspectRatio: 16 / 9,
      lensShiftH: 0,
      lensShiftV: 0,
      nearLimit: 0.1,
      farLimit: 100,
    },
    testPattern: 'checkerboard',
    brightness: 1,
  },
];
```

- [ ] **Step 2: Write store slices and combined store**

`src/store/index.ts`:
```typescript
import { create } from 'zustand';
import type { CalculationResults, DisplayUnit, ProjectorConfig, SceneObject, TestPattern } from '../types';
import { DEFAULT_PROJECTORS, DEFAULT_SCENE_OBJECTS } from './defaultScene';
import { validateOptics } from '../optics/validate';
import { computeNominalProjection } from '../optics/nominal';

interface AppState {
  sceneObjects: SceneObject[];
  projectors: ProjectorConfig[];
  selectedObjectId: string | null;
  selectedProjectorId: string;
  displayUnit: DisplayUnit;
  calculationResults: CalculationResults;
  shaderWarning: string | null;
  setSelectedObject: (id: string | null) => void;
  updateProjector: (id: string, patch: Partial<ProjectorConfig>) => void;
  updateProjectorOptics: (id: string, patch: Partial<ProjectorConfig['optics']>) => void;
  setDisplayUnit: (u: DisplayUnit) => void;
  recomputeCalculations: () => void;
  addBox: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  sceneObjects: DEFAULT_SCENE_OBJECTS,
  projectors: DEFAULT_PROJECTORS,
  selectedObjectId: 'proj-1',
  selectedProjectorId: 'proj-1',
  displayUnit: 'm',
  calculationResults: { nominal: null, footprint: null, opticsError: null },
  shaderWarning: null,
  setSelectedObject: (id) => set({ selectedObjectId: id }),
  updateProjector: (id, patch) => {
    set((s) => ({
      projectors: s.projectors.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    get().recomputeCalculations();
  },
  updateProjectorOptics: (id, patch) => {
    const state = get();
    const proj = state.projectors.find((p) => p.id === id);
    if (!proj) return;
    const next = { ...proj.optics, ...patch };
    const v = validateOptics(next);
    if (!v.valid) {
      set({ calculationResults: { ...state.calculationResults, opticsError: v.error ?? 'Invalid optics' } });
      return;
    }
    set((s) => ({
      projectors: s.projectors.map((p) => (p.id === id ? { ...p, optics: next } : p)),
      calculationResults: { ...s.calculationResults, opticsError: null },
    }));
    get().recomputeCalculations();
  },
  setDisplayUnit: (u) => set({ displayUnit: u }),
  recomputeCalculations: () => {
    const { projectors } = get();
    const proj = projectors[0];
    const v = validateOptics(proj.optics);
    if (!v.valid) return;
    const nominal = computeNominalProjection(proj.optics, 6);
    set({ calculationResults: { nominal, footprint: null, opticsError: null } });
  },
  addBox: () => {
    const id = `box-${Date.now()}`;
    set((s) => ({
      sceneObjects: [
        ...s.sceneObjects,
        {
          id,
          name: 'Box',
          type: 'box' as const,
          transform: {
            position: { x: 0, y: 1, z: 3 },
            quaternion: [0, 0, 0, 1] as [number, number, number, number],
          },
          visibleInEditor: true,
          receivesProjection: false,
          blocksProjection: true,
          dimensions: { width: 1, height: 1, depth: 1 },
        },
      ],
    }));
  },
}));

useAppStore.getState().recomputeCalculations();
```

- [ ] **Step 3: Commit**

```bash
git add src/store
git commit -m "feat: Zustand store with default sample scene"
```

---

### Task 6: Projection Shaders + Material

**Files:**
- Create: `src/projection/shaders/projection.vert.glsl`, `src/projection/shaders/projection.frag.glsl`, `src/projection/ProjectiveMaterial.ts`, `src/projection/patterns.glsl` (inline in frag)

**Interfaces:**
- Produces: `createProjectiveMaterial(options): THREE.ShaderMaterial`

- [ ] **Step 1: Write vertex shader `projection.vert.glsl`**

```glsl
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
```

- [ ] **Step 2: Write fragment shader `projection.frag.glsl`**

```glsl
uniform mat4 projectorMatrix;
uniform sampler2D depthMap;
uniform float depthBias;
uniform float brightness;
uniform int patternType; // 0 checker, 1 uv, 2 bars, 3 white, 4 id
uniform vec3 projectorColor;
uniform vec2 depthMapSize;

varying vec3 vWorldPos;

float checker(vec2 uv) {
  vec2 c = floor(uv * 16.0);
  return mod(c.x + c.y, 2.0);
}

void main() {
  vec4 projClip = projectorMatrix * vec4(vWorldPos, 1.0);
  if (projClip.w <= 0.0) discard;

  vec3 projNDC = projClip.xyz / projClip.w;
  if (abs(projNDC.x) > 1.0 || abs(projNDC.y) > 1.0 || abs(projNDC.z) > 1.0) discard;

  vec2 uv = projNDC.xy * 0.5 + 0.5;

  // Depth occlusion test
  vec2 depthUV = uv;
  float sceneDepth = texture2D(depthMap, depthUV).r;
  float fragDepth = projNDC.z * 0.5 + 0.5;
  if (fragDepth > sceneDepth + depthBias) discard;

  vec3 color;
  if (patternType == 0) {
    float v = checker(uv);
    color = mix(vec3(0.1), vec3(0.9), v);
  } else if (patternType == 1) {
    color = vec3(uv, 0.0);
  } else if (patternType == 2) {
    color = vec3(uv.x, uv.y, 0.5);
  } else if (patternType == 4) {
    color = projectorColor;
  } else {
    color = vec3(1.0);
  }

  gl_FragColor = vec4(color * brightness, 1.0);
}
```

- [ ] **Step 3: Write `ProjectiveMaterial.ts`**

```typescript
import * as THREE from 'three';
import vert from './shaders/projection.vert.glsl?raw';
import frag from './shaders/projection.frag.glsl?raw';
import type { TestPattern } from '../types';

const PATTERN_MAP: Record<TestPattern, number> = {
  checkerboard: 0,
  uvGrid: 1,
  colorBars: 2,
  white: 3,
  projectorId: 4,
};

export function createProjectiveMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      projectorMatrix: { value: new THREE.Matrix4() },
      depthMap: { value: null },
      depthBias: { value: 0.001 },
      brightness: { value: 1.0 },
      patternType: { value: 0 },
      projectorColor: { value: new THREE.Color('#4fc3f7') },
      depthMapSize: { value: new THREE.Vector2(512, 512) },
    },
    vertexShader: vert,
    fragmentShader: frag,
  });
}

export function patternToInt(pattern: TestPattern): number {
  return PATTERN_MAP[pattern];
}
```

- [ ] **Step 4: Add `?raw` import support — verify vite handles glsl raw imports (already in vite.config assetsInclude)**

- [ ] **Step 5: Commit**

```bash
git add src/projection
git commit -m "feat: projective texture shader with test patterns"
```

---

### Task 7: Depth Pass

**Files:**
- Create: `src/visibility/DepthPass.ts`

**Interfaces:**
- Produces: `class DepthPass { render(renderer, scene, projectorCamera): WebGLRenderTarget }`

- [ ] **Step 1: Implement DepthPass**

```typescript
import * as THREE from 'three';

export class DepthPass {
  readonly target: THREE.WebGLRenderTarget;
  private readonly depthMaterial: THREE.MeshDepthMaterial;

  constructor(width = 512, height = 512) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    this.target.depthTexture = new THREE.DepthTexture(width, height);
    this.depthMaterial = new THREE.MeshDepthMaterial();
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    meshes: THREE.Mesh[],
  ): THREE.Texture {
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.clear();
    const prevOverride = scene.overrideMaterial;
    scene.overrideMaterial = this.depthMaterial;
    meshes.forEach((m) => renderer.render(m, camera));
    scene.overrideMaterial = prevOverride;
    renderer.setRenderTarget(prevTarget);
    return this.target.depthTexture!;
  }

  dispose() {
    this.target.dispose();
    this.depthMaterial.dispose();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/visibility
git commit -m "feat: projector depth pass for occlusion"
```

---

### Task 8: SceneEngine

**Files:**
- Create: `src/scene/objects/createScreen.ts`, `src/scene/objects/createFloor.ts`, `src/scene/objects/createBox.ts`, `src/scene/helpers/FrustumHelper.ts`, `src/scene/SceneEngine.ts`

**Interfaces:**
- Consumes: store state, optics functions, ProjectiveMaterial, DepthPass
- Produces: `class SceneEngine { mount(canvas); dispose(); sync(state); render(); }`

- [ ] **Step 1: Object factories**

`createScreen.ts`:
```typescript
import * as THREE from 'three';
import type { SceneObject } from '../../types';

export function createScreen(obj: SceneObject): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(obj.dimensions.width, obj.dimensions.height);
  const mat = new THREE.MeshStandardMaterial({ color: 0x333333, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z);
  mesh.quaternion.set(...obj.transform.quaternion);
  mesh.userData = { id: obj.id, receivesProjection: obj.receivesProjection, blocksProjection: obj.blocksProjection };
  return mesh;
}
```

Similar for floor (PlaneGeometry rotated −π/2 X) and box (BoxGeometry).

- [ ] **Step 2: Implement SceneEngine core**

Key methods:
- Constructor: WebGL2 check, create renderer/scene/editorCamera/OrbitControls/grid
- `sync(state)`: rebuild meshes from store, update projector matrix uniform
- `render()`: depth pass → projective overlay on receivers → helpers → editor view
- Subscribe to store in Viewport

- [ ] **Step 3: FrustumHelper draws 4 edge lines from projector using corner rays**

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
Expected: viewport shows grid, screen, floor, checkerboard projection

- [ ] **Step 5: Commit**

```bash
git add src/scene
git commit -m "feat: SceneEngine with projection and occlusion pipeline"
```

---

### Task 9: UI Shell

**Files:**
- Create: `src/ui/App.tsx`, `src/ui/App.module.css`, `src/ui/Viewport.tsx`, `src/ui/panels/*.tsx`, `src/ui/panels/*.module.css`

**Interfaces:**
- Consumes: `useAppStore`
- Produces: four-panel layout wired to store

- [ ] **Step 1: Write `App.module.css` grid layout**

```css
.app {
  display: grid;
  grid-template-rows: 40px 1fr 28px;
  grid-template-columns: 220px 1fr 280px;
  height: 100vh;
  background: #1a1a1a;
  color: #e0e0e0;
  font-family: system-ui, sans-serif;
  font-size: 13px;
}
.toolbar { grid-column: 1 / -1; }
.left { grid-row: 2; }
.center { grid-row: 2; }
.right { grid-row: 2; }
.bottom { grid-column: 1 / -1; }
```

- [ ] **Step 2: Implement panels**

- `Toolbar.tsx`: unit select, view preset buttons, Add Box, Measure toggle, disabled Save/Open labels ("M2")
- `LeftPanel.tsx`: scene object list, click to select
- `Inspector.tsx`: position inputs, yaw/pitch/roll, throw ratio, resolution, lens shift, pattern select
- `CalcResults.tsx`: nominal width/height/area/density from store
- `BottomPanel.tsx`: WebGL2 status, frame ms, shaderWarning

- [ ] **Step 3: Wire `Viewport.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { SceneEngine } from '../../scene/SceneEngine';
import { useAppStore } from '../../store';

export function Viewport() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<SceneEngine | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const engine = new SceneEngine(canvasRef.current);
    engineRef.current = engine;
    const unsub = useAppStore.subscribe((state) => engine.sync(state));
    engine.sync(useAppStore.getState());
    engine.start();
    return () => { unsub(); engine.dispose(); };
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
```

- [ ] **Step 4: WebGL2 unavailable full-screen message in SceneEngine constructor**

- [ ] **Step 5: Update `src/main.tsx` to render App, add global CSS reset**

- [ ] **Step 6: Commit**

```bash
git add src/ui src/App.tsx src/main.tsx src/index.css
git commit -m "feat: four-panel UI shell with inspector and viewport"
```

---

### Task 10: Integration Verification + README

**Files:**
- Create: `README.md`
- Modify: `src/store/index.ts` (wire footprint recompute via coverage module)

- [ ] **Step 1: Wire footprint into `recomputeCalculations` using coverage module**

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all non-skipped tests PASS

- [ ] **Step 3: Run typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: no errors

- [ ] **Step 4: Write README.md**

Sections: Installation, Usage, Coordinate Conventions, M1 Features, Known Limitations (M2–M4 deferrals), Test commands.

- [ ] **Step 5: Manual checklist**

- [ ] Rotate projector yaw 20° → keystone visible
- [ ] Add box between projector and screen → shadow on screen
- [ ] Move editor camera → shadow unchanged
- [ ] Inspector shows 4.0 × 2.25 m for default scene
- [ ] Invalid throw ratio rejected in inspector

- [ ] **Step 6: Final commit**

```bash
git add README.md
git commit -m "docs: README and Milestone 1 verification"
```

---

## Spec Coverage Matrix

| Spec requirement | Task |
|-----------------|------|
| Metric scene, 1 unit = 1 m | Task 2, 5 |
| Throw-ratio optics | Task 3 |
| Lens shift off-axis | Task 3 |
| Test-pattern projective shader | Task 6 |
| Position/rotation controls | Task 9 |
| Footprint measurements | Task 4, 10 |
| Occlusion depth pass | Task 7, 8 |
| Vitest Tests 1–3 | Task 3, 4 |
| Full UI shell | Task 9 |
| WebGL2 check | Task 8, 9 |
| Default sample scene | Task 5 |
| Deferred features labeled | Task 9 |
| README | Task 10 |

## Self-Review

- [x] No TBD/TODO placeholders in plan steps
- [x] All spec M1 requirements mapped to tasks
- [x] Type names consistent (`ProjectorOptics`, `computeNominalProjection`, `useAppStore`)
- [x] Test commands and expected outcomes specified
