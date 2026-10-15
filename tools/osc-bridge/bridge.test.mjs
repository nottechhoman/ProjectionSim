import { createSocket } from 'node:dgram';
import { connect } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import { createFrameReader, originAllowed, startBridge } from './bridge.mjs';
import { decodeOsc, encodeOsc, oscToCommand, parseSendRequest } from './osc.mjs';

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

describe('v10: OSC send through the bridge', () => {
  const mask = (text, opcode = 0x1, fin = true) => {
    const payload = Buffer.from(text, 'utf8');
    const key = Buffer.from([1, 2, 3, 4]);
    const len = payload.length;
    const head = len < 126 ? Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | len]) : Buffer.from([(fin ? 0x80 : 0) | opcode, 0x80 | 126, len >> 8, len & 0xff]);
    const body = Buffer.from(payload.map((b, i) => b ^ key[i & 3]));
    return Buffer.concat([head, key, body]);
  };

  it('frame reader decodes masked, split and fragmented client frames', () => {
    const r = createFrameReader();
    const long = 'x'.repeat(300);
    const bytes = Buffer.concat([mask('{"a":1}'), mask(long), mask('he', 0x1, false), mask('llo', 0x0, true)]);
    const out = [];
    for (let i = 0; i < bytes.length; i += 7) out.push(...r.push(bytes.subarray(i, i + 7)));
    expect(out.map((f) => f.payload.toString())).toEqual(['{"a":1}', long, 'hello']);
  });

  it('validates send requests and targets', () => {
    expect(parseSendRequest({ type: 'send', address: '/show/time', args: [1.5], types: 'f', targets: ['127.0.0.1:53000'] })).toEqual({
      address: '/show/time',
      args: [1.5],
      types: 'f',
      targets: [{ host: '127.0.0.1', port: 53000 }],
    });
    expect(parseSendRequest({ type: 'send', address: 'nope' })).toBe('bad address');
    expect(parseSendRequest({ type: 'send', address: '/a', args: [{}] })).toBe('bad args');
    expect(parseSendRequest({ type: 'send', address: '/a', args: [1], types: 'x' })).toBe('bad types');
    expect(parseSendRequest({ type: 'send', address: '/a', targets: ['host:99999'] })).toMatch(/bad target/);
  });

  it('only lets local pages, the hosted app and --allow-origin send', () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed('http://localhost:5173')).toBe(true);
    expect(originAllowed('http://127.0.0.1:4173')).toBe(true);
    expect(originAllowed('https://nottechhoman.github.io')).toBe(true);
    expect(originAllowed('https://evil.example')).toBe(false);
    expect(originAllowed('https://show.example', ['https://show.example'])).toBe(true);
    expect(originAllowed('https://any.example', ['*'])).toBe(true);
  });

  /** Raw WebSocket client (lets the test set Origin and checks the bridge reads masked frames). */
  async function rawClient(port, origin) {
    const socket = connect(port, '127.0.0.1');
    await new Promise((r) => socket.once('connect', r));
    socket.write(
      `GET / HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n${origin ? `Origin: ${origin}\r\n` : ''}\r\n`,
    );
    const received = [];
    socket.on('data', (b) => received.push(b));
    await new Promise((r) => setTimeout(r, 50));
    return { send: (obj) => socket.write(mask(JSON.stringify(obj))), text: () => Buffer.concat(received).toString('latin1'), close: () => socket.destroy() };
  }

  async function udpListener() {
    const sock = createSocket('udp4');
    await new Promise((r) => sock.bind(0, '127.0.0.1', r));
    const packets = [];
    sock.on('message', (m) => packets.push(m));
    return { port: sock.address().port, packets, close: () => sock.close() };
  }

  it('turns JSON from the app into OSC bytes on every target (message + --send)', async () => {
    const a = await udpListener();
    const b = await udpListener();
    const bridge = await startBridge({ udpPort: 0, wsPort: 0, udpHost: '127.0.0.1', sendTargets: [`127.0.0.1:${b.port}`] });
    try {
      const app = await rawClient(bridge.wsPort, 'http://localhost:5173');
      app.send({ type: 'send', address: '/show/time', args: [2], types: 'f', targets: [`127.0.0.1:${a.port}`] });
      app.send({ type: 'send', address: '/show/cue', args: [3, 'Finale'], types: 'is', targets: [`127.0.0.1:${a.port}`] });
      await vi.waitFor(() => expect(a.packets.length + b.packets.length).toBe(4));
      const expected = [encodeOsc('/show/time', [2], 'f'), encodeOsc('/show/cue', [3, 'Finale'], 'is')];
      expect(a.packets).toEqual(expected);
      expect(b.packets).toEqual(expected);
      // Bytes: /show/time ,f 2.0 (float, not int)
      expect(a.packets[0].toString('hex')).toBe(Buffer.concat([Buffer.from('/show/time\0\0,f\0\0'), Buffer.from([0x40, 0, 0, 0])]).toString('hex'));
      expect(decodeOsc(a.packets[1])).toEqual([{ address: '/show/cue', args: [3, 'Finale'] }]);
      app.close();
    } finally {
      await bridge.close();
      a.close();
      b.close();
    }
  });

  it('refuses to send for pages from other sites, but they still receive', async () => {
    const a = await udpListener();
    const bridge = await startBridge({ udpPort: 0, wsPort: 0, udpHost: '127.0.0.1' });
    try {
      const app = await rawClient(bridge.wsPort, 'https://evil.example');
      app.send({ type: 'send', address: '/x', args: [], targets: [`127.0.0.1:${a.port}`] });
      await vi.waitFor(() => expect(app.text()).toContain('send-error'));
      expect(a.packets).toHaveLength(0);
      expect(app.text()).toContain('"type":"hello"');
      app.close();
    } finally {
      await bridge.close();
      a.close();
    }
  });
});
