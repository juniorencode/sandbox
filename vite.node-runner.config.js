import { defineConfig } from 'vite';

/**
 * Builds the Node-mode runtime as a standalone bundle.
 *
 * A separate config because it targets Node rather than the browser and has
 * to end up as one file the main process can hand to utilityProcess.fork.
 * Bundling is what lets it share the protocol, serializer, console and
 * instrumentation with the browser runner instead of duplicating them.
 */
export default defineConfig({
  // An SSR build externalises node_modules by default, which left acorn,
  // acorn-walk and magic-string as bare requires in the output. The installer
  // does not ship node_modules, so the runtime died on startup with a module
  // resolution error. Everything except Node's own builtins is inlined.
  ssr: {
    noExternal: true
  },
  build: {
    outDir: 'build',
    emptyOutDir: false,
    target: 'node20',
    ssr: true,
    minify: false,
    lib: {
      entry: 'src/runtime/node-runner.entry.js',
      formats: ['cjs'],
      fileName: () => 'node-runner.cjs'
    },
    rollupOptions: {
      // Node builtins stay external; everything of ours is inlined.
      external: id => id.startsWith('node:'),
      // Named explicitly: with `ssr` set, lib.fileName is not honoured and the
      // output would take the entry file's basename.
      output: { entryFileNames: 'node-runner.cjs' }
    }
  }
});
