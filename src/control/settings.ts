import type { ControlAction } from './commands';
import type { MidiEvent } from './midiParse';

/** A MIDI trigger: a note-on or a controller going high (value ≥ 64). channel 0 = any. */
export type MidiTrigger = { kind: 'note'; channel: number; note: number } | { kind: 'cc'; channel: number; controller: number };

export interface MidiBinding {
  id: string;
  action: ControlAction;
  /** For action 'cue': the cue number / name to go to. */
  cue?: string;
  trigger: MidiTrigger;
}

export interface ControlSettings {
  midiEnabled: boolean;
  /** MIDI input id, or null for all inputs. */
  midiInputId: string | null;
  bindings: MidiBinding[];
  mscEnabled: boolean;
  /** MSC device id to answer (0x7F = all-call is always accepted). */
  mscDeviceId: number;
  mtcChase: boolean;
  /** Added to incoming timecode (seconds), e.g. -3600 when the show starts at 01:00:00:00. */
  mtcOffsetSec: number;
  oscEnabled: boolean;
  oscUrl: string;
}

export const DEFAULT_CONTROL_SETTINGS: ControlSettings = {
  midiEnabled: false,
  midiInputId: null,
  bindings: [],
  mscEnabled: true,
  mscDeviceId: 0x7f,
  mtcChase: false,
  mtcOffsetSec: 0,
  oscEnabled: true,
  oscUrl: 'ws://127.0.0.1:9100',
};

// v2: OSC now connects by default (v1 saved it off).
const KEY = 'projectionlab-v4-control-v2';

/** Per-machine settings (they describe this computer's MIDI / OSC setup, not the show). */
export function loadControlSettings(): ControlSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return raw ? normalizeControlSettings(JSON.parse(raw)) : { ...DEFAULT_CONTROL_SETTINGS };
  } catch {
    return { ...DEFAULT_CONTROL_SETTINGS };
  }
}

export function saveControlSettings(s: ControlSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable
  }
}

const ACTIONS: ControlAction[] = ['go', 'togglePlay', 'play', 'pause', 'stop', 'nextCue', 'prevCue', 'cue'];

export function normalizeControlSettings(raw: unknown): ControlSettings {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  const bindings = Array.isArray(d.bindings)
    ? d.bindings.flatMap((b): MidiBinding[] => {
        if (!b || typeof b !== 'object') return [];
        const x = b as Record<string, unknown>;
        const t = (x.trigger ?? {}) as Record<string, unknown>;
        if (!ACTIONS.includes(x.action as ControlAction)) return [];
        const channel = Math.round(num(t.channel, 0));
        let trigger: MidiTrigger;
        if (t.kind === 'note' && typeof t.note === 'number') trigger = { kind: 'note', channel, note: t.note };
        else if (t.kind === 'cc' && typeof t.controller === 'number') trigger = { kind: 'cc', channel, controller: t.controller };
        else return [];
        return [{ id: typeof x.id === 'string' ? x.id : `bind-${Math.random().toString(36).slice(2, 8)}`, action: x.action as ControlAction, ...(typeof x.cue === 'string' ? { cue: x.cue } : {}), trigger }];
      })
    : [];
  return {
    midiEnabled: d.midiEnabled === true,
    midiInputId: typeof d.midiInputId === 'string' ? d.midiInputId : null,
    bindings,
    mscEnabled: d.mscEnabled !== false,
    mscDeviceId: Math.min(0x7f, Math.max(0, Math.round(num(d.mscDeviceId, 0x7f)))),
    mtcChase: d.mtcChase === true,
    mtcOffsetSec: num(d.mtcOffsetSec, 0),
    oscEnabled: d.oscEnabled !== false,
    oscUrl: typeof d.oscUrl === 'string' && d.oscUrl ? d.oscUrl : DEFAULT_CONTROL_SETTINGS.oscUrl,
  };
}

/** The trigger an incoming event would create in learn mode (note-on / CC high). */
export function triggerFromEvent(e: MidiEvent): MidiTrigger | null {
  if (e.kind === 'noteOn') return { kind: 'note', channel: e.channel, note: e.note };
  if (e.kind === 'cc' && e.value >= 64) return { kind: 'cc', channel: e.channel, controller: e.controller };
  return null;
}

export function triggerMatches(t: MidiTrigger, e: MidiEvent): boolean {
  if (t.kind === 'note') return e.kind === 'noteOn' && e.note === t.note && (t.channel === 0 || t.channel === e.channel);
  return e.kind === 'cc' && e.value >= 64 && e.controller === t.controller && (t.channel === 0 || t.channel === e.channel);
}

export function describeTrigger(t: MidiTrigger): string {
  const ch = t.channel === 0 ? 'any ch' : `ch ${t.channel}`;
  if (t.kind === 'note') {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `Note ${names[t.note % 12]}${Math.floor(t.note / 12) - 1} (${t.note}) · ${ch}`;
  }
  return `CC ${t.controller} · ${ch}`;
}
