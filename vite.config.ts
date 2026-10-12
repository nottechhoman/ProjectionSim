/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { startBridge, type RunningBridge } from './tools/osc-bridge/bridge.mjs';
import { serviceWorkerSource } from './tools/pwa/serviceWorker.mjs';

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

/**
 * v8: write sw.js next to the build so the installed web app works offline. It precaches
 * every file of this build plus the icons and manifest from public/ (see tools/pwa).
 */
function serviceWorkerPlugin(): Plugin {
  const fromPublic = [
    'manifest.webmanifest',
    'favicon.svg',
    'logo.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/apple-touch-icon.png',
  ];
  return {
    name: 'projectionsim-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      const files = [...built, ...fromPublic].sort();
      // The version changes whenever any built file name (content hash) changes.
      let h = 0;
      for (const ch of files.join('|')) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
      const version = (h >>> 0).toString(36);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorkerSource(version, files) });
    },
  };
}

export default defineConfig(({ mode }) => ({
  // GitHub Pages project site: https://<user>.github.io/ProjectionSim/
  base: mode === 'pages' ? '/ProjectionSim/' : '/',
  plugins: [react(), oscBridgePlugin(), serviceWorkerPlugin()],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: false,
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  assetsInclude: ['**/*.glsl'],
}));
