import { describe, expect, it } from 'vitest';
import type { Show } from '../types';
import { createShow, createTrack } from '../mapping/model';
import {
  currentCue,
  diffFeedback,
  feedbackState,
  goAckMessage,
  OscFeedback,
  timeMessages,
  transportStateOf,
  type OscOutMessage,
} from './oscFeedback';

function show(): Show {
  const s = createShow();
  const t1 = {
    ...s.tracks[0],
    name: 'Opening',
    durationSec: 60,
    cues: [
      { id: 'c2', name: 'Finale', timeSec: 20 },
      { id: 'c1', name: 'Intro', timeSec: 5 },
    ],
    sections: [
      { id: 's1', name: 'Verse', startSec: 0, endSec: 10, endAction: 'continue' as const },
      { id: 's2', name: 'Chorus', startSec: 10, endSec: 30, endAction: 'continue' as const },
    ],
  };
  const t2 = { ...createTrack('Encore'), id: 'track-2' };
  return { ...s, fps: 25, tracks: [t1, t2], activeTrackId: t1.id };
}

const addr = (ms: OscOutMessage[]) => ms.map((m) => `${m.address} ${m.args.join(' ')}`);

describe('feedback state', () => {
  it('stopped = not playing at 0; paused elsewhere', () => {
    expect(transportStateOf(true, 0)).toBe('playing');
    expect(transportStateOf(false, 0)).toBe('stopped');
    expect(transportStateOf(false, 3)).toBe('paused');
  });

  it('current cue is the last one reached, 1-based in time order', () => {
    const tr = show().tracks[0];
    expect(currentCue(tr, 0)).toEqual({ index: 0, name: '' });
    expect(currentCue(tr, 5)).toEqual({ index: 1, name: 'Intro' });
    expect(currentCue(tr, 19.99)).toEqual({ index: 2, name: 'Finale' }); // within half a frame
    expect(currentCue(tr, 45)).toEqual({ index: 2, name: 'Finale' });
  });

  it('reads section and track from the show', () => {
    const s = show();
    expect(feedbackState(s, true, 12)).toEqual({
      state: 'playing',
      cue: { index: 1, name: 'Intro' },
      section: { index: 2, name: 'Chorus' },
      track: { index: 1, name: 'Opening' },
    });
    expect(feedbackState({ ...s, activeTrackId: 'track-2' }, false, 0).track).toEqual({ index: 2, name: 'Encore' });
  });
});

describe('message builder', () => {
  it('builds typed messages', () => {
    expect(timeMessages(61.5, 25)).toEqual([
      { address: '/show/time', args: [61.5], types: 'f' },
      { address: '/show/timecode', args: ['00:01:01:12'], types: 's' },
    ]);
    expect(goAckMessage(3)).toEqual({ address: '/show/go/ack', args: [3], types: 'i' });
  });

  it('first state sends everything', () => {
    expect(addr(diffFeedback(null, feedbackState(show(), false, 0)))).toEqual([
      '/show/track 1 Opening',
      '/show/state stopped',
      '/show/cue 0 ',
      '/show/section 1 Verse',
    ]);
  });

  it('A → B yields exactly the changed messages, and nothing when unchanged', () => {
    const s = show();
    const a = feedbackState(s, false, 0);
    const b = feedbackState(s, true, 12);
    expect(addr(diffFeedback(a, b))).toEqual(['/show/state playing', '/show/cue 1 Intro', '/show/section 2 Chorus']);
    expect(diffFeedback(b, feedbackState(s, true, 13))).toEqual([]);
    const c = feedbackState({ ...s, activeTrackId: 'track-2' }, true, 0);
    expect(addr(diffFeedback(b, c))).toEqual(['/show/track 2 Encore', '/show/cue 0 ', '/show/section 0 ']);
  });
});

describe('OscFeedback (change detector + throttle)', () => {
  function run(rateHz: number) {
    const sent: OscOutMessage[] = [];
    const fb = new OscFeedback((m) => sent.push(m), rateHz);
    return { sent, fb };
  }

  it('sends no duplicates across many identical ticks', () => {
    const { sent, fb } = run(10);
    const s = show();
    for (let i = 0; i < 10; i++) fb.update({ show: s, playing: false, t: 3, nowMs: i * 16 });
    expect(addr(sent)).toEqual(['/show/track 1 Opening', '/show/state paused', '/show/cue 0 ', '/show/section 1 Verse']);
  });

  it('sends time at the chosen rate while playing, never while paused', () => {
    for (const rate of [10, 30]) {
      const { sent, fb } = run(rate);
      const s = show();
      // One second of 60 fps ticks while playing from 1 s.
      for (let i = 0; i < 60; i++) fb.update({ show: s, playing: true, t: 1 + i / 60, nowMs: 1000 + (i * 1000) / 60 });
      const times = sent.filter((m) => m.address === '/show/time');
      const tcs = sent.filter((m) => m.address === '/show/timecode');
      expect(times).toHaveLength(rate);
      expect(tcs).toHaveLength(rate);
      sent.length = 0;
      for (let i = 0; i < 60; i++) fb.update({ show: s, playing: false, t: 2, nowMs: 2000 + i * 16 });
      expect(addr(sent)).toEqual(['/show/state paused']);
    }
  });

  it('crossing a cue while playing sends /show/cue once', () => {
    const { sent, fb } = run(10);
    const s = show();
    for (let i = 0; i <= 120; i++) fb.update({ show: s, playing: true, t: 4 + i / 60, nowMs: i * 16.7 });
    expect(sent.filter((m) => m.address === '/show/cue').map((m) => m.args)).toEqual([[0, ''], [1, 'Intro']]);
  });

  it('reset() sends the full state again; go() acks', () => {
    const { sent, fb } = run(10);
    const s = show();
    fb.update({ show: s, playing: false, t: 0, nowMs: 0 });
    sent.length = 0;
    fb.reset();
    fb.update({ show: s, playing: false, t: 0, nowMs: 10 });
    expect(sent).toHaveLength(4);
    fb.go(2);
    expect(sent[sent.length - 1]).toEqual(goAckMessage(2));
  });
});
