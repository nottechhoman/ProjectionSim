import { useState } from 'react';
import { useAppStore } from '../../store';
import { activeTrack } from '../../mapping/model';
import type { ObjectChannel, SceneObject, Vec3 } from '../../types';
import { keyAt } from '../../playback/keyframes';
import {
  channelValueAt,
  hasKeys,
  isStopped,
  OBJECT_CHANNEL_COLOR,
  OBJECT_CHANNEL_LABEL,
  staticChannelValue,
} from '../../playback/objectAnimation';
import { usePlayhead, useTransportState } from '../../playback/useTransport';
import { formatTimecode } from '../../playback/timecode';
import { eulerYXZToQuaternion } from '../../utils/euler';
import { fromDisplayUnit, toDisplayUnit } from '../../utils/units';
import { NumInput } from '../components/NumInput';
import styles from './Inspector.module.css';

const AXES = ['x', 'y', 'z'] as const;
type Axis = (typeof AXES)[number];
const round = (v: number) => Math.round(v * 10000) / 10000;

/** Small "animated" badge (Scene list and Inspector). */
export function AnimatedBadge() {
  return (
    <span
      title="Animated on this track: follows its keys while playing or paused away from 0; stopped (playhead at 0) it shows its static transform."
      data-testid="animated-badge"
      style={{ fontSize: 10, padding: '0 5px', borderRadius: 4, background: '#5a4a12', color: '#ffd25a', marginLeft: 6, whiteSpace: 'nowrap' }}
    >
      animated
    </span>
  );
}

/**
 * v10 Transform section for scene objects: static transform plus the "Animate"
 * switch, per-channel "+" key buttons and the scale channel. While the object is
 * showing its animation (playing, or paused away from 0) the fields show animated
 * values: editing on a key updates it; between keys it offers "Add keyframe here".
 */
