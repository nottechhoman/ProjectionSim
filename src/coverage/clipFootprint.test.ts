import { describe, it, expect } from 'vitest';
import { clipFootprintAreaToScreen } from './clipFootprint';

describe('clipFootprintAreaToScreen', () => {
  it('returns full area when footprint fits inside screen', () => {
    const area = clipFootprintAreaToScreen(
      [
        { x: -1, y: 1.5, z: 0 },
        { x: 1, y: 1.5, z: 0 },
        { x: 1, y: 2.5, z: 0 },
        { x: -1, y: 2.5, z: 0 },
      ],
      {
        center: { x: 0, y: 1.5, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        width: 6,
        height: 3.375,
      },
    );
    expect(area).toBeCloseTo(2, 4);
  });

  it('clips area when footprint exceeds screen bounds', () => {
    const area = clipFootprintAreaToScreen(
      [
        { x: -4, y: 0, z: 0 },
        { x: 4, y: 0, z: 0 },
        { x: 4, y: 3, z: 0 },
        { x: -4, y: 3, z: 0 },
      ],
      {
        center: { x: 0, y: 1.5, z: 0 },
        normal: { x: 0, y: 0, z: 1 },
        width: 6,
        height: 3.375,
      },
    );
    expect(area).toBeCloseTo(18, 2);
    expect(area).toBeLessThan(24);
  });
});
