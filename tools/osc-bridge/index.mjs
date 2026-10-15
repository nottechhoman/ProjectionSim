#!/usr/bin/env node
// Usage: node tools/osc-bridge/index.mjs [--udp 9000] [--ws 9100] [--send host:port ...] [--allow-origin URL ...]
// (see options.mjs for the matching environment variables)
import { DEFAULT_ALLOWED_ORIGINS, startBridge } from './bridge.mjs';
import { bridgeOptions } from './options.mjs';

const opts = bridgeOptions(process.argv.slice(2), process.env);
const bridge = await startBridge({
  udpPort: opts.udpPort,
  wsPort: opts.wsPort,
  sendTargets: opts.sendTargets,
  allowOrigins: [...DEFAULT_ALLOWED_ORIGINS, ...opts.extraOrigins],
  log: (line) => console.log(new Date().toISOString().slice(11, 23), line),
});
console.log(`OSC bridge: send OSC to udp://<this machine>:${bridge.udpPort}; the app connects to ws://127.0.0.1:${bridge.wsPort}`);
console.log('Receives: /show/go /show/play /show/pause /show/toggle /show/stop /show/next /show/prev /show/cue N /show/locate seconds');
if (bridge.sendTargets.length > 0) {
  console.log(`Feedback ("Send OSC" in the app) also goes to: ${bridge.sendTargets.map((t) => `${t.host}:${t.port}`).join(', ')}`);
}
process.on('SIGINT', async () => {
  await bridge.close();
  process.exit(0);
});
