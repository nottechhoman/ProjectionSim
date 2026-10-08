import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
  },
  // OSC goes to every connected app, so the OSC test runs alone after the rest.
  projects: [
    { name: 'app', testIgnore: /osc\.spec\.ts/ },
    { name: 'osc', testMatch: /osc\.spec\.ts/, dependencies: ['app'] },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
