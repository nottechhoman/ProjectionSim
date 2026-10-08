import { describe, expect, it } from 'vitest';
import { createTrack } from '../mapping/model';
import type { Track, TrackSection } from '../types';
import { cueAt, goTarget, nextCue, prevCue, sectionAt, transportStep } from './showControl';

const section = (id: string, startSec: number, endSec: number, endAction: TrackSection['endAction']): TrackSection => ({
  id,
  name: id,
  startSec,
  endSec,
  endAction,
});

function track(sections: TrackSection[] = [], cues: number[] = []): Track {
  const t = createTrack('T');
  return { ...t, durationSec: 60, sections, cues: cues.map((timeSec, i) => ({ id: `c${i}`, name: `Cue ${i + 1}`, timeSec })) };
}

describe('sections', () => {
  it('sectionAt: start inclusive, end exclusive', () => {
    const tr = track([section('a', 0, 10, 'continue'), section('b', 10, 20, 'stop')]);
    expect(sectionAt(tr, 0)?.id).toBe('a');
    expect(sectionAt(tr, 9.99)?.id).toBe('a');
    expect(sectionAt(tr, 10)?.id).toBe('b');
    expect(sectionAt(tr, 25)).toBeNull();
  });

  it('end actions in play mode', () => {
    const at = (action: TrackSection['endAction']) => transportStep(track([section('s', 5, 10, action)]), 9.9, 10.2, 'play');
    expect(at('continue')).toEqual({ kind: 'none' });
    expect(at('stop')).toEqual({ kind: 'pause', at: 5 });
    expect(at('hold')).toEqual({ kind: 'pause', at: 10 - 1e-3 });
    const loop = at('loop');
    expect(loop.kind).toBe('seek');
    expect((loop as { to: number }).to).toBeCloseTo(5.2, 9);
  });

  it('play section stops at the section end; loop section loops whatever the action', () => {
    const tr = track([section('s', 5, 10, 'continue')]);
    expect(transportStep(tr, 9.9, 10.1, 'playSection')).toEqual({ kind: 'pause', at: 10 - 1e-3 });
    expect(transportStep(tr, 9.9, 10.1, 'loopSection').kind).toBe('seek');
  });

  it('nothing happens inside a section or when entering one', () => {
    const tr = track([section('s', 5, 10, 'stop')]);
    expect(transportStep(tr, 6, 6.1, 'play')).toEqual({ kind: 'none' });
    expect(transportStep(tr, 4.9, 5.1, 'play')).toEqual({ kind: 'none' });
  });

  it('stops at the end of the track', () => {
    expect(transportStep(track(), 59.9, 60.2, 'play')).toEqual({ kind: 'pause', at: 60 });
  });
});

describe('cues', () => {
  const tr = track([], [10, 2, 30]);
  it('next / previous / at, with a frame of tolerance', () => {
    expect(nextCue(tr, 0)?.timeSec).toBe(2);
    expect(nextCue(tr, 2)?.timeSec).toBe(10);
    expect(nextCue(tr, 30)).toBeNull();
    expect(prevCue(tr, 10)?.timeSec).toBe(2);
    expect(prevCue(tr, 2)).toBeNull();
    expect(cueAt(tr, 10.01)?.timeSec).toBe(10);
    expect(cueAt(tr, 10.1)).toBeNull();
  });

  it('GO: plays from a cue it stands on, otherwise jumps to the next cue', () => {
    expect(goTarget(tr, 10, false)).toEqual({ seek: null, play: true });
    expect(goTarget(tr, 10, true)).toEqual({ seek: 30, play: true });
    expect(goTarget(tr, 5, false)).toEqual({ seek: 10, play: true });
    expect(goTarget(tr, 40, false)).toEqual({ seek: null, play: true });
  });
});
