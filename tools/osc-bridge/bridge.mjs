// OSC (UDP) → WebSocket bridge. No dependencies: a tiny RFC 6455 server that only
// sends text frames to the app (and answers ping / close).
import { createSocket } from 'node:dgram';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { decodeOsc, oscToCommand } from './osc.mjs';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(text, opcode = 0x1) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, len]) : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 0xff]) : null;
  if (!head) throw new Error('message too large');
  return Buffer.concat([head, payload]);
}

/**
 * Start the bridge. Returns { close(), wsPort, udpPort } once both sockets listen.
 * log(line) receives one line per event.
 */
export function startBridge({ udpPort = 9000, wsPort = 9100, host = '127.0.0.1', udpHost = '0.0.0.0', log = () => {} } = {}) {
  const clients = new Set();
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
    socket.on('data', (buf) => {
      const opcode = buf[0] & 0x0f;
      if (opcode === 0x8) socket.end(Buffer.from([0x88, 0]));
      else if (opcode === 0x9) socket.write(Buffer.from([0x8a, 0])); // pong
    });
    const drop = () => {
      if (clients.delete(socket)) log(`app disconnected (${clients.size})`);
    };
    socket.on('close', drop);
    socket.on('error', drop);
  });

  const udp = createSocket('udp4');
  udp.on('message', (msg, rinfo) => {
    for (const m of decodeOsc(msg)) {
      const cmd = oscToCommand(m);
      log(`${rinfo.address} ${m.address} ${JSON.stringify(m.args)} → ${cmd ? JSON.stringify(cmd) : 'ignored'}`);
      if (!cmd) continue;
      const data = frame(JSON.stringify(cmd));
      for (const c of clients) c.write(data);
    }
  });

  return new Promise((resolve, reject) => {
    let ready = 0;
    const done = () => {
      ready += 1;
      if (ready === 2) {
        resolve({
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
