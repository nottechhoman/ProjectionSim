import { describe, expect, it } from 'vitest';
import { DEFAULT_BLEND_GAMMA } from '../types';
import {
  additiveBlendBrightness,
  blendWeightWithGamma,
  rawBlendWeight,
} from './blendWeights';

describe('additive blend (shader-aligned)', () => {
  it('single projector feather produces a visible ramp and dims additive output', () => {
    const edges = { left: 0, right: 0.25, top: 0, bottom: 0 };
    const uMidFeather = 0.9;
    const w = blendWeightWithGamma(uMidFeather, 0.5, edges, false, DEFAULT_BLEND_GAMMA);
    expect(w).toBeGreaterThan(0);
    expect(w).toBeLessThan(1);
    const brightness = additiveBlendBrightness([w]);
    expect(brightness).toBeLessThan(1);
    expect(brightness).toBeCloseTo(w, 5);
  });

  it('matched complementary ramps at DEFAULT_BLEND_GAMMA sum to ~1 at crossover', () => {
    const overlapFrac = 0.2;
    const uLeft = 0.9;
    const uRight = 0.1;
    const wLeft = blendWeightWithGamma(
      uLeft,
      0.5,
      { left: 0, right: overlapFrac, top: 0, bottom: 0 },
      false,
      DEFAULT_BLEND_GAMMA,
    );
    const wRight = blendWeightWithGamma(
      uRight,
      0.5,
      { left: overlapFrac, right: 0, top: 0, bottom: 0 },
      false,
      DEFAULT_BLEND_GAMMA,
    );
    expect(wLeft + wRight).toBeCloseTo(1, 2);
    const overlapBrightness = additiveBlendBrightness([wLeft, wRight]);
    const soloBrightness = additiveBlendBrightness([1]);
    expect(overlapBrightness).toBeCloseTo(soloBrightness, 2);
  });

  it('gamma 2.2 on matched ramps creates a dark crossover (regression guard)', () => {
    const overlapFrac = 0.2;
    const wLeft = blendWeightWithGamma(
      0.9,
      0.5,
      { left: 0, right: overlapFrac, top: 0, bottom: 0 },
      false,
      2.2,
    );
    const wRight = blendWeightWithGamma(
      0.1,
      0.5,
      { left: overlapFrac, right: 0, top: 0, bottom: 0 },
      false,
      2.2,
    );
    expect(wLeft + wRight).toBeCloseTo(0.435, 2);
  });

  it('mismatched ramps do not sum to 1 (seam would be visible)', () => {
    const uLeft = 0.9;
    const uRight = 0.1;
    const wLeft = blendWeightWithGamma(
      uLeft,
      0.5,
      { left: 0, right: 0.2, top: 0, bottom: 0 },
      false,
      2.2,
    );
    const wRight = blendWeightWithGamma(
      uRight,
      0.5,
      { left: 0.1, right: 0, top: 0, bottom: 0 },
      false,
      2.2,
    );
    const sum = wLeft + wRight;
    expect(Math.abs(sum - 1)).toBeGreaterThan(0.05);
    const overlapBrightness = additiveBlendBrightness([wLeft, wRight]);
    expect(Math.abs(overlapBrightness - 1)).toBeGreaterThan(0.05);
  });

  it('blend gamma changes ramp shape', () => {
    const edges = { left: 0, right: 0.3, top: 0, bottom: 0 };
    const u = 0.85;
    const wLinear = rawBlendWeight(u, 0.5, edges, false);
    const wLowGamma = blendWeightWithGamma(u, 0.5, edges, false, 1);
    const wHighGamma = blendWeightWithGamma(u, 0.5, edges, false, 2.2);
    expect(wLowGamma).toBeCloseTo(wLinear, 5);
    expect(wHighGamma).toBeLessThan(wLowGamma);
    expect(wHighGamma).toBeGreaterThan(0);
  });
});
