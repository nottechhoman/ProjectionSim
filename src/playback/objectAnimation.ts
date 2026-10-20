import type { Keyframe, KeyframeEase, ObjectAnimation, ObjectChannel, SceneObject, Track, Vec3 } from '../types';
import { eulerYXZToQuaternion, quaternionToEulerYXZ } from '../utils/euler';
import { keyAt, sampleChannel, upsertKeyframe } from './keyframes';

/**
 * v10 scene-object animation (pure). Keys live on the track (track time, seconds);
 * evaluateObjects() resolves each animated object's transform at time t.
 *
 * The rule for what the 3D view shows: while playing, or paused anywhere but the
 * very start, animated objects take their animated transform; stopped (not playing
 * and playhead at 0) they show their static Inspector transform.
 */

export const OBJECT_CHANNELS: ObjectChannel[] = ['position', 'rotation', 'scale'];
export const OBJECT_CHANNEL_LABEL: Record<ObjectChannel, string> = {
  position: 'Position',
  rotation: 'Rotation',
  scale: 'Scale',
};
export const OBJECT_CHANNEL_COLOR: Record<ObjectChannel, string> = {
  position: '#ff7a7a',
  rotation: '#8fb8ff',
  scale: '#ffd25a',
};

export const STATIC_SCALE: Vec3 = { x: 1, y: 1, z: 1 };

export interface ResolvedTransform {
  position: Vec3;
  quaternion: [number, number, number, number];
  scale: Vec3;
}

/** Stopped = not playing and the playhead at the start (decision C, Phase 1). */
export function isStopped(playing: boolean, t: number): boolean {
  return !playing && t <= 1e-6;
}

const lerpVec3 = (a: Vec3, b: Vec3, u: number): Vec3 => ({
  x: a.x + (b.x - a.x) * u,
  y: a.y + (b.y - a.y) * u,
  z: a.z + (b.z - a.z) * u,
});

export function sampleVec3(keys: readonly Keyframe<Vec3>[] | undefined, t: number, fallback: Vec3): Vec3 {
  return sampleChannel(keys, t, fallback, lerpVec3);
}

/** The static (un-animated) value of a channel, as the Inspector shows it. */
export function staticChannelValue(obj: Pick<SceneObject, 'transform'>, channel: ObjectChannel): Vec3 {
  if (channel === 'position') return { ...obj.transform.position };
  if (channel === 'scale') return { ...STATIC_SCALE };
  const e = quaternionToEulerYXZ(obj.transform.quaternion);
  return { x: e.pitch, y: e.yaw, z: e.roll };
}

export function hasKeys(anim: ObjectAnimation | undefined): boolean {
  return !!anim && OBJECT_CHANNELS.some((c) => (anim[c]?.length ?? 0) > 0);
}

/** Channel value at t (static value when the channel has no keys). */
export function channelValueAt(obj: Pick<SceneObject, 'transform'>, anim: ObjectAnimation | undefined, channel: ObjectChannel, t: number): Vec3 {
  return sampleVec3(anim?.[channel], t, staticChannelValue(obj, channel));
}

/** One object's transform at t. Without keys it is the static transform. */
export function resolveObjectTransform(obj: Pick<SceneObject, 'transform'>, anim: ObjectAnimation | undefined, t: number): ResolvedTransform {
  const position = anim?.position?.length ? sampleVec3(anim.position, t, obj.transform.position) : { ...obj.transform.position };
  let quaternion = obj.transform.quaternion;
  if (anim?.rotation?.length) {
    const r = sampleVec3(anim.rotation, t, staticChannelValue(obj, 'rotation'));
    quaternion = eulerYXZToQuaternion(r.y, r.x, r.z);
  }
  const scale = anim?.scale?.length ? sampleVec3(anim.scale, t, STATIC_SCALE) : { ...STATIC_SCALE };
  return { position, quaternion: [...quaternion] as ResolvedTransform['quaternion'], scale };
}

/**
 * Resolved transforms of the track's animated objects at t (objects without keys
 * are left out: they keep their static transform). Pure.
 */
export function evaluateObjects(track: Pick<Track, 'objectAnimations'>, t: number, objects: readonly SceneObject[]): Map<string, ResolvedTransform> {
  const out = new Map<string, ResolvedTransform>();
  const anims = track.objectAnimations;
  if (!anims) return out;
  for (const obj of objects) {
    const anim = anims[obj.id];
    if (!hasKeys(anim)) continue;
    out.set(obj.id, resolveObjectTransform(obj, anim, t));
  }
  return out;
}

/** The objects as they stand at t (stopped → static), for calculations. */
export function objectsAt(track: Pick<Track, 'objectAnimations'>, objects: SceneObject[], t: number, playing = false): SceneObject[] {
  if (isStopped(playing, t) || !track.objectAnimations) return objects;
  const resolved = evaluateObjects(track, t, objects);
  if (resolved.size === 0) return objects;
  return objects.map((o) => {
    const r = resolved.get(o.id);
    return r ? scaledObject(o, r) : o;
  });
}

function scaledDimensions(o: SceneObject, s: Vec3): SceneObject['dimensions'] {
  const d = o.dimensions;
  return { width: d.width * s.x, height: d.height * s.y, ...(d.depth !== undefined ? { depth: d.depth * s.z } : {}) };
}

