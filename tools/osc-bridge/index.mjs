#!/usr/bin/env node
// Usage: node tools/osc-bridge/index.mjs [--udp 9000] [--ws 9100]
import { startBridge } from './bridge.mjs';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const bridge = await startBridge({
  udpPort: arg('--udp', 9000),
  wsPort: arg('--ws', 9100),
  log: (line) => console.log(new Date().toISOString().slice(11, 23), line),
});
console.log(`OSC bridge: send OSC to udp://<this machine>:${bridge.udpPort}; the app connects to ws://127.0.0.1:${bridge.wsPort}`);
console.log('Addresses: /show/go /show/play /show/pause /show/toggle /show/stop /show/next /show/prev /show/cue N /show/locate seconds');
process.on('SIGINT', async () => {
  await bridge.close();
  process.exit(0);
});
