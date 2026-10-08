import { createSocket } from 'node:dgram';
import { describe, expect, it } from 'vitest';
import { startBridge } from './bridge.mjs';
import { decodeOsc, encodeOsc, oscToCommand } from './osc.mjs';

describe('OSC decoding and mapping', () => {
  it('round-trips messages with int / float / string args', () => {
    const [m] = decodeOsc(encodeOsc('/show/cue', ['3.5']));
    expect(m).toEqual({ address: '/show/cue', args: ['3.5'] });
    const [n] = decodeOsc(encodeOsc('/show/locate', [12.5]));
    expect(n.args[0]).toBeCloseTo(12.5, 5);
  });

  it('maps /show/* to commands; button releases (0) are ignored', () => {
    expect(oscToCommand({ address: '/show/go', args: [] })).toEqual({ type: 'go' });
    expect(oscToCommand({ address: '/show/go', args: [1] })).toEqual({ type: 'go' });
    expect(oscToCommand({ address: '/show/go', args: [0] })).toBeNull();
    expect(oscToCommand({ address: '/show/cue', args: [4] })).toEqual({ type: 'cue', number: '4' });
    expect(oscToCommand({ address: '/show/cue/intro', args: [] })).toEqual({ type: 'cue', number: 'intro' });
    expect(oscToCommand({ address: '/show/locate', args: [30] })).toEqual({ type: 'locate', seconds: 30 });
    expect(oscToCommand({ address: '/other', args: [] })).toBeNull();
  });

  it('flattens bundles', () => {
    const a = encodeOsc('/show/play');
    const b = encodeOsc('/show/stop');
    const size = (x) => {
      const s = Buffer.alloc(4);
      s.writeInt32BE(x.length);
      return s;
    };
    const bundle = Buffer.concat([Buffer.from('#bundle\0'), Buffer.alloc(8), size(a), a, size(b), b]);
    expect(decodeOsc(bundle).map((m) => m.address)).toEqual(['/show/play', '/show/stop']);
  });
});

describe('bridge end to end', () => {
  it('forwards OSC over UDP to connected WebSocket clients as JSON', async () => {
    const bridge = await startBridge({ udpPort: 0, wsPort: 0, udpHost: '127.0.0.1' });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${bridge.wsPort}`);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });
      const messages = [];
      const got = new Promise((resolve) => {
        ws.onmessage = (e) => {
          messages.push(JSON.parse(e.data));
          if (messages.length === 2) resolve(messages);
        };
      });
      const udp = createSocket('udp4');
      await new Promise((r) => udp.send(encodeOsc('/show/cue', [2]), bridge.udpPort, '127.0.0.1', r));
      const [hello, osc] = await got;
      expect(hello).toEqual({ type: 'hello', udpPort: bridge.udpPort, wsPort: bridge.wsPort });
      expect(osc).toMatchObject({ type: 'osc', address: '/show/cue', args: [2], command: { type: 'cue', number: '2' } });
      udp.close();
      ws.close();
    } finally {
      await bridge.close();
    }
  });
});
