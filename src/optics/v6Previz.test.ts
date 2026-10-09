import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ProjectorConfig, SceneObject } from '../types';
import { buildProjectorCamera } from './projectionMatrix';
import { getProjectorWorldMatrix } from './projectorWorldMatrix';
import { pixelDensityAt } from './illuminance';
import { placeToFill, throwForCurrentDistance } from './autoPlace';
import { findCatalogLens, findCatalogProjector, PROJECTOR_CATALOG } from './projectorCatalog';

function projector(partial: Partial<ProjectorConfig['optics']> = {}, y = 1.5): ProjectorConfig {
  return {
    id: 'p1',
    name: 'P1',
    enabled: true,
    color: '#fff',
    transform: { position: { x: 3, y, z: 9 }, quaternion: [0, 0.2, 0, 0.98] },
    optics: {
      throwRatio: 1.8,
      throwRatioMin: 1.5,
      throwRatioMax: 2.0,
      resolution: { width: 1920, height: 1200 },
      aspectRatio: 1.6,
      lensShiftH: 0.1,
      lensShiftV: 0.2,
      nearLimit: 0.1,
      farLimit: 100,
      ...partial,
    },
    brightness: 1,
    blendEdges: { left: 0, right: 0, top: 0, bottom: 0 },
    blendGamma: 1,
    outerEdgeFade: false,
  };
}

function screen(width = 6, height = 3.375, yawDeg = 0): SceneObject {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yawDeg));
  return {
    id: 's1',
    name: 'Screen',
    type: 'screen',
    transform: { position: { x: 0, y: 3, z: 0 }, quaternion: [q.x, q.y, q.z, q.w] },
    visibleInEditor: true,
    receivesProjection: true,
    blocksProjection: false,
    dimensions: { width, height },
  };
}

/** Where the projector's image corners land on the screen plane, in screen-local coords. */
function imageCornersOnScreen(p: ProjectorConfig, s: SceneObject): THREE.Vector2[] {
  const cam = buildProjectorCamera(p.optics, getProjectorWorldMatrix(p));
  const q = new THREE.Quaternion(...s.transform.quaternion);
  const c = new THREE.Vector3(s.transform.position.x, s.transform.position.y, s.transform.position.z);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1).applyQuaternion(q), c);
  const inv = q.clone().invert();
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => {
    const far = new THREE.Vector3(x, y, 1).unproject(cam);
    const ray = new THREE.Ray(cam.position.clone(), far.sub(cam.position).normalize());
    const hit = ray.intersectPlane(plane, new THREE.Vector3())!;
    const local = hit.sub(c).applyQuaternion(inv);
    return new THREE.Vector2(local.x, local.y);
  });
}

describe('pixel density', () => {
  const origin = new THREE.Vector3(0, 0, 0);
  const forward = new THREE.Vector3(0, 0, -1);
  const normal = new THREE.Vector3(0, 0, 1);

  it('on axis equals horizontal resolution / image width', () => {
    // throw 2 at 6 m: image 3 m wide, 1920 px → 640 px/m.
    const d = pixelDensityAt(2 * 1920, origin, forward, new THREE.Vector3(0, 0, -6), normal);
    expect(d).toBeCloseTo(640, 6);
  });

  it('is uniform across a perpendicular flat screen', () => {
    const centre = pixelDensityAt(1.5 * 1920, origin, forward, new THREE.Vector3(0, 0, -4), normal);
    const corner = pixelDensityAt(1.5 * 1920, origin, forward, new THREE.Vector3(1.6, 0.9, -4), normal);
    expect(corner).toBeCloseTo(centre, 6);
  });

  it('drops on a surface tilted away from the projector', () => {
    const square = pixelDensityAt(3840, origin, forward, new THREE.Vector3(0, 0, -5), normal);
    const tilted = pixelDensityAt(
      3840,
      origin,
      forward,
      new THREE.Vector3(0, 0, -5),
      new THREE.Vector3(0, Math.sin(1), Math.cos(1)),
    );
    expect(tilted).toBeCloseTo(square * Math.sqrt(Math.cos(1)), 6);
  });
});

