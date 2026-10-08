import { describe, expect, it } from 'vitest';
import { createLayer, createTrack } from '../mapping/model';
import type { Layer } from '../types';
import { evaluate, fadeEnvelope, wrapMediaTime } from './evaluate';
import { syncDecision, MAX_NUDGE, updateLatency, updateSeekLead } from './syncMath';
import { playheadAt, TransportClock } from './clock';
import { formatTimecode, parseTimecode, snapToFrame } from './timecode';
import { moveClip, trimClipEnd, trimClipStart } from './edit';

const video = (patch: Partial<Layer> = {}) =>
  createLayer({ kind: 'video', assetId: 'clip' }, 'm', { startSec: 10, durationSec: 20, ...patch });
const durations = (len: number) => (id: string) => (id === 'clip' ? len : null);

describe('evaluate(track, t)', () => {
  it('only layers whose span contains t are live (start inclusive, end exclusive)', () => {
    const track = createTrack('T', [video()]);
    expect(evaluate(track, 9.99, durations(8))).toHaveLength(0);
    expect(evaluate(track, 10, durations(8))).toHaveLength(1);
    expect(evaluate(track, 29.99, durations(8))).toHaveLength(1);
    expect(evaluate(track, 30, durations(8))).toHaveLength(0);
  });

  it('skips disabled layers and keeps bottom-to-top order with indices', () => {
    const a = createLayer({ kind: 'solid', color: '#fff' }, 'm');
    const b = createLayer({ kind: 'solid', color: '#000' }, 'm', { enabled: false });
    const c = createLayer({ kind: 'pattern', pattern: 'uvGrid', color: '#fff' }, 'm');
    const live = evaluate(createTrack('T', [a, b, c]), 1);
    expect(live.map((l) => [l.layer.id, l.index])).toEqual([[a.id, 0], [c.id, 2]]);
  });

  it('applies fades on top of layer opacity', () => {
    const track = createTrack('T', [video({ opacity: 0.5, fadeInSec: 2, fadeOutSec: 4 })]);
    expect(evaluate(track, 11, durations(100))[0].opacity).toBeCloseTo(0.25, 9);
    expect(evaluate(track, 15, durations(100))[0].opacity).toBeCloseTo(0.5, 9);
    expect(evaluate(track, 28, durations(100))[0].opacity).toBeCloseTo(0.25, 9);
    expect(fadeEnvelope(0, 10, 0, 0)).toBe(1);
  });

  it('media time: inSec + (t - start) × speed, wrapped by play mode', () => {
    const at = (patch: Partial<Layer>, t: number, len = 8) => evaluate(createTrack('T', [video(patch)]), t, durations(len))[0]?.mediaTimeSec;
    expect(at({}, 13)).toBeCloseTo(3, 9);
    expect(at({ inSec: 1, speed: 2 }, 12)).toBeCloseTo(5, 9);
    // loop: clip of 8 s from in 0
    expect(at({ playMode: 'loop' }, 19)).toBeCloseTo(1, 9);
    // once: gone after the clip
    expect(at({ playMode: 'once' }, 17)).toBeCloseTo(7, 9);
    expect(at({ playMode: 'once' }, 19)).toBeUndefined();
    // holdLast: stays on the last frame
    expect(at({ playMode: 'holdLast' }, 25)).toBeCloseTo(8 - 1 / 30, 9);
    // pingPong: forward then back
    expect(at({ playMode: 'pingPong' }, 20)).toBeCloseTo(6, 9);
    // out point shortens the clip
    expect(at({ inSec: 2, outSec: 4, playMode: 'loop' }, 13)).toBeCloseTo(3, 9);
    expect(at({ inSec: 2, outSec: 4, playMode: 'loop' }, 15)).toBeCloseTo(3, 9);
  });

  it('unknown duration plays straight through; stills have no media time', () => {
    const track = createTrack('T', [video(), createLayer({ kind: 'image', assetId: 'x' }, 'm')]);
    const live = evaluate(track, 12);
    expect(live[0].mediaTimeSec).toBeCloseTo(2, 9);
    expect(live[1].mediaTimeSec).toBeNull();
  });

  it('wrapMediaTime handles degenerate clips', () => {
    expect(wrapMediaTime(5, 1, 0, 'loop')).toBe(1);
    expect(wrapMediaTime(-1, 0, 4, 'loop')).toBe(0);
  });
});

