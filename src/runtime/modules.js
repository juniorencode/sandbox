/**
 * Turns an import specifier into something the sandbox can actually load.
 *
 * The instrumentation pass rewrites `import x from 'y'` into an awaited
 * dynamic import and hands the specifier here at runtime, so where modules
 * come from is decided in one place rather than baked into the transform.
 *
 * Bare specifiers go to a private scheme served by the main process from a
 * disk cache, so a package is downloaded once and then works offline, and the
 * renderer never needs a third-party origin in its CSP.
 */

const SCHEME = 'sandbox-npm';
const REGISTRY = 'esm.sh';

/** Node builtins esm.sh can polyfill for a browser-like sandbox. */
const NODE_BUILTINS = new Set([
  'assert',
  'buffer',
  'crypto',
  'events',
  'path',
  'process',
  'punycode',
  'querystring',
  'stream',
  'string_decoder',
  'url',
  'util',
  'zlib'
]);

export class ModuleResolutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ModuleResolutionError';
  }
}

export const resolve = specifier => {
  if (typeof specifier !== 'string' || !specifier.trim()) {
    throw new ModuleResolutionError('An import specifier cannot be empty');
  }

  const request = specifier.trim();

  // Already a URL: honour it, but route http(s) through the cache too.
  if (/^https?:\/\//.test(request)) {
    const url = new URL(request);
    return `${SCHEME}://${url.host}${url.pathname}${url.search}`;
  }

  if (request.startsWith(`${SCHEME}://`) || request.startsWith('data:')) {
    return request;
  }

  // `node:` imports are rewritten to the polyfill esm.sh publishes, which is
  // as close as a browser worker can get. Anything it cannot polyfill fails
  // with the registry's own message rather than a silent undefined.
  if (request.startsWith('node:')) {
    const builtin = request.slice('node:'.length);
    if (!NODE_BUILTINS.has(builtin)) {
      throw new ModuleResolutionError(
        `node:${builtin} is not available in the sandbox. Use Node mode for real Node builtins.`
      );
    }
    return `${SCHEME}://${REGISTRY}/${builtin}`;
  }

  if (request.startsWith('.') || request.startsWith('/')) {
    throw new ModuleResolutionError(
      `Relative imports are not supported yet: "${request}". Paste the code into a tab, or import a package by name.`
    );
  }

  return `${SCHEME}://${REGISTRY}/${request}`;
};
