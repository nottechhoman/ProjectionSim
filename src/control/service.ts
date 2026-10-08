import { useSyncExternalStore } from 'react';
import { useAppStore } from '../store';
import { activeTrack } from '../mapping/model';
import { transport } from '../playback/clock';
import { runCommand } from '../playback/controls';
import { formatTimecode } from '../playback/timecode';
import { chaseDecision, chaseTimedOut } from './chase';
import { parseControlMessage, type ControlAction } from './commands';
import { MtcDecoder, parseMidiMessage, type MidiEvent } from './midiParse';
import {
  loadControlSettings,
  saveControlSettings,
  triggerFromEvent,
  triggerMatches,
  type ControlSettings,
  type MidiBinding,
} from './settings';

export interface ControlStatus {
  midi: 'off' | 'unsupported' | 'denied' | 'ready';
  inputs: { id: string; name: string }[];
  lastMidi: string;
  lastCommand: string;
  learning: { action: ControlAction; cue?: string } | null;
  mtc: string;
  osc: 'off' | 'connecting' | 'connected' | 'error';
}

/**
 * External control: Web MIDI (bindings with learn, MIDI Show Control, MTC chase)
 * and an OSC bridge over WebSocket. Settings are per machine (localStorage).
 */
class ControlService {
  settings: ControlSettings = loadControlSettings();
  status: ControlStatus = { midi: 'off', inputs: [], lastMidi: '—', lastCommand: '—', learning: null, mtc: '—', osc: 'off' };
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private access: MIDIAccess | null = null;
  private readonly mtc = new MtcDecoder();
  private mtcAt: { seconds: number; wall: number; fps: number } | null = null;
  private chaseTimer: ReturnType<typeof setInterval> | null = null;
  private ws: WebSocket | null = null;
  private wsRetry: ReturnType<typeof setTimeout> | null = null;
  private wsBackoff = 1000;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.applySettings();
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  update(patch: Partial<ControlSettings>): void {
    this.settings = { ...this.settings, ...patch };
    saveControlSettings(this.settings);
    this.emit();
    void this.applySettings();
  }

  learn(action: ControlAction, cue?: string): void {
    this.status = { ...this.status, learning: { action, cue } };
    this.emit();
  }

  cancelLearn(): void {
    this.status = { ...this.status, learning: null };
    this.emit();
  }

  removeBinding(id: string): void {
    this.update({ bindings: this.settings.bindings.filter((b) => b.id !== id) });
  }

  /** Inject a raw MIDI message (also used by tests). */
  handleMidi(data: ArrayLike<number>): void {
    const event = parseMidiMessage(data);
    if (event.kind === 'other') return;
    if (event.kind !== 'mtcQuarter') this.setStatus({ lastMidi: describeEvent(event) });
    if (event.kind === 'mtcQuarter' || event.kind === 'mtcFull') {
      this.onTimecode(event);
      return;
    }
    if (event.kind === 'msc') {
      this.onMsc(event);
      return;
    }
    const learning = this.status.learning;
    if (learning) {
      const trigger = triggerFromEvent(event);
      if (!trigger) return;
      const binding: MidiBinding = { id: `bind-${Date.now().toString(36)}`, action: learning.action, ...(learning.cue ? { cue: learning.cue } : {}), trigger };
      this.status = { ...this.status, learning: null };
      this.update({ bindings: [...this.settings.bindings.filter((b) => !(b.action === binding.action && b.cue === binding.cue)), binding] });
      return;
    }
    for (const b of this.settings.bindings) {
      if (!triggerMatches(b.trigger, event)) continue;
      this.run(b.action === 'cue' ? { type: 'cue', number: b.cue ?? '1' } : { type: b.action });
    }
  }

  dispose(): void {
    this.closeOsc();
    if (this.chaseTimer) clearInterval(this.chaseTimer);
    this.chaseTimer = null;
    this.detachMidi();
    this.started = false;
  }

  private run(cmd: Parameters<typeof runCommand>[0]): void {
    const label = runCommand(cmd);
    this.setStatus({ lastCommand: label });
  }

  private onMsc(event: Extract<MidiEvent, { kind: 'msc' }>): void {
    if (!this.settings.mscEnabled) return;
    if (event.deviceId !== 0x7f && event.deviceId !== this.settings.mscDeviceId) return;
    if (event.command === 'go') this.run(event.cue ? { type: 'cue', number: event.cue } : { type: 'go' });
    else if (event.command === 'stop') this.run({ type: 'pause' });
    else if (event.command === 'resume') this.run({ type: 'play' });
    else if (event.command === 'reset') this.run({ type: 'stop' });
  }

