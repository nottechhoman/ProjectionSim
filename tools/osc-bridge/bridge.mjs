// OSC (UDP) ⇄ WebSocket bridge. No dependencies: a tiny RFC 6455 server.
//  - receive: OSC arriving on UDP goes to every connected app as JSON text frames;
//  - send (v10): { type: 'send', address, args, types?, targets? } from the app goes out
//    as an OSC UDP packet to the message's targets plus the bridge's own --send targets.
import { createSocket } from 'node:dgram';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { decodeOsc, encodeOsc, oscToCommand, parseSendRequest, parseTarget } from './osc.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(text, opcode = 0x1) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 0xff]) : null;
  if (!head) throw new Error('message too large');
  return Buffer.concat([head, payload]);
}

/**
 * Incremental decoder for client → server frames (masked, possibly fragmented).
 * push(buf) returns the complete frames: [{ opcode, payload }]; continuation frames
 * are joined into their message.
 */
export function createFrameReader(maxMessage = 1 << 20) {
  let pending = Buffer.alloc(0);
  let fragments = null; // { opcode, parts }
  return {
    push(chunk) {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      const out = [];
      for (;;) {
        if (pending.length < 2) break;
        const fin = (pending[0] & 0x80) !== 0;
        const opcode = pending[0] & 0x0f;
        const masked = (pending[1] & 0x80) !== 0;
        let len = pending[1] & 0x7f;
        let offset = 2;
        if (len === 126) {
          if (pending.length < 4) break;
          len = pending.readUInt16BE(2);
          offset = 4;
        } else if (len === 127) {
          if (pending.length < 10) break;
          const big = pending.readBigUInt64BE(2);
          if (big > BigInt(maxMessage)) throw new Error('frame too large');
          len = Number(big);
          offset = 10;
        }
        if (len > maxMessage) throw new Error('frame too large');
        const maskAt = offset;
        if (masked) offset += 4;
        if (pending.length < offset + len) break;
        const payload = Buffer.from(pending.subarray(offset, offset + len));
        if (masked) for (let i = 0; i < len; i++) payload[i] ^= pending[maskAt + (i & 3)];
        pending = pending.subarray(offset + len);
        if (opcode >= 0x8) {
          out.push({ opcode, payload }); // control frames are never fragmented
        } else if (opcode === 0x0) {
          if (!fragments) continue;
          fragments.parts.push(payload);
          if (fin) {
            out.push({ opcode: fragments.opcode, payload: Buffer.concat(fragments.parts) });
            fragments = null;
          }
        } else if (fin) {
          out.push({ opcode, payload });
        } else {
          fragments = { opcode, parts: [payload] };
        }
      }
      return out;
    },
  };
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
export const DEFAULT_ALLOWED_ORIGINS = ['https://nottechhoman.github.io'];

/**
 * Pages allowed to SEND OSC through the bridge: local pages, the hosted app, and
 * any --allow-origin. Clients without an Origin header (not a browser) are allowed.
 * Receiving is open to every client, as before.
 */
export function originAllowed(origin, allowed = DEFAULT_ALLOWED_ORIGINS) {
  if (!origin) return true;
  if (allowed.includes('*')) return true;
  if (LOCAL_ORIGIN.test(origin)) return true;
  return allowed.some((a) => a.toLowerCase() === String(origin).toLowerCase());
}

/**
 * Start the bridge. Returns { close(), wsPort, udpPort } once both sockets listen.
 * log(line) receives one line per event.
 */
export function startBridge({
  udpPort = 9000,
  wsPort = 9100,
  host = '127.0.0.1',
  udpHost = '0.0.0.0',
  sendTargets = [],
  allowOrigins = DEFAULT_ALLOWED_ORIGINS,
  log = () => {},
} = {}) {
  const clients = new Set();
  const fixedTargets = sendTargets.map((t) => (typeof t === 'string' ? parseTarget(t) : t)).filter(Boolean);
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ProjectionLab OSC bridge — connect with a WebSocket\n');
  });
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return socket.destroy();
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    clients.add(socket);
    log(`app connected (${clients.size})`);
    // Tell the app which UDP port OSC should be sent to.
    socket.write(frame(JSON.stringify({ type: 'hello', udpPort: udp.address().port, wsPort: server.address().port })));
    const canSend = originAllowed(req.headers.origin, allowOrigins);
    const reader = createFrameReader();
    socket.on('data', (buf) => {
      let frames;
      try {
        frames = reader.push(buf);
      } catch (err) {
        log(`bad frame from app: ${err.message}`);
        socket.destroy();
        return;
      }
      for (const { opcode, payload } of frames) {
        if (opcode === 0x8) socket.end(Buffer.from([0x88, 0]));
        else if (opcode === 0x9) socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload])); // pong
        else if (opcode === 0x1) handleText(socket, payload.toString('utf8'), canSend, req.headers.origin);
      }
    });
    const drop = () => {
      if (clients.delete(socket)) log(`app disconnected (${clients.size})`);
    };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  const sendError = (socket, message) => socket.write(frame(JSON.stringify({ type: 'send-error', message })));

  function handleText(socket, text, canSend, origin) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return;
    }
    if (!data || data.type !== 'send') return;
    if (!canSend) {
      log(`send refused: origin ${origin} is not allowed (start the bridge with --allow-origin ${origin})`);
      sendError(socket, `origin ${origin} may not send OSC; start the bridge with --allow-origin ${origin}`);
      return;
    }
    const req = parseSendRequest(data);
    if (typeof req === 'string') {
      sendError(socket, req);
      return;
    }
    const seen = new Set();
    const targets = [...req.targets, ...fixedTargets].filter((t) => {
      const key = `${t.host}:${t.port}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (targets.length === 0) {
      sendError(socket, 'no OSC send targets');
      return;
    }
    const packet = encodeOsc(req.address, req.args, req.types);
    for (const t of targets) {
      udp.send(packet, t.port, t.host, (err) => {
        if (err) {
          log(`send ${req.address} → ${t.host}:${t.port} failed: ${err.message}`);
          sendError(socket, `${t.host}:${t.port}: ${err.message}`);
        }
      });
    }
  }

  const udp = createSocket('udp4');
  udp.on('message', (msg, rinfo) => {
    for (const m of decodeOsc(msg)) {
      const cmd = oscToCommand(m);
      log(`${rinfo.address} ${m.address} ${JSON.stringify(m.args)} → ${cmd ? JSON.stringify(cmd) : 'ignored'}`);
      // Every message goes to the app (it shows the last one); command is null when unmapped.
      const data = frame(JSON.stringify({ type: 'osc', from: rinfo.address, address: m.address, args: m.args, command: cmd }));
      for (const c of clients) c.write(data);
    }
  });

  return new Promise((resolve, reject) => {
    let ready = 0;
    const done = () => {
      ready += 1;
      if (ready === 2) {
        resolve({
          clientCount: () => clients.size,
          sendTargets: fixedTargets,
          udpPort: udp.address().port,
          wsPort: server.address().port,
          close: () =>
            new Promise((r) => {
              for (const c of clients) c.destroy();
              udp.close();
              server.close(() => r());
            }),
        });
      }
    };
    udp.once('error', reject);
    server.once('error', reject);
    udp.bind(udpPort, udpHost, done);
    server.listen(wsPort, host, done);
  });
}
