/**
 * MIDI parsing (pure): channel voice messages, MIDI Show Control (MSC) and MIDI
 * Timecode (MTC quarter-frame + full-frame).
 */

export type MidiEvent =
  | { kind: 'noteOn'; channel: number; note: number; velocity: number }
  | { kind: 'noteOff'; channel: number; note: number }
  | { kind: 'cc'; channel: number; controller: number; value: number }
  | { kind: 'msc'; deviceId: number; command: MscCommand; cue: string | null }
  | { kind: 'mtcQuarter'; piece: number; value: number }
  | { kind: 'mtcFull'; hours: number; minutes: number; seconds: number; frames: number; fps: number }
  | { kind: 'other' };

export type MscCommand = 'go' | 'stop' | 'resume' | 'timedGo' | 'load' | 'set' | 'fire' | 'allOff' | 'restore' | 'reset' | 'goOff' | 'unknown';

const MSC_COMMANDS: Record<number, MscCommand> = {
  0x01: 'go',
  0x02: 'stop',
  0x03: 'resume',
  0x04: 'timedGo',
  0x05: 'load',
  0x06: 'set',
  0x07: 'fire',
  0x08: 'allOff',
  0x09: 'restore',
  0x0a: 'reset',
  0x0b: 'goOff',
};

/** MTC rate code (bits 5–6 of the hours byte / piece 7). */
export const MTC_RATES = [24, 25, 29.97, 30] as const;

export function parseMidiMessage(data: ArrayLike<number>): MidiEvent {
  if (data.length === 0) return { kind: 'other' };
  const status = data[0];
  if (status === 0xf0) return parseSysex(data);
  if (status === 0xf1 && data.length >= 2) {
    return { kind: 'mtcQuarter', piece: (data[1] >> 4) & 0x07, value: data[1] & 0x0f };
  }
  const type = status & 0xf0;
  const channel = (status & 0x0f) + 1;
  if (type === 0x90 && data.length >= 3) {
    return data[2] > 0
      ? { kind: 'noteOn', channel, note: data[1], velocity: data[2] }
      : { kind: 'noteOff', channel, note: data[1] };
  }
  if (type === 0x80 && data.length >= 3) return { kind: 'noteOff', channel, note: data[1] };
  if (type === 0xb0 && data.length >= 3) return { kind: 'cc', channel, controller: data[1], value: data[2] };
  return { kind: 'other' };
}

function parseSysex(data: ArrayLike<number>): MidiEvent {
  // Universal real-time: F0 7F <device> <sub-id1> <sub-id2> ... F7
  if (data.length < 5 || data[1] !== 0x7f) return { kind: 'other' };
  const device = data[2];
  const sub1 = data[3];
  if (sub1 === 0x01 && data[4] === 0x01 && data.length >= 9) {
    // MTC full frame: F0 7F 7F 01 01 hh mm ss ff F7
    const hh = data[5];
    return {
      kind: 'mtcFull',
      hours: hh & 0x1f,
      minutes: data[6] & 0x3f,
      seconds: data[7] & 0x3f,
      frames: data[8] & 0x1f,
      fps: MTC_RATES[(hh >> 5) & 0x03],
    };
  }
  if (sub1 === 0x02 && data.length >= 7) {
    // MSC: F0 7F <device> 02 <command format> <command> [q_number 00 q_list 00 q_path] F7
    const command = MSC_COMMANDS[data[5]] ?? 'unknown';
    let cue: string | null = null;
    let text = '';
    for (let i = 6; i < data.length; i++) {
      const b = data[i];
      if (b === 0xf7 || b === 0x00) break;
      text += String.fromCharCode(b);
    }
    if (text.length > 0) cue = text;
    return { kind: 'msc', deviceId: device, command, cue };
  }
  return { kind: 'other' };
}

export function mtcToSeconds(t: { hours: number; minutes: number; seconds: number; frames: number; fps: number }): number {
  return t.hours * 3600 + t.minutes * 60 + t.seconds + t.frames / t.fps;
}

/**
 * Assembles MTC quarter-frames (8 per 2 frames). A full set describes the frame
 * at which piece 0 arrived, so the current time is that + 2 frames; between full
 * sets, every piece advances a quarter frame.
 */
export class MtcDecoder {
  private pieces = new Array<number>(8).fill(0);
  private seen = 0;
  private lastPiece = -1;
  private base: number | null = null;
  private fps = 30;

  /** Feed one event; returns the current timecode in seconds when known. */
  feed(event: MidiEvent): { seconds: number; fps: number } | null {
    if (event.kind === 'mtcFull') {
      this.fps = event.fps;
      this.seen = 0;
      this.lastPiece = -1;
      this.base = null;
      return { seconds: mtcToSeconds(event), fps: event.fps };
    }
    if (event.kind !== 'mtcQuarter') return null;
    const { piece, value } = event;
    // Pieces must arrive in order (0..7 forward); anything else restarts the set.
    if (piece !== (this.lastPiece + 1) % 8) this.seen = 0;
    this.lastPiece = piece;
    this.pieces[piece] = value;
    this.seen += 1;
    if (piece === 7 && this.seen >= 8) {
      const p = this.pieces;
      const frames = p[0] | (p[1] << 4);
      const seconds = p[2] | (p[3] << 4);
      const minutes = p[4] | (p[5] << 4);
      const hours = p[6] | ((p[7] & 0x01) << 4);
      this.fps = MTC_RATES[(p[7] >> 1) & 0x03];
      this.base = mtcToSeconds({ hours, minutes, seconds, frames, fps: this.fps }) + 2 / this.fps;
      return { seconds: this.base, fps: this.fps };
    }
    if (this.base !== null) {
      // Each quarter frame after the set moves time on by 1/4 frame.
      const quarters = piece + 1;
      return { seconds: this.base + quarters / (4 * this.fps), fps: this.fps };
    }
    return null;
  }
}
