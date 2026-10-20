import { describe, expect, it } from 'vitest';
import type { KeyframeEase, ObjectAnimation, SceneObject, Track, Vec3 } from '../types';
import { ease } from './keyframes';
import { evaluateFrame } from './evaluate';
import {
  evaluateObjects,
  isStopped,
  normalizeObjectAnimations,
  objectsAt,
  positionPath,
  pruneObjectAnimations,
  removeObjectKey,
  resolveObjectTransform,
  setObjectKey,
  updateObjectKey,
} from './objectAnimation';
import { eulerYXZToQuaternion, quaternionToEulerYXZ } from '../utils/euler';

const screen: SceneObject = {
  id: 'screen-1',
  name: 'Screen',
  type: 'screen',
  transform: { position: { x: 0, y: 1.5, z: 0 }, quaternion: eulerYXZToQuaternion(10, 0, 0) },
  visibleInEditor: true,
  receivesProjection: true,
  blocksProjection: false,
  dimensions: { width: 4, height: 2.25 },
};

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const key = (timeSec: number, value: Vec3, e: KeyframeEase = 'linear', id = `k${timeSec}`) => ({ id, timeSec, value, ease: e });
const track = (anim?: ObjectAnimation): Pick<Track, 'objectAnimations'> => (anim ? { objectAnimations: { 'screen-1': anim } } : {});

describe('object animation evaluate', () => {
  it('no animation → static transform, nothing resolved', () => {
    expect(evaluateObjects(track(), 3, [screen]).size).toBe(0);
    expect(evaluateObjects(track({}), 3, [screen]).size).toBe(0);
    const r = resolveObjectTransform(screen, undefined, 3);
    expect(r.position).toEqual(screen.transform.position);
    expect(r.quaternion).toEqual(screen.transform.quaternion);
    expect(r.scale).toEqual(v(1, 1, 1));
  });

  for (const e of ['linear', 'easeInOut'] as const) {
    it(`interpolates position with ${e} easing and holds outside the keys`, () => {
      const anim: ObjectAnimation = { position: [key(1, v(0, 0, 0), e), key(3, v(4, 2, -2), e)] };
      const at = (t: number) => evaluateObjects(track(anim), t, [screen]).get('screen-1')!.position;
      expect(at(0)).toEqual(v(0, 0, 0));
      expect(at(5)).toEqual(v(4, 2, -2));
      const u = ease(e, 0.25);
      const p = at(1.5);
      expect(p.x).toBeCloseTo(4 * u, 12);
      expect(p.y).toBeCloseTo(2 * u, 12);
      expect(p.z).toBeCloseTo(-2 * u, 12);
      if (e === 'easeInOut') expect(p.x).toBeLessThan(1); // slower start than linear
    });
  }

  it('rotation keys are Euler degrees (x pitch, y yaw, z roll), other channels stay static', () => {
    const anim: ObjectAnimation = { rotation: [key(0, v(0, 0, 0)), key(2, v(20, 90, 0))] };
    const r = evaluateObjects(track(anim), 1, [screen]).get('screen-1')!;
    const e = quaternionToEulerYXZ(r.quaternion);
    expect(e.pitch).toBeCloseTo(10, 6);
    expect(e.yaw).toBeCloseTo(45, 6);
    expect(e.roll).toBeCloseTo(0, 6);
    expect(r.position).toEqual(screen.transform.position);
  });

  it('scale multiplies the size for calculations', () => {
    const anim: ObjectAnimation = { scale: [key(0, v(1, 1, 1)), key(2, v(2, 0.5, 1))] };
    const [o] = objectsAt(track(anim) as Track, [screen], 2);
    expect(o.dimensions).toEqual({ width: 8, height: 1.125 });
  });

  it('stopped (not playing, playhead at 0) shows the static transform', () => {
    const anim: ObjectAnimation = { position: [key(0, v(9, 9, 9))] };
    expect(isStopped(false, 0)).toBe(true);
    expect(isStopped(true, 0)).toBe(false);
    expect(isStopped(false, 0.5)).toBe(false);
    expect(objectsAt(track(anim) as Track, [screen], 0)[0]).toBe(screen);
    expect(objectsAt(track(anim) as Track, [screen], 0, true)[0].transform.position).toEqual(v(9, 9, 9));
  });

  it('evaluateFrame returns layers and object transforms', () => {
    const t: Track = { id: 't', name: 'T', durationSec: 10, layers: [], sections: [], cues: [], objectAnimations: { 'screen-1': { position: [key(0, v(1, 2, 3))] } } };
    const f = evaluateFrame(t, 1, [screen]);
    expect(f.layers).toEqual([]);
    expect(f.objects.get('screen-1')!.position).toEqual(v(1, 2, 3));
  });

  it('path samples the position keys', () => {
    const path = positionPath({ position: [key(0, v(0, 0, 0)), key(2, v(2, 0, 0))] }, 10, 3);
    expect(path).toEqual([v(0, 0, 0), v(1, 0, 0), v(2, 0, 0)]);
    expect(positionPath({ position: [key(0, v(0, 0, 0))] }, 10)).toEqual([]);
  });
});

describe('object animation editing', () => {
  it('sets, replaces within half a frame, retimes, eases and removes keys', () => {
    let { anim, keyId } = setObjectKey(undefined, 'position', 1, v(1, 0, 0), 'a');
    expect(keyId).toBe('a');
    ({ anim } = setObjectKey(anim, 'position', 3, v(3, 0, 0), 'b'));
    const again = setObjectKey(anim, 'position', 1.01, v(5, 0, 0), 'c');
    expect(again.keyId).toBe('a');
    expect(again.anim.position!.map((k) => k.value.x)).toEqual([5, 3]);
    anim = updateObjectKey(again.anim, 'position', 'a', { timeSec: 4, ease: 'easeInOut' })!;
    expect(anim.position!.map((k) => k.id)).toEqual(['b', 'a']);
    expect(anim.position![1].ease).toBe('easeInOut');
    anim = removeObjectKey(anim, 'position', 'b')!;
    anim = removeObjectKey(anim, 'position', 'a')!;
    expect(anim).toEqual({});
  });

  it('loads only valid keys and keeps empty entries (the Animate switch)', () => {
    const out = normalizeObjectAnimations({
      a: { position: [{ id: 'k', timeSec: 2, value: { x: 1, y: 2, z: 3 }, ease: 'easeInOut' }, { timeSec: 'x' }], rotation: 'nope' },
      b: {},
      c: 5,
    })!;
    expect(out.a.position).toEqual([{ id: 'k', timeSec: 2, value: { x: 1, y: 2, z: 3 }, ease: 'easeInOut' }]);
    expect(out.a.rotation).toBeUndefined();
    expect(out.b).toEqual({});
    expect(out).not.toHaveProperty('c');
    expect(normalizeObjectAnimations(null)).toBeUndefined();
  });

  it('prunes animations of deleted objects', () => {
    const anims = { a: {}, b: {} };
    expect(pruneObjectAnimations(anims, new Set(['a', 'b']))).toBe(anims);
    expect(pruneObjectAnimations(anims, new Set(['a']))).toEqual({ a: {} });
    expect(pruneObjectAnimations(anims, new Set())).toBeUndefined();
  });
});
