import { createMapper, identityMapper } from './sourcemap.js';

/**
 * TypeScript and JSX support, via esbuild compiled to WebAssembly.
 *
 * The editor could only ever run plain JavaScript. Anything with a type
 * annotation was a syntax error from the evaluator with no explanation of why.
 *
 * The wasm binary arrives as bytes rather than a URL because the renderer is
 * loaded from file://, where fetching a sibling file is blocked: the main
 * process reads it from disk and it is posted in. Initialisation is lazy, so a
 * workspace that only ever runs JavaScript never pays for it.
 */

const LOADERS = {
  javascript: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  tsx: 'tsx'
};

let esbuild = null;
let ready = null;

export const isTranspiled = language => language !== 'javascript';

/** @param wasm {ArrayBuffer} the esbuild binary, supplied by the main process */
export const initialize = async wasm => {
  if (ready) return ready;
  ready = (async () => {
    esbuild = await import('esbuild-wasm');
    await esbuild.initialize({
      wasmModule: await WebAssembly.compile(wasm),
      // The single-threaded build; a worker pool inside a worker buys nothing
      // for files this size.
      worker: false
    });
    return true;
  })();
  return ready;
};

export const initialized = () => Boolean(esbuild);

/**
 * @returns {{ code: string, mapper: object, error: null |
 *   { message: string, line: number, column: number } }}
 */
export const transpile = async (source, language) => {
  if (!isTranspiled(language)) {
    return { code: source, mapper: identityMapper, error: null };
  }

  if (!esbuild) {
    return {
      code: source,
      mapper: identityMapper,
      error: {
        message: `The ${language} compiler is still loading, try again in a moment`,
        line: 1,
        column: 1
      }
    };
  }

  try {
    const result = await esbuild.transform(source, {
      loader: LOADERS[language] ?? 'ts',
      sourcemap: 'external',
      sourcefile: 'sandbox',
      // The evaluator is an AsyncFunction body, so top-level await has to
      // survive rather than being wrapped into a module shape.
      format: 'esm',
      target: 'esnext',
      jsx: 'automatic',
      jsxImportSource: 'react'
    });

    const mapper = createMapper(result.map);
    return {
      code: result.code,
      // An empty map means positions cannot be trusted; reporting them
      // unchanged is better than reporting them wrong.
      mapper: mapper.empty ? identityMapper : mapper,
      error: null
    };
  } catch (failure) {
    const first = failure?.errors?.[0];
    return {
      code: source,
      mapper: identityMapper,
      error: {
        message: first?.text || String(failure?.message || failure),
        line: first?.location?.line ?? 1,
        column: first?.location?.column != null ? first.location.column + 1 : 1
      }
    };
  }
};
