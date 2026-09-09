const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { net, protocol } = require('electron');

/**
 * Module loading for the sandbox, over a private scheme backed by a disk cache.
 *
 * The runner could not load a module at all: it evaluated code through
 * `new Function`, which rejects `import` outright, and there was no `require`,
 * so the README's claim of ES module and CommonJS support was simply untrue.
 *
 * Fetching esm.sh straight from the worker would have been less code, but it
 * would mean widening the renderer's CSP to a third-party origin, phoning out
 * on every run, and breaking entirely when offline. Instead the renderer only
 * ever talks to `sandbox-npm://`, which this handler serves from disk and
 * fills from the network on a miss. After a package has been used once it
 * needs no network again.
 *
 * The registry host is kept inside the URL — `sandbox-npm://esm.sh/lodash` —
 * so relative imports inside a fetched module resolve against the same scheme
 * for free, which is most of the module graph. Only absolute cross-origin
 * URLs in the source have to be rewritten.
 */

const SCHEME = 'sandbox-npm';
const REGISTRY = 'esm.sh';
const CACHE_DIR = 'module-cache';
const MAX_REDIRECTS = 5;

/** Must run before the app is ready for `import()` of this scheme to work. */
const registerScheme = () => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        // Modules are fetched by the worker, which is a different origin than
        // the page under some configurations.
        corsEnabled: true
      }
    }
  ]);
};

const cacheName = url =>
  `${crypto.createHash('sha256').update(url).digest('hex').slice(0, 32)}.js`;

/**
 * Rewrites absolute registry URLs in a module's source onto our scheme.
 *
 * Relative specifiers need no rewriting: the browser resolves them against
 * the importing module's own `sandbox-npm://` URL.
 */
const rewrite = source =>
  source.replace(/https:\/\/([\w.-]+\.[a-z]{2,})\//g, `${SCHEME}://$1/`);

const createModuleServer = (directory, { allow = () => true } = {}) => {
  const cacheDir = path.join(directory, CACHE_DIR);

  const readCache = url => {
    try {
      const file = path.join(cacheDir, cacheName(url));
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    } catch {
      return null;
    }
  };

  const writeCache = (url, source) => {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, cacheName(url)), source, 'utf8');
    } catch {
      // A cache miss next time is the only consequence.
    }
  };

  /** Follows redirects manually so the final body is what gets cached. */
  const download = async (url, depth = 0) => {
    if (depth > MAX_REDIRECTS) throw new Error('too many redirects');
    const response = await net.fetch(url, { redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`redirect with no location from ${url}`);
      return download(new URL(location, url).toString(), depth + 1);
    }

    if (!response.ok) {
      throw new Error(`${response.status} from ${url}`);
    }

    return response.text();
  };

  const handler = async request => {
    const requested = new URL(request.url);
    const upstream = `https://${requested.host}${requested.pathname}${requested.search}`;

    const cached = readCache(upstream);
    if (cached !== null) {
      return new Response(cached, {
        headers: { 'content-type': 'text/javascript; charset=utf-8' }
      });
    }

    if (!allow()) {
      // Reported as JavaScript so the failure arrives at the sandbox as a
      // readable error rather than an opaque network fault.
      return new Response(
        `throw new Error(${JSON.stringify(
          'Module downloads are turned off in settings, and this package is not cached yet'
        )});`,
        {
          status: 200,
          headers: { 'content-type': 'text/javascript; charset=utf-8' }
        }
      );
    }

    try {
      const source = rewrite(await download(upstream));
      writeCache(upstream, source);
      return new Response(source, {
        headers: { 'content-type': 'text/javascript; charset=utf-8' }
      });
    } catch (error) {
      return new Response(
        `throw new Error(${JSON.stringify(
          `Could not load ${requested.pathname.replace(/^\//, '')}: ${
            error?.message || error
          }`
        )});`,
        {
          status: 200,
          headers: { 'content-type': 'text/javascript; charset=utf-8' }
        }
      );
    }
  };

  return {
    install: () => protocol.handle(SCHEME, handler),

    stats: () => {
      try {
        const files = fs.readdirSync(cacheDir);
        const bytes = files.reduce(
          (total, file) => total + fs.statSync(path.join(cacheDir, file)).size,
          0
        );
        return { ok: true, count: files.length, bytes, path: cacheDir };
      } catch {
        return { ok: true, count: 0, bytes: 0, path: cacheDir };
      }
    },

    clear: () => {
      try {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        return { ok: true };
      } catch (error) {
        return { ok: false, error: String(error?.message || error) };
      }
    },

    // Exposed for tests.
    rewrite,
    cacheName
  };
};

module.exports = { SCHEME, REGISTRY, registerScheme, createModuleServer, rewrite };
