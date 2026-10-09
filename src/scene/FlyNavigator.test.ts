import { describe, expect, it } from 'vitest';
import { clampPitch, FAST_FACTOR, flyDelta, MAX_SPEED, MIN_SPEED, nextSpeed, NO_KEYS } from './FlyNavigator';

describe('fly navigation maths', () => {
  it('W moves along the view direction, A/D strafe, Q/E change height', () => {
    const fwd = flyDelta({ ...NO_KEYS, forward: true }, 0, 0, 2, 0.5);
    expect(fwd.x).toBeCloseTo(0, 9);
    expect(fwd.z).toBeCloseTo(-1, 9);
    const right = flyDelta({ ...NO_KEYS, right: true }, 0, 0, 2, 0.5);
    expect(right.x).toBeCloseTo(1, 9);
    const up = flyDelta({ ...NO_KEYS, up: true }, 0, 0, 2, 0.5);
    expect(up.y).toBeCloseTo(1, 9);
    // Looking 90° left (yaw +90°): forward is -X.
    const turned = flyDelta({ ...NO_KEYS, forward: true }, Math.PI / 2, 0, 1, 1);
    expect(turned.x).toBeCloseTo(-1, 9);
    expect(turned.z).toBeCloseTo(0, 9);
  });

  it('diagonals are not faster; Shift multiplies; nothing pressed = no move', () => {
    const diag = flyDelta({ ...NO_KEYS, forward: true, right: true }, 0, 0, 2, 1);
    expect(diag.length()).toBeCloseTo(2, 9);
    expect(flyDelta({ ...NO_KEYS, forward: true, fast: true }, 0, 0, 2, 1).length()).toBeCloseTo(2 * FAST_FACTOR, 9);
    expect(flyDelta(NO_KEYS, 0, 0, 2, 1).length()).toBe(0);
  });

  it('pitch is clamped short of straight up / down; wheel speed stays in range', () => {
    expect(clampPitch(3)).toBeLessThan(Math.PI / 2);
    expect(clampPitch(-3)).toBeGreaterThan(-Math.PI / 2);
    expect(nextSpeed(3, -1)).toBeCloseTo(3.75, 9);
    expect(nextSpeed(3, 1)).toBeCloseTo(2.4, 9);
    expect(nextSpeed(MAX_SPEED, -1)).toBe(MAX_SPEED);
    expect(nextSpeed(MIN_SPEED, 1)).toBe(MIN_SPEED);
  });
});
