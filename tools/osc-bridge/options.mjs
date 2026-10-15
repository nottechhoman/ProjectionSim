// Bridge options from command-line flags and environment variables (shared by
// index.mjs and the dev-server plugin in vite.config.ts).
//
//   --udp N / OSC_UDP_PORT            OSC receive port (9000)
//   --ws N / OSC_WS_PORT              WebSocket port for the app (9100)
//   --send host:port (repeatable) / OSC_SEND_TARGETS=host:port,host:port
//                                     always send the app's OSC feedback here too
//   --allow-origin URL (repeatable) / OSC_ALLOW_ORIGINS=url,url ('*' = any)
//                                     extra web pages allowed to send OSC

const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

export function bridgeOptions(argv = [], env = {}) {
  const many = (name) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
  const one = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
  };
  return {
    udpPort: Number(one('--udp') ?? env.OSC_UDP_PORT ?? 9000),
    wsPort: Number(one('--ws') ?? env.OSC_WS_PORT ?? 9100),
    sendTargets: [...list(env.OSC_SEND_TARGETS), ...many('--send')],
    extraOrigins: [...list(env.OSC_ALLOW_ORIGINS), ...many('--allow-origin')],
  };
}
