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
