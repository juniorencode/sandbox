import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'build'
  },
  plugins: [react()],
  // The runner worker loads the TypeScript compiler with a dynamic import, so
  // it is a code-splitting build. Vite's default worker format is iife, which
  // cannot code-split; the worker is already constructed with
  // `{ type: 'module' }`, so ES output is what it expects anyway.
  worker: {
    format: 'es'
  },
  test: {
    // Runtime modules are plain JavaScript and run fastest without a DOM.
    // Component tests opt into jsdom with a `@vitest-environment` docblock.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}', 'electron/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: [
        'src/runtime/**',
        'src/utilities/**',
        'src/hooks/**',
        'src/platform/**',
        'electron/**'
      ],
      reporter: ['text', 'html']
    }
  }
});
