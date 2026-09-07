import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeNominalProjection } from './nominal';
import { validateOptics } from './validate';
import { unprojectRasterRay } from './rays';
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
