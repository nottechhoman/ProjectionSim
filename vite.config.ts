/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages project site: https://<user>.github.io/ProjectionSim/
  base: process.env.GITHUB_PAGES === 'true' ? '/ProjectionSim/' : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: false,
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  assetsInclude: ['**/*.glsl'],
});