describe('media sync maths', () => {
  const fps = 30;
  it('seeks when more than 2 frames off (and seeks are cheap)', () => {
    expect(syncDecision(5.2, 5, true, 1, fps).seekTo).toBe(5);
    expect(syncDecision(4.9, 5, true, 1, fps).seekTo).toBe(5);
  });

  it('nudges playbackRate within ±5% beyond 1.5 frames, with hysteresis', () => {
    const ahead = syncDecision(5 + 1.9 / fps, 5, true, 1, fps);
    expect(ahead.seekTo).toBeNull();
    expect(ahead.correcting).toBe(true);
    expect(ahead.playbackRate).toBeLessThan(1);
    expect(ahead.playbackRate).toBeGreaterThanOrEqual(1 - MAX_NUDGE);
    const behind = syncDecision(5 - 1.9 / fps, 5, true, 1, fps);
    expect(behind.playbackRate).toBeGreaterThan(1);
    expect(behind.playbackRate).toBeLessThanOrEqual(1 + MAX_NUDGE);
    // inside 1.5 frames: leave the rate alone unless already correcting
    expect(syncDecision(5 + 1.2 / fps, 5, true, 1, fps)).toMatchObject({ playbackRate: 1, correcting: false });
    expect(syncDecision(5 + 1.2 / fps, 5, true, 1, fps, { correcting: true }).correcting).toBe(true);
    expect(syncDecision(5 + 0.3 / fps, 5, true, 1, fps, { correcting: true })).toMatchObject({ playbackRate: 1, correcting: false });
  });

  it('measures against the common presentation latency', () => {
    // 60 ms behind the clock is fine when every video is ~60 ms behind
    expect(syncDecision(4.94, 5, true, 1, fps, { latencySec: 0.06 })).toMatchObject({ seekTo: null, playbackRate: 1 });
    expect(syncDecision(4.94, 5, true, 1, fps).playbackRate).toBeGreaterThan(1);
    expect(updateLatency(0.04, [0.1, 0.1, 0.1], 1)).toBeCloseTo(0.1, 9);
    expect(updateLatency(0.04, [0.5], 1)).toBe(0.15);
    expect(updateLatency(0.04, [])).toBe(0.04);
  });

  it('seeks land ahead by the measured seek latency; costly seeks need a bigger error', () => {
    expect(syncDecision(4, 5, true, 1, fps, { seekLeadSec: 0.1 }).seekTo).toBeCloseTo(5.1, 9);
    expect(syncDecision(4, 5, true, 2, fps, { seekLeadSec: 0.1 }).seekTo).toBeCloseTo(5.2, 9);
    expect(syncDecision(5.15, 5, true, 1, fps, { seekLeadSec: 0.1 }).seekTo).toBeNull();
    expect(syncDecision(5.1, 5, true, 1, fps, { seekLeadSec: 0.01 }).seekTo).toBeCloseTo(5.01, 9);
    expect(syncDecision(4, 5, false, 1, fps, { seekLeadSec: 0.1 }).seekTo).toBe(5);
    expect(updateSeekLead(0.08, 0.2)).toBeCloseTo(0.128, 9);
  });

  it('while settling after a seek, tolerates more drift before seeking again', () => {
    expect(syncDecision(5.1, 5, true, 1, fps, { settling: true }).seekTo).toBeNull();
    expect(syncDecision(5.3, 5, true, 1, fps, { settling: true }).seekTo).toBe(5);
  });

  it('scales by layer speed × transport rate', () => {
    expect(syncDecision(5, 5, true, 2, fps).playbackRate).toBe(2);
  });

  it('paused transport pauses and parks on the exact frame', () => {
    const d = syncDecision(4, 5, false, 1, fps);
    expect(d.shouldPlay).toBe(false);
    expect(d.seekTo).toBe(5);
    expect(syncDecision(5.001, 5, false, 1, fps).seekTo).toBeNull();
  });
});

describe('transport clock', () => {
  it('playhead = anchor + (now - anchorWall) × rate', () => {
    expect(playheadAt({ playing: true, rate: 2, anchorSec: 10, anchorWallMs: 1000 }, 3000)).toBe(14);
    expect(playheadAt({ playing: false, rate: 2, anchorSec: 10, anchorWallMs: 1000 }, 3000)).toBe(10);
  });

  it('play / pause / seek / rate keep time continuous', () => {
    let now = 0;
    const clock = new TransportClock(() => now);
    clock.play();
    now = 2000;
    expect(clock.time()).toBe(2);
    clock.setRate(0.5);
    now = 4000;
    expect(clock.time()).toBe(3);
    clock.pause();
    now = 9000;
    expect(clock.time()).toBe(3);
    clock.seek(20);
    expect(clock.time()).toBe(20);
    clock.play();
    now = 11000;
    expect(clock.time()).toBe(21);
  });

  it('notifies subscribers', () => {
    const clock = new TransportClock(() => 0);
    let n = 0;
    const off = clock.subscribe(() => (n += 1));
    clock.play();
    clock.pause();
    off();
    clock.play();
    expect(n).toBe(2);
  });
});

describe('timecode', () => {
  it('formats HH:MM:SS:FF', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
    expect(formatTimecode(61.5, 30)).toBe('00:01:01:15');
    expect(formatTimecode(3600 + 59 / 30, 30)).toBe('01:00:01:29');
    expect(formatTimecode(1 / 25, 25)).toBe('00:00:00:01');
  });
  it('parses and snaps', () => {
    expect(parseTimecode('00:01:01:15', 30)).toBeCloseTo(61.5, 9);
    expect(parseTimecode('10:05', 30)).toBeCloseTo(10 + 5 / 30, 9);
    expect(parseTimecode('x', 30)).toBeNull();
    expect(snapToFrame(1.02, 30)).toBeCloseTo(31 / 30, 9);
  });
});

describe('clip edits', () => {
  it('move snaps to frames and never goes negative', () => {
    expect(moveClip(video(), 3.01, 30).startSec).toBeCloseTo(3, 9);
    expect(moveClip(video(), -2, 30).startSec).toBe(0);
  });
  it('left trim keeps the end and advances the in-point', () => {
    const t = trimClipStart(video({ inSec: 1 }), 12, 30);
    expect(t).toEqual({ startSec: 12, durationSec: 18, inSec: 3 });
    const back = trimClipStart(video({ inSec: 1 }), 5, 30);
    expect(back.inSec).toBe(0);
    expect(back.startSec).toBe(9);
  });
  it('right trim changes the duration only', () => {
    expect(trimClipEnd(video(), 15, 30).durationSec).toBe(5);
    expect(trimClipEnd(video(), 9, 30).durationSec).toBeCloseTo(0.1, 9);
  });
});
