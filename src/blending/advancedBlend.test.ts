import { describe, expect, it } from 'vitest';
import { DEFAULT_BLEND_SETTINGS } from '../types';
import {
  autoBlendWeights,
  blackFloor,
  blendCurve,
  compositeLight,
  edgeScore,
  lightWeight,
  normalizeBlendSettings,
  signalMask,
} from './advancedBlend';

const auto = { ...DEFAULT_BLEND_SETTINGS, mode: 'auto' as const };

describe('v2 auto blend (geometry-aware partition of unity)', () => {
  it('curves hit 0 and 1 at the ends', () => {
    for (const c of ['linear', 'smoothstep', 'cosine', 'power'] as const) {
      expect(blendCurve(0, c)).toBeCloseTo(0, 6);
      expect(blendCurve(1, c)).toBeCloseTo(1, 6);
    }
  });

  it('edge score is zero on the border and one at centre', () => {
    expect(edgeScore({ x: 0, y: 0.5 }, auto)).toBe(0);
    expect(edgeScore({ x: 0.5, y: 0.5 }, auto)).toBeCloseTo(1, 6);
    expect(edgeScore({ x: 1.2, y: 0.5 }, auto)).toBe(0);
  });

  it('weights always sum to one for 2, 3 and 4 projectors', () => {
    const cases = [
      [{ x: 0.9, y: 0.5 }, { x: 0.1, y: 0.5 }],
      [{ x: 0.8, y: 0.3 }, { x: 0.2, y: 0.4 }, { x: 0.5, y: 0.95 }],
      [{ x: 0.95, y: 0.95 }, { x: 0.05, y: 0.95 }, { x: 0.95, y: 0.05 }, { x: 0.05, y: 0.05 }],
    ];
    for (const qs of cases) {
      const w = autoBlendWeights(qs, auto);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
  });

  it('a lone projector keeps full weight even near its edge', () => {
    expect(autoBlendWeights([{ x: 0.02, y: 0.5 }, null], auto)).toEqual([1, 0]);
  });

  it('projector nearer its own edge gets the smaller share', () => {
    const [a, b] = autoBlendWeights([{ x: 0.95, y: 0.5 }, { x: 0.3, y: 0.5 }], auto);
    expect(a).toBeLessThan(b);
  });

  it('weights vary continuously across an overlap (no seam)', () => {
    let prev = 1;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const [a] = autoBlendWeights([{ x: 0.8 + 0.2 * t, y: 0.5 }, { x: 0.2 * t, y: 0.5 }], auto);
      expect(a).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - a).toBeLessThan(0.25);
      prev = a;
    }
  });

  it('gamma-corrected masks reproduce linear light; uncorrected darken crossover', () => {
    const s = { ...auto, gammaCorrect: true };
    expect(lightWeight(0.5, s) + lightWeight(0.5, s)).toBeCloseTo(1, 9);
    expect(lightWeight(signalMask(0.5, s), { ...s, gammaCorrect: false })).toBeCloseTo(0.5, 6);
    const raw = { ...auto, gammaCorrect: false };
    expect(lightWeight(0.5, raw) * 2).toBeLessThan(0.5);
  });

  it('black-level compensation equalizes the floor', () => {
    const s = { ...auto, blackLevel: 0.02, blackLevelCompensation: false };
    expect(blackFloor(2, 2, s)).toBeCloseTo(0.04, 9);
    expect(blackFloor(1, 2, s)).toBeCloseTo(0.02, 9);
    const c = { ...s, blackLevelCompensation: true };
    expect(blackFloor(1, 2, c)).toBeCloseTo(blackFloor(2, 2, c), 9);
    expect(compositeLight([0], [1], 2, c)).toBeCloseTo(compositeLight([0, 0], [0.5, 0.5], 2, c), 9);
  });

  it('normalize clamps and defaults', () => {
    const n = normalizeBlendSettings({ width: 9, exponent: -1, curve: 'bogus' as never, blackLevel: 1 });
    expect(n.width).toBe(1);
    expect(n.exponent).toBe(0.5);
    expect(n.curve).toBe('smoothstep');
    expect(n.blackLevel).toBe(0.1);
    expect(normalizeBlendSettings(undefined)).toEqual(DEFAULT_BLEND_SETTINGS);
  });
});