describe('auto place', () => {
  it('fills a 16:9 screen square-on and the image covers it exactly in width', () => {
    const p = projector();
    const s = screen(6, 3.375);
    const placed = placeToFill(p, s)!;
    expect(placed.throwRatio).toBe(1.8);
    expect(placed.distance).toBeCloseTo(10.8, 6);
    expect(placed.position.z).toBeCloseTo(10.8, 6);
    expect(placed.position.y).toBeCloseTo(3, 6);
    expect(placed.lensShiftV).toBe(0);

    const after = { ...p, transform: { position: placed.position, quaternion: placed.quaternion }, optics: { ...p.optics, throwRatio: placed.throwRatio, lensShiftH: 0, lensShiftV: 0 } };
    const corners = imageCornersOnScreen(after, s);
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.min(...xs)).toBeCloseTo(-3, 4);
    expect(Math.max(...xs)).toBeCloseTo(3, 4);
    // 16:10 image is taller than the 16:9 screen, so it overshoots top and bottom.
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(3.375 / 2 - 1e-6);
  });

  it('keeps the hanging height with lens shift and still lands on the screen', () => {
    const p = projector({}, 1.0);
    const s = screen(6, 3.375, 30);
    const lens = { throwMin: 1.5, throwMax: 2.0, shiftV: [-0.6, 0.6] as [number, number] };
    const placed = placeToFill(p, s, { lens, keepHeight: true })!;
    expect(placed.position.y).toBeCloseTo(1.0, 6);
    expect(placed.shiftLimited).toBe(false);
    expect(placed.lensShiftV).toBeGreaterThan(0); // projector below the screen centre → image shifted up

    const after = {
      ...p,
      transform: { position: placed.position, quaternion: placed.quaternion },
      optics: { ...p.optics, throwRatio: placed.throwRatio, lensShiftH: 0, lensShiftV: placed.lensShiftV },
    };
    const corners = imageCornersOnScreen(after, s);
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.min(...xs)).toBeCloseTo(-3, 3);
    expect(Math.max(...xs)).toBeCloseTo(3, 3);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(0, 3);
  });

  it('moves the projector when the lens cannot shift far enough', () => {
    const p = projector({}, -5);
    const lens = { throwMin: 1.5, throwMax: 2.0, shiftV: [-0.3, 0.3] as [number, number] };
    const placed = placeToFill(p, screen(), { lens, keepHeight: true })!;
    expect(placed.shiftLimited).toBe(true);
    expect(placed.lensShiftV).toBeCloseTo(0.3, 6);
    expect(placed.position.y).toBeGreaterThan(-5);
  });

  it('clamps the throw to the lens and reports the throw needed from where it hangs', () => {
    const p = projector({ throwRatio: 3 });
    const placed = placeToFill(p, screen(), { lens: { throwMin: 1.5, throwMax: 2.0, shiftV: null } })!;
    expect(placed.throwRatio).toBe(2);
    const atTen = { ...p, transform: { ...p.transform, position: { x: 0, y: 3, z: 12 } } };
    expect(throwForCurrentDistance(atTen, screen())).toBeCloseTo(2, 6);
  });
});

describe('researched catalogue', () => {
  it('has the Panasonic, Epson and Optoma models from the verified table', () => {
    const brands = new Set(PROJECTOR_CATALOG.filter((p) => !p.approximate).map((p) => p.brand));
    expect([...brands].sort()).toEqual(['Epson', 'Optoma', 'Panasonic']);
    expect(PROJECTOR_CATALOG.filter((p) => !p.approximate).length).toBeGreaterThan(90);
  });

  it('keeps per-projector throw for the same lens', () => {
    const lensOn = (model: string) => findCatalogLens(findCatalogProjector(model), 'elplm15');
    expect(lensOn('epson-eb-l1755u')).toBeDefined();
    expect(lensOn('epson-eb-pu2220b')).toBeDefined();
  });

  it('opens v5 projects that saved the old model ids', () => {
    expect(findCatalogProjector('pana-pt-rz21k')?.model).toBe('PT-RZ21K');
    expect(findCatalogProjector('pana-pt-rq35k')?.model).toBe('PT-RQ35K2');
    expect(findCatalogProjector('barco-udx-w22')?.approximate).toBe(true);
    const l1755 = findCatalogProjector('epson-eb-l1755u');
    expect(findCatalogLens(l1755, 'elplx02')?.id).toBe('elplx02s');
  });
});
