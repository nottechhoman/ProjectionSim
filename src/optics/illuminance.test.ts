import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { illuminanceAt, luxToNits, normalizePrevizSettings, unitImageArea } from './illuminance';
import {
  bestLensForThrow,
  checkLensShift,
  clampThrow,
  findCatalogProjector,
  PROJECTOR_CATALOG,
  throwDistanceRange,
} from './projectorCatalog';

describe('illuminance', () => {
  const origin = new THREE.Vector3(0, 0, 0);
  const forward = new THREE.Vector3(0, 0, -1);
  const normal = new THREE.Vector3(0, 0, 1);

  it('on axis equals lumens / image area', () => {
    // 10,000 lm, throw 2, 16:10, at 6 m: image 3 m × 1.875 m.
    const a1 = unitImageArea(2, 1.6);
    const e = illuminanceAt(10000, a1, origin, forward, new THREE.Vector3(0, 0, -6), normal);
    expect(e).toBeCloseTo(10000 / (3 * 1.875), 3);
  });

  it('is uniform across a perpendicular flat screen', () => {
    const a1 = unitImageArea(1.5, 16 / 9);
    const centre = illuminanceAt(5000, a1, origin, forward, new THREE.Vector3(0, 0, -4), normal);
    const corner = illuminanceAt(5000, a1, origin, forward, new THREE.Vector3(1.3, 0.7, -4), normal);
    expect(corner).toBeCloseTo(centre, 6);
  });

  it('falls with the square of distance and with tilt', () => {
    const a1 = unitImageArea(1, 1);
    const near = illuminanceAt(1000, a1, origin, forward, new THREE.Vector3(0, 0, -2), normal);
    const far = illuminanceAt(1000, a1, origin, forward, new THREE.Vector3(0, 0, -4), normal);
    expect(near / far).toBeCloseTo(4, 6);
    const tilted = new THREE.Vector3(0, Math.sin(Math.PI / 3), Math.cos(Math.PI / 3));
    const t = illuminanceAt(1000, a1, origin, forward, new THREE.Vector3(0, 0, -2), tilted);
    expect(t / near).toBeCloseTo(0.5, 6);
  });

  it('is zero behind the projector', () => {
    expect(illuminanceAt(1000, 1, origin, forward, new THREE.Vector3(0, 0, 3), normal)).toBe(0);
  });

  it('converts lux to nits for a matte screen', () => {
    expect(luxToNits(Math.PI * 100, 1)).toBeCloseTo(100, 6);
    expect(luxToNits(Math.PI * 100, 1.5)).toBeCloseTo(150, 6);
  });

  it('normalizes settings', () => {
    expect(normalizePrevizSettings(undefined)).toEqual({
      unit: 'nits',
      scaleMax: 500,
      screenGain: 1,
      spillEverywhere: true,
      densityScaleMax: 1000,
    });
    expect(normalizePrevizSettings({ unit: 'lux', scaleMax: -1, screenGain: 99 })).toEqual({
      unit: 'lux',
      scaleMax: 500,
      screenGain: 10,
      spillEverywhere: true,
      densityScaleMax: 1000,
    });
  });
});

describe('projector catalogue', () => {
  it('has unique ids and sane lenses', () => {
    const ids = new Set(PROJECTOR_CATALOG.map((p) => p.id));
    expect(ids.size).toBe(PROJECTOR_CATALOG.length);
    for (const p of PROJECTOR_CATALOG) {
      if (p.lumens != null) expect(p.lumens).toBeGreaterThan(0);
      expect(p.lenses.length).toBeGreaterThan(0);
      for (const l of p.lenses) {
        expect(l.throwMin).toBeGreaterThan(0);
        expect(l.throwMax).toBeGreaterThanOrEqual(l.throwMin);
        if (l.shiftV) expect(l.shiftV[0]).toBeLessThanOrEqual(l.shiftV[1]);
        if (l.shiftH) expect(l.shiftH[0]).toBeLessThanOrEqual(l.shiftH[1]);
      }
    }
  });

  it('picks the lens whose zoom contains the throw, else the nearest', () => {
    const udx = findCatalogProjector('barco-udx-w22')!;
    expect(bestLensForThrow(udx, 1.8).id).toBe('tld-1.5');
    expect(bestLensForThrow(udx, 9).id).toBe('tld-4.5');
  });

  it('clamps throw, checks shift and gives a hang distance', () => {
    const udx = findCatalogProjector('barco-udx-w22')!;
    const lens = udx.lenses.find((l) => l.id === 'tld-1.5')!;
    expect(clampThrow(lens, 3)).toBe(2);
    expect(checkLensShift(lens, 0, 0.5).ok).toBe(true);
    const bad = checkLensShift(lens, 0.6, 0);
    expect(bad.ok).toBe(false);
    expect(bad.issues[0]).toContain('Shift H 60%');
    expect(throwDistanceRange(lens, 4)).toEqual([6, 8]);
  });
});
