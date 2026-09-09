import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: 'build'
  },
  plugins: [react()],
  test: {
    // Runtime modules are plain JavaScript and run fastest without a DOM.
    // Component tests opt into jsdom with a `@vitest-environment` docblock.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/runtime/**', 'src/utilities/**', 'src/hooks/**'],
      reporter: ['text', 'html']
    }
  }
});
