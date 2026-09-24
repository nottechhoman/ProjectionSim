import { describe, expect, it } from 'vitest';
import type { ProjectorConfig, SceneObject } from '../types';
import { DEFAULT_BLEND_SETTINGS } from '../types';
import { eulerYXZToQuaternion } from '../utils/euler';
import { computeBlendAnalysis } from './blendAnalysis';

const screen: SceneObject = {
  id: 's',
  name: 'Screen',
  type: 'screen',
  transform: { position: { x: 0, y: 1.5, z: 0 }, quaternion: eulerYXZToQuaternion(0, 0, 0) },
  visibleInEditor: true,
  receivesProjection: true,
  blocksProjection: false,
  dimensions: { width: 6, height: 2 },
};

const makeProjector = (x: number, id: string): ProjectorConfig => ({
  id,
  name: id,
  enabled: true,
  color: '#fff',
  transform: { position: { x, y: 1.5, z: 6 }, quaternion: eulerYXZToQuaternion(0, 0, 0) },
  optics: {
    throwRatio: 1.5,
    resolution: { width: 1920, height: 1080 },
    aspectRatio: 16 / 9,
    lensShiftH: 0,
    lensShiftV: 0,
    nearLimit: 0.1,
    farLimit: 100,
  },
  testPattern: 'white',
  brightness: 1,
  mediaSource: 'pattern',
  mediaAssetId: null,
  mediaFit: 'contain',
  blendEdges: { left: 0, right: 0, top: 0, bottom: 0 },
  blendGamma: 1,
  outerEdgeFade: false,
});

describe('v2 blend uniformity analysis', () => {
  const projectors = [makeProjector(-1.6, 'a'), makeProjector(1.6, 'b')];

  it('unblended overlap doubles brightness', () => {
    const r = computeBlendAnalysis(screen, projectors, DEFAULT_BLEND_SETTINGS)!;
    expect(r.maxOverlap).toBe(2);
    expect(r.overlapMaxSum!).toBeCloseTo(2, 5);
    expect(r.uniformFraction).toBeLessThan(0.9);
  });

  it('auto blend is seamless across the overlap', () => {
    const r = computeBlendAnalysis(screen, projectors, { ...DEFAULT_BLEND_SETTINGS, mode: 'auto' })!;
    expect(r.overlapSamples).toBeGreaterThan(0);
    expect(r.worstSeamDeviation).toBeLessThan(1e-6);
    expect(r.uniformFraction).toBeCloseTo(1, 6);
  });

  it('auto blend without gamma correction shows a dark crossover', () => {
    const r = computeBlendAnalysis(screen, projectors, {
      ...DEFAULT_BLEND_SETTINGS,
      mode: 'auto',
      gammaCorrect: false,
    })!;
    expect(r.overlapMinSum!).toBeLessThan(0.7);
  });

  it('keystone warp shrinks coverage but stays seamless', () => {
    const warped = projectors.map((p) => ({
      ...p,
      warp: {
        enabled: true,
        corners: [
          { x: 0.05, y: 0.1 },
          { x: 0.95, y: 0 },
          { x: 0.95, y: 1 },
          { x: 0.05, y: 0.9 },
        ] as [never, never, never, never],
      },
    }));
    const base = computeBlendAnalysis(screen, projectors, { ...DEFAULT_BLEND_SETTINGS, mode: 'auto' })!;
    const r = computeBlendAnalysis(screen, warped, { ...DEFAULT_BLEND_SETTINGS, mode: 'auto' })!;
    expect(r.coveredSamples).toBeLessThan(base.coveredSamples);
    expect(r.worstSeamDeviation).toBeLessThan(1e-6);
  });

  it('returns null without a flat/curved target', () => {
    expect(computeBlendAnalysis(null, projectors, DEFAULT_BLEND_SETTINGS)).toBeNull();
  });
});
