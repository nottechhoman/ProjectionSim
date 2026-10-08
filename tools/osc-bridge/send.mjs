#!/usr/bin/env node
// Send one OSC message (for testing without an OSC app):
//   node tools/osc-bridge/send.mjs /show/go
//   node tools/osc-bridge/send.mjs /show/cue 3 [--host 127.0.0.1] [--port 9000]
import { createSocket } from 'node:dgram';
import { encodeOsc } from './osc.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  if (i < 0) return fallback;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const host = opt('--host', '127.0.0.1');
const port = Number(opt('--port', '9000'));
const [address, ...rest] = argv;
if (!address || !address.startsWith('/')) {
  console.error('usage: send.mjs /address [args...] [--host h] [--port p]');
  process.exit(1);
}
const args = rest.map((a) => (/^-?\d+$/.test(a) ? Number(a) : /^-?\d*\.\d+$/.test(a) ? Number(a) + 0.0 : a));
const udp = createSocket('udp4');
udp.send(encodeOsc(address, args), port, host, (err) => {
  if (err) console.error(err.message);
  else console.log(`sent ${address} ${JSON.stringify(args)} → udp://${host}:${port}`);
  udp.close();
});
