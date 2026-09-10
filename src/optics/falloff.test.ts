import { describe, expect, it } from 'vitest';
import { falloffIntensity, falloffReferenceDistance } from './falloff';
import { DEFAULT_PROJECTORS } from '../store/defaultScene';

describe('falloff', () => {
  it('uses inverse-square falloff relative to reference distance', () => {
    expect(falloffIntensity(6, 6)).toBeCloseTo(1, 5);
    expect(falloffIntensity(12, 6)).toBeCloseTo(0.25, 5);
    expect(falloffIntensity(3, 6)).toBe(1);
  });

  it('derives reference distance from projector to look-at target', () => {
    const projector = DEFAULT_PROJECTORS[0];
    expect(falloffReferenceDistance(projector)).toBeCloseTo(6, 5);
  });
});