function scaledObject(o: SceneObject, r: ResolvedTransform): SceneObject {
  const s = r.scale;
  return {
    ...o,
    transform: { position: r.position, quaternion: r.quaternion },
    dimensions: scaledDimensions(o, s),
    ...(o.curved ? { curved: { ...o.curved, radius: o.curved.radius * s.x, height: o.curved.height * s.y } } : {}),
    ...(o.modelScale !== undefined || o.type === 'model' ? { modelScale: (o.modelScale ?? 1) * s.x } : {}),
  };
}

/** Position keys sampled along the track (for "Show path"). */
export function positionPath(anim: ObjectAnimation | undefined, durationSec: number, samples = 240): Vec3[] {
  const keys = anim?.position;
  if (!keys || keys.length < 2) return [];
  const t0 = keys[0].timeSec;
  const t1 = Math.min(durationSec, keys[keys.length - 1].timeSec);
  const n = Math.max(2, samples);
  return Array.from({ length: n }, (_, i) => sampleVec3(keys, t0 + ((t1 - t0) * i) / (n - 1), keys[0].value));
}

// ---- editing (pure) ---------------------------------------------------------

export function withChannel(anim: ObjectAnimation | undefined, channel: ObjectChannel, keys: Keyframe<Vec3>[]): ObjectAnimation {
  const next: ObjectAnimation = { ...(anim ?? {}) };
  if (keys.length > 0) next[channel] = keys;
  else delete next[channel];
  return next;
}

/** Set (insert or replace within half a frame) a key at t. */
export function setObjectKey(
  anim: ObjectAnimation | undefined,
  channel: ObjectChannel,
  t: number,
  value: Vec3,
  newKeyId: string,
  frameSec = 1 / 30,
): { anim: ObjectAnimation; keyId: string } {
  const existing = keyAt(anim?.[channel], t, frameSec);
  const key: Keyframe<Vec3> = { id: existing?.id ?? newKeyId, timeSec: Math.max(0, t), value: { ...value }, ease: existing?.ease ?? 'linear' };
  return { anim: withChannel(anim, channel, upsertKeyframe(anim?.[channel], key, frameSec)), keyId: key.id };
}

export function updateObjectKey(
  anim: ObjectAnimation | undefined,
  channel: ObjectChannel,
  keyId: string,
  patch: Partial<Pick<Keyframe<Vec3>, 'timeSec' | 'value' | 'ease'>>,
): ObjectAnimation | undefined {
  const keys = anim?.[channel];
  if (!keys) return anim;
  const next = keys
    .map((k) => (k.id === keyId ? { ...k, ...patch, id: keyId, timeSec: Math.max(0, patch.timeSec ?? k.timeSec) } : k))
    .sort((a, b) => a.timeSec - b.timeSec);
  return withChannel(anim, channel, next);
}

export function removeObjectKey(anim: ObjectAnimation | undefined, channel: ObjectChannel, keyId: string): ObjectAnimation | undefined {
  const keys = anim?.[channel];
  if (!keys) return anim;
  return withChannel(anim, channel, keys.filter((k) => k.id !== keyId));
}

// ---- loading ----------------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Sanitise a track's objectAnimations; undefined when nothing valid is left. */
export function normalizeObjectAnimations(raw: unknown): Record<string, ObjectAnimation> | undefined {
  if (!isObject(raw)) return undefined;
  const out: Record<string, ObjectAnimation> = {};
  for (const [id, a] of Object.entries(raw)) {
    if (!isObject(a)) continue;
    const anim: ObjectAnimation = {};
    for (const channel of OBJECT_CHANNELS) {
      const list = a[channel];
      if (!Array.isArray(list)) continue;
      const keys = list
        .filter(isObject)
        .filter((k) => finite(k.timeSec) && isObject(k.value) && finite(k.value.x) && finite(k.value.y) && finite(k.value.z))
        .map((k, i) => {
          const v = k.value as Record<string, number>;
          return {
            id: typeof k.id === 'string' ? k.id : `key-${channel}-${i}`,
            timeSec: Math.max(0, k.timeSec as number),
            value: { x: v.x, y: v.y, z: v.z },
            ease: (k.ease === 'easeInOut' ? 'easeInOut' : 'linear') as KeyframeEase,
          };
        })
        .sort((p, q) => p.timeSec - q.timeSec);
      if (keys.length > 0) anim[channel] = keys;
    }
    // An entry with no keys is kept: it is the Inspector's "Animate" switch.
    out[id] = anim;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Drop animations of objects that no longer exist. Returns the same object when nothing changes. */
export function pruneObjectAnimations(
  anims: Record<string, ObjectAnimation> | undefined,
  objectIds: ReadonlySet<string>,
): Record<string, ObjectAnimation> | undefined {
  if (!anims) return anims;
  const ids = Object.keys(anims);
  if (ids.every((id) => objectIds.has(id))) return anims;
  const next: Record<string, ObjectAnimation> = {};
  for (const id of ids) if (objectIds.has(id)) next[id] = anims[id];
  return Object.keys(next).length > 0 ? next : undefined;
}
