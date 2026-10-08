import { describe, expect, it } from 'vitest';
import { createTrack } from '../mapping/model';
import { chaseDecision, chaseTimedOut } from './chase';
import { findCue, parseBridgeMessage, parseControlMessage } from './commands';
import { MtcDecoder, parseMidiMessage } from './midiParse';
import { describeTrigger, normalizeControlSettings, triggerFromEvent, triggerMatches } from './settings';

const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe('MIDI parsing', () => {
  it('notes and controllers', () => {
    expect(parseMidiMessage([0x91, 60, 100])).toEqual({ kind: 'noteOn', channel: 2, note: 60, velocity: 100 });
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({ kind: 'noteOff', channel: 1, note: 60 });
    expect(parseMidiMessage([0xb0, 7, 127])).toEqual({ kind: 'cc', channel: 1, controller: 7, value: 127 });
  });

  it('MIDI Show Control GO with a cue number, STOP and RESUME', () => {
    expect(parseMidiMessage([0xf0, 0x7f, 0x01, 0x02, 0x01, 0x01, ...ascii('3.5'), 0xf7])).toEqual({ kind: 'msc', deviceId: 1, command: 'go', cue: '3.5' });
    expect(parseMidiMessage([0xf0, 0x7f, 0x7f, 0x02, 0x01, 0x01, ...ascii('2'), 0x00, ...ascii('1'), 0xf7])).toMatchObject({ command: 'go', cue: '2' });
    expect(parseMidiMessage([0xf0, 0x7f, 0x7f, 0x02, 0x01, 0x02, 0xf7])).toMatchObject({ command: 'stop', cue: null });
    expect(parseMidiMessage([0xf0, 0x7f, 0x7f, 0x02, 0x01, 0x03, 0xf7])).toMatchObject({ command: 'resume' });
  });

  it('MTC full frame', () => {
    // 25 fps (rate code 1 << 5), 01:02:03:04
    expect(parseMidiMessage([0xf0, 0x7f, 0x7f, 0x01, 0x01, 0x21, 2, 3, 4, 0xf7])).toEqual({ kind: 'mtcFull', hours: 1, minutes: 2, seconds: 3, frames: 4, fps: 25 });
  });

  it('MTC quarter frames: a full set gives the time + 2 frames, then advances by quarter frames', () => {
    const tc = { h: 0, m: 1, s: 2, f: 10 };
    const pieces = [tc.f & 0xf, tc.f >> 4, tc.s & 0xf, tc.s >> 4, tc.m & 0xf, tc.m >> 4, tc.h & 0xf, (3 << 1) | (tc.h >> 4)];
    const dec = new MtcDecoder();
    let out = null;
    pieces.forEach((v, i) => {
      out = dec.feed(parseMidiMessage([0xf1, (i << 4) | v]));
    });
    expect(out).not.toBeNull();
    expect(out!.fps).toBe(30);
    expect(out!.seconds).toBeCloseTo(62 + 12 / 30, 9);
    const next = dec.feed(parseMidiMessage([0xf1, (0 << 4) | 12]));
    expect(next!.seconds).toBeCloseTo(62 + 12 / 30 + 1 / 120, 9);
  });

  it('out-of-order pieces restart the set', () => {
    const dec = new MtcDecoder();
    expect(dec.feed(parseMidiMessage([0xf1, 0x30]))).toBeNull();
    expect(dec.feed(parseMidiMessage([0xf1, 0x70]))).toBeNull();
  });
});

describe('bindings', () => {
  it('learns from note-on / CC high and matches channel (0 = any)', () => {
    const t = triggerFromEvent(parseMidiMessage([0x92, 36, 90]))!;
    expect(t).toEqual({ kind: 'note', channel: 3, note: 36 });
    expect(triggerMatches(t, parseMidiMessage([0x92, 36, 1]))).toBe(true);
    expect(triggerMatches(t, parseMidiMessage([0x90, 36, 1]))).toBe(false);
    expect(triggerMatches({ ...t, channel: 0 }, parseMidiMessage([0x90, 36, 1]))).toBe(true);
    expect(triggerFromEvent(parseMidiMessage([0xb0, 20, 10]))).toBeNull();
    expect(describeTrigger(t)).toBe('Note C2 (36) · ch 3');
  });

  it('settings normalize and drop bad bindings', () => {
    const s = normalizeControlSettings({ bindings: [{ action: 'go', trigger: { kind: 'note', channel: 1, note: 60 } }, { action: 'nope' }], mscDeviceId: 999 });
    expect(s.bindings).toHaveLength(1);
    expect(s.mscDeviceId).toBe(127);
    expect(s.oscUrl).toBe('ws://127.0.0.1:9100');
  });
});

describe('commands', () => {
  const track = { ...createTrack('T'), cues: [
    { id: 'a', name: 'Intro', timeSec: 0 },
    { id: 'b', name: '2.5', timeSec: 5 },
    { id: 'c', name: 'Cue 7', timeSec: 9 },
  ] };
  it('finds cues by name, "Cue N" or position', () => {
    expect(findCue(track, 'intro')?.id).toBe('a');
    expect(findCue(track, '2.5')?.id).toBe('b');
    expect(findCue(track, '7')?.id).toBe('c');
    expect(findCue(track, '2')?.id).toBe('b');
    expect(findCue(track, '9')).toBeNull();
  });
  it('parses bridge envelopes: hello, every OSC message (mapped or not), bare commands', () => {
    expect(parseBridgeMessage('{"type":"hello","udpPort":9000,"wsPort":9100}')).toEqual({ kind: 'hello', udpPort: 9000 });
    expect(parseBridgeMessage('{"type":"osc","from":"10.0.0.2","address":"/show/cue","args":[2],"command":{"type":"cue","number":"2"}}')).toEqual({
      kind: 'osc',
      address: '/show/cue',
      args: [2],
      from: '10.0.0.2',
      command: { type: 'cue', number: '2' },
    });
    expect(parseBridgeMessage('{"type":"osc","address":"/foo","args":[],"command":null}')).toMatchObject({ kind: 'osc', command: null });
    expect(parseBridgeMessage('{"type":"go"}')).toEqual({ kind: 'command', command: { type: 'go' } });
  });

  it('parses bridge messages', () => {
    expect(parseControlMessage('{"type":"go"}')).toEqual({ type: 'go' });
    expect(parseControlMessage('{"type":"cue","number":3}')).toEqual({ type: 'cue', number: '3' });
    expect(parseControlMessage('{"type":"locate","seconds":-2}')).toEqual({ type: 'locate', seconds: 0 });
    expect(parseControlMessage('nope')).toBeNull();
    expect(parseControlMessage('{"type":"rm -rf"}')).toBeNull();
  });
});

describe('MTC chase', () => {
  it('locates beyond 2 frames, otherwise just runs', () => {
    expect(chaseDecision(10, 10.05, 30)).toEqual({ seekTo: null, play: true });
    expect(chaseDecision(10, 12, 30)).toEqual({ seekTo: 12, play: true });
    expect(chaseTimedOut(null, 0)).toBe(true);
    expect(chaseTimedOut(1000, 1100)).toBe(false);
    expect(chaseTimedOut(1000, 1400)).toBe(true);
  });
});
