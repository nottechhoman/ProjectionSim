import { describe, expect, it } from 'vitest';
import { blendWeightWithGamma } from '../blending/blendWeights';
import { rasterPreviewRamp, rasterPreviewSize } from './rasterPreview';

describe('raster preview ramp', () => {
  it('matches blendWeights.ts for the same UV, edges, gamma, and brightness', () => {
    const edges = { left: 0, right: 0.2, top: 0, bottom: 0 };
    for (const u of [0.05, 0.5, 0.85, 0.95, 1]) {
      const preview = rasterPreviewRamp(u, 0.5, edges, false, 1, 0.35);
      const expected = blendWeightWithGamma(u, 0.5, edges, false, 1) * 0.35;
      expect(preview).toBeCloseTo(expected, 10);
    }
  });

  it('falls off toward the right edge for projector 1 matched feather', () => {
    const edges = { left: 0, right: 0.2, top: 0, bottom: 0 };
    const left = rasterPreviewRamp(0.1, 0.5, edges, false, 1, 1);
    const midFeather = rasterPreviewRamp(0.9, 0.5, edges, false, 1, 1);
    const right = rasterPreviewRamp(1, 0.5, edges, false, 1, 1);
    expect(left).toBeCloseTo(1, 5);
    expect(midFeather).toBeGreaterThan(0);
    expect(midFeather).toBeLessThan(1);
    expect(right).toBeCloseTo(0, 5);
    expect(left).toBeGreaterThan(midFeather);
    expect(midFeather).toBeGreaterThan(right);
  });

  it('falls off toward the left edge for projector 2 matched feather', () => {
    const edges = { left: 0.2, right: 0, top: 0, bottom: 0 };
    const left = rasterPreviewRamp(0, 0.5, edges, false, 1, 1);
    const midFeather = rasterPreviewRamp(0.1, 0.5, edges, false, 1, 1);
    const right = rasterPreviewRamp(0.9, 0.5, edges, false, 1, 1);
    expect(left).toBeCloseTo(0, 5);
    expect(midFeather).toBeGreaterThan(0);
    expect(midFeather).toBeLessThan(1);
    expect(right).toBeCloseTo(1, 5);
  });
});

describe('raster preview size', () => {
  it('keeps projector aspect and stays within the phone cap', () => {
    const size = rasterPreviewSize(16 / 9, 'phone', 16384);
    expect(size.width / size.height).toBeCloseTo(16 / 9, 2);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(256);
  });

  it('uses a larger desktop long edge than phone', () => {
    const phone = rasterPreviewSize(16 / 9, 'phone', 16384);
    const desktop = rasterPreviewSize(16 / 9, 'desktop', 16384);
    expect(desktop.width).toBeGreaterThan(phone.width);
  });

  it('respects maxTextureSize when it is smaller than the profile cap', () => {
    const size = rasterPreviewSize(16 / 9, 'desktop', 128);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(128);
  });
});
