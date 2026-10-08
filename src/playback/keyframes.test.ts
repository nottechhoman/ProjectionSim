import { describe, expect, it } from 'vitest';
import { createLayer, createTrack, normalizeLayer } from '../mapping/model';
import type { Keyframe } from '../types';
import { evaluate } from './evaluate';
import { animateLayer, ease, keyAt, sampleKeyframes, upsertKeyframe, withPropKeys } from './keyframes';

const k = (timeSec: number, value: number, e: Keyframe['ease'] = 'linear', id = `k${timeSec}`): Keyframe => ({ id, timeSec, value, ease: e });

describe('keyframe sampling', () => {
  it('holds before the first and after the last key, interpolates linearly between', () => {
    const keys = [k(2, 10), k(4, 20)];
    expect(sampleKeyframes(keys, 0, 99)).toBe(10);
    expect(sampleKeyframes(keys, 3, 99)).toBeCloseTo(15, 9);
    expect(sampleKeyframes(keys, 9, 99)).toBe(20);
    expect(sampleKeyframes([], 3, 99)).toBe(99);
    expect(sampleKeyframes(undefined, 3, 7)).toBe(7);
  });

  it('ease in/out shapes the segment that starts at the eased key', () => {
    expect(ease('easeInOut', 0.5)).toBeCloseTo(0.5, 9);
    expect(ease('easeInOut', 0.25)).toBeLessThan(0.25);
    expect(ease('easeInOut', 0.75)).toBeGreaterThan(0.75);
    const keys = [k(0, 0, 'easeInOut'), k(1, 1)];
    expect(sampleKeyframes(keys, 0.25, 0)).toBeCloseTo(0.0625, 9);
    expect(sampleKeyframes([k(0, 0), k(1, 1)], 0.25, 0)).toBeCloseTo(0.25, 9);
  });

  it('keys need not be stored in order', () => {
    expect(sampleKeyframes([k(4, 20), k(2, 10)], 3, 0)).toBeCloseTo(15, 9);
  });
});

describe('animated layer', () => {
  it('x / y / rotation override the rect; scale grows it about its centre; opacity is clamped', () => {
    const layer = createLayer({ kind: 'solid', color: '#fff' }, 'm', {
      rect: { x: 0.25, y: 0.25, width: 0.5, height: 0.5, rotationDeg: 0 },
      keyframes: {
        x: [k(0, 0), k(2, 0.5)],
        scale: [k(0, 1), k(2, 2)],
        rotationDeg: [k(0, 0), k(2, 90)],
        opacity: [k(0, 1.5), k(2, 0)],
      },
    });
    const a = animateLayer(layer, 1);
    expect(a.rect.width).toBeCloseTo(0.75, 9);
    expect(a.rect.x).toBeCloseTo(0.25 - 0.125, 9);
    expect(a.rect.y).toBeCloseTo(0.25 - 0.125, 9);
    expect(a.rect.rotationDeg).toBeCloseTo(45, 9);
    expect(a.opacity).toBeCloseTo(0.75, 9);
    expect(animateLayer(layer, 0).opacity).toBe(1);
  });

  it('evaluate uses layer-local time and multiplies fades on the animated opacity', () => {
    const layer = createLayer({ kind: 'solid', color: '#fff' }, 'm', {
      startSec: 10,
      durationSec: 10,
      fadeInSec: 2,
      keyframes: { opacity: [k(0, 0.5), k(4, 1)], y: [k(0, 0), k(4, 0.4)] },
    });
    const [live] = evaluate(createTrack('T', [layer]), 11);
    expect(live.opacity).toBeCloseTo(0.625 * 0.5, 9);
    expect(live.rect.y).toBeCloseTo(0.1, 9);
  });

  it('a layer without keyframes keeps its rect object', () => {
    const layer = createLayer({ kind: 'solid', color: '#fff' }, 'm');
    expect(evaluate(createTrack('T', [layer]), 1)[0].rect).toBe(layer.rect);
  });
});

describe('keyframe editing helpers', () => {
  it('upsert replaces a key within half a frame and keeps order', () => {
    let keys = upsertKeyframe(undefined, k(2, 1));
    keys = upsertKeyframe(keys, k(1, 0));
    keys = upsertKeyframe(keys, { ...k(2.01, 5), id: 'new' });
    expect(keys.map((x) => [x.timeSec, x.value])).toEqual([[1, 0], [2.01, 5]]);
    expect(keyAt(keys, 2)?.id).toBe('new');
    expect(keyAt(keys, 1.5)).toBeNull();
  });

  it('empty prop lists are dropped; keyframes survive normalize', () => {
    expect(withPropKeys({ x: [k(0, 1)] }, 'x', [])).toBeUndefined();
    const layer = normalizeLayer({ media: { kind: 'solid', color: '#fff' }, keyframes: { scale: [{ timeSec: 1, value: 2, ease: 'easeInOut' }, { timeSec: 'bad' }] } }, 0)!;
    expect(layer.keyframes?.scale).toEqual([{ id: 'key-scale-0', timeSec: 1, value: 2, ease: 'easeInOut' }]);
  });
});
