import { describe, expect, it } from 'vitest';
import { blendChannel, blendOver, linearToSrgb, srgbToLinear, type Rgb } from './sample';
import { LAYER_BLEND_MODES, normalizeLayer } from './model';

const grey = (v: number): Rgb => [srgbToLinear(v), srgbToLinear(v), srgbToLinear(v)];
const enc = (c: Rgb) => c.map((x) => Math.round(linearToSrgb(x) * 255));

describe('layer blend modes', () => {
  it('keeps normal / add / multiply as before', () => {
    expect(blendOver([0.2, 0.2, 0.2], [0.6, 0.6, 0.6], 0.5, 'normal')).toEqual([0.4, 0.4, 0.4]);
    expect(blendOver([0.2, 0.2, 0.2], [0.6, 0.6, 0.6], 0.5, 'add')[0]).toBeCloseTo(0.5, 6);
    expect(blendOver([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], 1, 'multiply')[0]).toBeCloseTo(0.25, 6);
  });

  it('computes the Photoshop formulas on sRGB values', () => {
    // 50 % grey over 50 % grey (display values).
    expect(enc(blendOver(grey(0.5), grey(0.5), 1, 'screen'))[0]).toBe(191);
    expect(enc(blendOver(grey(0.5), grey(0.5), 1, 'overlay'))[0]).toBe(128);
    expect(enc(blendOver(grey(0.25), grey(0.75), 1, 'overlay'))[0]).toBe(96);
    expect(enc(blendOver(grey(0.75), grey(0.25), 1, 'overlay'))[0]).toBe(159);
    expect(enc(blendOver(grey(0.25), grey(0.75), 1, 'lighten'))[0]).toBe(191);
    expect(enc(blendOver(grey(0.25), grey(0.75), 1, 'darken'))[0]).toBe(64);
    expect(enc(blendOver(grey(0.25), grey(0.75), 1, 'difference'))[0]).toBe(128);
  });

  it('soft light leaves 50 % grey neutral and is continuous', () => {
    for (const d of [0.1, 0.3, 0.6, 0.9]) expect(blendChannel(d, 0.5, 'softLight')).toBeCloseTo(d, 6);
    expect(blendChannel(0.25, 0.8, 'softLight')).toBeCloseTo(blendChannel(0.2500001, 0.8, 'softLight'), 4);
  });

  it('opacity mixes the blended result with what is below', () => {
    const half = blendOver(grey(0.5), grey(1), 0.5, 'screen');
    const below = grey(0.5)[0];
    expect(half[0]).toBeCloseTo((below + 1) / 2, 6);
  });

  it('loads every mode from a saved project and falls back to normal', () => {
    for (const mode of LAYER_BLEND_MODES) {
      expect(normalizeLayer({ id: 'l', blendMode: mode }, 0)!.blendMode).toBe(mode);
    }
    expect(normalizeLayer({ id: 'l', blendMode: 'bogus' }, 0)!.blendMode).toBe('normal');
  });
});