export function ObjectTransformSection({ obj }: { obj: SceneObject }) {
  const displayUnit = useAppStore((s) => s.displayUnit);
  const fps = useAppStore((s) => s.show.fps);
  const anim = useAppStore((s) => activeTrack(s.show).objectAnimations?.[obj.id]);
  const showPath = useAppStore((s) => s.showObjectPath);
  const setShowPath = useAppStore((s) => s.setShowObjectPath);
  const checkpoint = useAppStore((s) => s.pushSceneHistoryCheckpoint);
  const updateTransform = useAppStore((s) => s.updateSceneObjectTransform);
  const setAnimate = useAppStore((s) => s.setObjectAnimate);
  const setKey = useAppStore((s) => s.setObjectKeyframe);
  const updateKey = useAppStore((s) => s.updateObjectKeyframe);
  const t = usePlayhead();
  const { playing } = useTransportState();
  const [pending, setPending] = useState<{ channel: ObjectChannel; value: Vec3 } | null>(null);

  const animateOn = anim !== undefined;
  const stopped = isStopped(playing, t);
  const frame = 1 / fps;
  const showingAnimation = animateOn && hasKeys(anim) && !stopped;

  /** What the fields show for a channel right now. */
  const shown = (channel: ObjectChannel): Vec3 =>
    showingAnimation && anim?.[channel]?.length ? channelValueAt(obj, anim, channel, t) : staticChannelValue(obj, channel);

  const setStatic = (channel: ObjectChannel, v: Vec3) => {
    checkpoint();
    if (channel === 'position') updateTransform(obj.id, { position: v });
    else if (channel === 'rotation') updateTransform(obj.id, { quaternion: eulerYXZToQuaternion(v.y, v.x, v.z) });
  };

  const edit = (channel: ObjectChannel, axis: Axis, value: number) => {
    const next = { ...shown(channel), [axis]: value };
    const keys = anim?.[channel];
    const animated = animateOn && (keys?.length ?? 0) > 0 && !stopped;
    // Scale has no static value: with Animate on it is always keyed.
    if (!animated && channel !== 'scale') {
      setStatic(channel, next);
      return;
    }
    const here = keyAt(keys, t, frame);
    if (here) updateKey(obj.id, channel, here.id, { value: next });
    else setPending({ channel, value: next });
  };

  const row = (channel: ObjectChannel, axis: Axis, label: string) => {
    const v = (pending?.channel === channel ? pending.value : shown(channel))[axis];
    const isPos = channel === 'position';
    return (
      <NumInput
        key={`${channel}-${axis}`}
        label={label}
        value={round(isPos ? toDisplayUnit(v, displayUnit) : v)}
        step={channel === 'scale' ? 0.05 : 0.1}
        onChange={(n) => edit(channel, axis, isPos ? fromDisplayUnit(n, displayUnit) : n)}
      />
    );
  };

  const channelHeader = (channel: ObjectChannel) => {
    const keys = anim?.[channel] ?? [];
    const here = keyAt(keys, t, frame);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 2px' }}>
        <span style={{ fontSize: 12, flex: 1 }}>
          <span style={{ color: OBJECT_CHANNEL_COLOR[channel] }}>●</span> {OBJECT_CHANNEL_LABEL[channel]}
          {keys.length ? <span className={styles.hint}> · {keys.length} key{keys.length === 1 ? '' : 's'}</span> : null}
        </span>
        {animateOn ? (
          <button
            type="button"
            className={styles.actionBtn}
            style={{ padding: '2px 8px', marginTop: 0, color: here ? '#ffd25a' : undefined }}
            title={`Add a ${OBJECT_CHANNEL_LABEL[channel].toLowerCase()} key at the playhead (${formatTimecode(t, fps)}) with the current value`}
            data-testid={`object-key-add-${channel}`}
            onClick={() => {
              setPending(null);
              setKey(obj.id, channel, t, shown(channel));
            }}
          >
            {here ? '◆' : '+'}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className={styles.section} data-testid="object-transform">
      <div className={styles.sectionTitle}>
        Transform
        {hasKeys(anim) ? <AnimatedBadge /> : null}
      </div>
      <label className={styles.checkRow} title="Animate this object's position, rotation and scale on the active track">
        <input type="checkbox" checked={animateOn} onChange={(e) => setAnimate(obj.id, e.target.checked)} data-testid="object-animate" />
        Animate
      </label>
      {animateOn ? (
        <p className={styles.hint}>
          {showingAnimation
            ? `Showing the animation at ${formatTimecode(t, fps)}. Editing on a key changes it; between keys you can add one.`
            : 'Stopped (playhead at 0): the object shows its static transform below. Play or move the playhead to see the animation; + adds a key at the playhead.'}
        </p>
      ) : (
        <p className={styles.hint}>Click a value to type · drag gizmo rings for local X / Y / Z rotation</p>
      )}

      {channelHeader('position')}
      {row('position', 'x', 'Pos X')}
      {row('position', 'y', 'Pos Y')}
      {row('position', 'z', 'Pos Z')}
      {channelHeader('rotation')}
      {row('rotation', 'x', 'Rotation X')}
      {row('rotation', 'y', 'Rotation Y')}
      {row('rotation', 'z', 'Rotation Z')}
      {animateOn ? (
        <>
          {channelHeader('scale')}
          {row('scale', 'x', 'Scale X')}
          {row('scale', 'y', 'Scale Y')}
          {row('scale', 'z', 'Scale Z')}
        </>
      ) : null}

      {pending ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }} data-testid="object-key-pending">
          <span className={styles.hint} style={{ flex: 1 }}>
            No {OBJECT_CHANNEL_LABEL[pending.channel].toLowerCase()} key at {formatTimecode(t, fps)}.
          </span>
          <button
            type="button"
            className={styles.actionBtn}
            style={{ marginTop: 0 }}
            data-testid="object-key-here"
            onClick={() => {
              setKey(obj.id, pending.channel, t, pending.value);
              setPending(null);
            }}
          >
            Add keyframe here
          </button>
          <button type="button" className={styles.actionBtn} style={{ marginTop: 0 }} onClick={() => setPending(null)}>
            Cancel
          </button>
        </div>
      ) : null}

      {animateOn ? (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} data-testid="object-show-path" />
          Show path (position keys in the 3D view)
        </label>
      ) : null}
    </div>
  );
}