  private onTimecode(event: MidiEvent): void {
    const tc = this.mtc.feed(event);
    if (!tc) return;
    const now = performance.now();
    this.mtcAt = { seconds: tc.seconds + this.settings.mtcOffsetSec, wall: now, fps: tc.fps };
    const label = `${formatTimecode(tc.seconds, Math.round(tc.fps))} @ ${tc.fps} fps`;
    if (label !== this.status.mtc) this.setStatus({ mtc: label });
    if (!this.settings.mtcChase) return;
    const decision = chaseDecision(transport.time(), this.mtcAt.seconds, tc.fps);
    if (decision.seekTo !== null) transport.seek(Math.min(activeTrack(useAppStore.getState().show).durationSec, decision.seekTo));
    if (decision.play && !transport.playing) {
      const pre = transport.prerollMs;
      transport.prerollMs = 0; // timecode is the master: no pre-roll
      transport.play();
      transport.prerollMs = pre;
    }
  }

  private chaseWatchdog = () => {
    if (!this.settings.mtcChase || !this.mtcAt) return;
    if (chaseTimedOut(this.mtcAt.wall, performance.now())) {
      if (transport.playing) transport.pause();
      this.mtcAt = null;
      this.setStatus({ mtc: 'stopped' });
    }
  };

  private async applySettings(): Promise<void> {
    const s = this.settings;
    // MIDI
    if (s.midiEnabled) await this.attachMidi();
    else {
      this.detachMidi();
      this.setStatus({ midi: 'off' });
    }
    // MTC chase watchdog
    if (s.mtcChase && !this.chaseTimer) this.chaseTimer = setInterval(this.chaseWatchdog, 100);
    if (!s.mtcChase && this.chaseTimer) {
      clearInterval(this.chaseTimer);
      this.chaseTimer = null;
    }
    // OSC bridge
    const wantUrl = s.oscEnabled ? s.oscUrl : null;
    if (!wantUrl) this.closeOsc();
    else if (!this.ws || this.ws.url !== new URL(wantUrl).href) {
      this.closeOsc();
      this.connectOsc(wantUrl);
    }
  }

  private async attachMidi(): Promise<void> {
    if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
      this.setStatus({ midi: 'unsupported' });
      return;
    }
    try {
      if (!this.access) {
        // SysEx is needed for MIDI Show Control and MTC full-frame messages.
        this.access = await navigator.requestMIDIAccess({ sysex: true }).catch(() => navigator.requestMIDIAccess());
        this.access.onstatechange = () => this.bindInputs();
      }
      this.bindInputs();
    } catch {
      this.setStatus({ midi: 'denied' });
    }
  }

  private bindInputs(): void {
    if (!this.access) return;
    const inputs: { id: string; name: string }[] = [];
    this.access.inputs.forEach((input) => {
      inputs.push({ id: input.id, name: input.name ?? input.id });
      const wanted = this.settings.midiEnabled && (!this.settings.midiInputId || this.settings.midiInputId === input.id);
      input.onmidimessage = wanted ? (e: MIDIMessageEvent) => e.data && this.handleMidi(e.data) : null;
    });
    this.setStatus({ midi: 'ready', inputs });
  }

  private detachMidi(): void {
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
  }

  private connectOsc(url: string): void {
    if (this.wsRetry) clearTimeout(this.wsRetry);
    this.wsRetry = null;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.setStatus({ osc: 'error' });
      return;
    }
    this.ws = ws;
    this.setStatus({ osc: 'connecting' });
    ws.onopen = () => {
      this.wsBackoff = 1000;
      this.setStatus({ osc: 'connected' });
    };
    ws.onmessage = (e) => {
      const cmd = typeof e.data === 'string' ? parseControlMessage(e.data) : null;
      if (cmd) this.run(cmd);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus({ osc: 'error' });
      if (this.settings.oscEnabled) {
        this.wsRetry = setTimeout(() => this.connectOsc(this.settings.oscUrl), this.wsBackoff);
        this.wsBackoff = Math.min(10000, this.wsBackoff * 2);
      }
    };
  }

  private closeOsc(): void {
    if (this.wsRetry) clearTimeout(this.wsRetry);
    this.wsRetry = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    if (this.status.osc !== 'off') this.setStatus({ osc: 'off' });
  }

  private setStatus(patch: Partial<ControlStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit();
  }

  private emit(): void {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }
}

function describeEvent(e: MidiEvent): string {
  switch (e.kind) {
    case 'noteOn':
      return `Note on ${e.note} vel ${e.velocity} ch ${e.channel}`;
    case 'noteOff':
      return `Note off ${e.note} ch ${e.channel}`;
    case 'cc':
      return `CC ${e.controller} = ${e.value} ch ${e.channel}`;
    case 'msc':
      return `MSC ${e.command.toUpperCase()}${e.cue ? ` cue ${e.cue}` : ''} (device ${e.deviceId})`;
    case 'mtcFull':
      return 'MTC full frame';
    default:
      return e.kind;
  }
}

export const control = new ControlService();

/** Re-render on control settings / status changes. */
export function useControl(): ControlService {
  useSyncExternalStore(control.subscribe, control.getVersion);
  return control;
}
