/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { startBridge, type RunningBridge } from './tools/osc-bridge/bridge.mjs';

/**
 * Dev only: run the OSC → WebSocket bridge together with the dev server so OSC
 * works with a plain `npm run dev`. Ports: OSC_UDP_PORT (9000), OSC_WS_PORT (9100);
 * OSC_BRIDGE=0 turns it off. If a port is taken (e.g. the standalone bridge is
 * already running) the dev server carries on and the app uses that bridge.
 */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

// One bridge per dev-server process: Vite re-evaluates this file when it restarts
// (config change), so the running bridge is kept on globalThis and reused.
const bridgeSlot = globalThis as { __projectionLabOscBridge?: Promise<RunningBridge | null> };

function oscBridgePlugin(): Plugin {
  return {
    name: 'projectionlab-osc-bridge',
    apply: 'serve',
    configureServer(server) {
      if (env.OSC_BRIDGE === '0' || env.VITEST) return;
      const logger = server.config.logger;
      if (!bridgeSlot.__projectionLabOscBridge) {
        const udpPort = Number(env.OSC_UDP_PORT ?? 9000);
        const wsPort = Number(env.OSC_WS_PORT ?? 9100);
        bridgeSlot.__projectionLabOscBridge = startBridge({
          udpPort,
          wsPort,
          log: (line) => logger.info(`[osc] ${line}`, { timestamp: true }),
        }).then(
          (bridge) => {
            logger.info(`[osc] bridge listening: OSC udp://0.0.0.0:${bridge.udpPort} → app ws://127.0.0.1:${bridge.wsPort}`);
            return bridge;
          },
          (err: unknown) => {
            logger.warn(`[osc] bridge not started (${err instanceof Error ? err.message : String(err)}) — another bridge is probably running; the app will use it.`);
            return null;
          },
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  // GitHub Pages project site: https://<user>.github.io/ProjectionSim/
  base: mode === 'pages' ? '/ProjectionSim/' : '/',
  plugins: [react(), oscBridgePlugin()],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: false,
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  assetsInclude: ['**/*.glsl'],
}));
