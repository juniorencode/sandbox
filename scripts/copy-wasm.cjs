/**
 * Copies esbuild's wasm binary into `public/` so Vite emits it into the build
 * under a stable name.
 *
 * The renderer is loaded from file://, where fetching a sibling file is
 * blocked, so the main process reads this from disk and hands the bytes to the
 * renderer over IPC. A stable name is what lets it do that without globbing
 * for a content hash.
 *
 * Run automatically by the `prebuild-vite` npm hook.
 */
const fs = require('fs');
const path = require('path');

const source = path.join(
  __dirname,
  '..',
  'node_modules',
  'esbuild-wasm',
  'esbuild.wasm'
);
const target = path.join(__dirname, '..', 'public', 'esbuild.wasm');

if (!fs.existsSync(source)) {
  console.error(
    'esbuild-wasm is not installed; TypeScript support will be unavailable.'
  );
  process.exit(0);
}

const upToDate =
  fs.existsSync(target) &&
  fs.statSync(target).size === fs.statSync(source).size;

if (upToDate) {
  console.log('esbuild.wasm is already up to date');
} else {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(
    `copied esbuild.wasm (${(fs.statSync(target).size / 1e6).toFixed(1)} MB)`
  );
}
