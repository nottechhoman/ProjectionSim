import { describe, expect, it } from 'vitest';
import { blendLinearColors, normalizeBlendWeights, rawBlendWeight } from './blendWeights';

describe('Acceptance Test 5: Blending weights', () => {
  it('normalizes equal overlap weights to sum to 1', () => {
    const w1 = rawBlendWeight(0.5, 0.5, { left: 0.1, right: 0.1, top: 0, bottom: 0 }, false);
    const w2 = rawBlendWeight(0.5, 0.5, { left: 0.1, right: 0.1, top: 0, bottom: 0 }, false);
    const normalized = normalizeBlendWeights([w1, w2]);
    expect(normalized[0] + normalized[1]).toBeCloseTo(1, 5);
    expect(normalized[0]).toBeCloseTo(0.5, 3);
  });

  it('blended linear light avoids double brightness in overlap', () => {
    const white: [number, number, number] = [1, 1, 1];
    const blended = blendLinearColors([white, white], [1, 1]);
    expect(blended[0]).toBeCloseTo(1, 5);
    expect(blended[1]).toBeCloseTo(1, 5);
    expect(blended[2]).toBeCloseTo(1, 5);

    const unblended = [white[0] + white[0], white[1] + white[1], white[2] + white[2]];
    expect(unblended[0]).toBeCloseTo(2, 5);
    expect(blended[0]).toBeLessThan(unblended[0]);
  });
});
