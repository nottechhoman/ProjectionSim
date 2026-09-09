/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  // GitHub Pages project site: https://<user>.github.io/ProjectionSim/
  base: mode === 'pages' ? '/ProjectionSim/' : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: false,
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
  },
  assetsInclude: ['**/*.glsl'],
}));
