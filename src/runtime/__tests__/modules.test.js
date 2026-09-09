import { describe, expect, it } from 'vitest';
import { ModuleResolutionError, resolve } from '../modules.js';

describe('resolve', () => {
  it('sends a bare specifier to the cached registry scheme', () => {
    expect(resolve('lodash')).toBe('sandbox-npm://esm.sh/lodash');
    expect(resolve('@scope/pkg@1.2.3')).toBe(
      'sandbox-npm://esm.sh/@scope/pkg@1.2.3'
    );
  });

  it('routes an http url through the cache as well', () => {
    // Otherwise the renderer would need that origin in its CSP and the
    // package would be refetched on every run.
    expect(resolve('https://cdn.example.com/a/b.js?v=1')).toBe(
      'sandbox-npm://cdn.example.com/a/b.js?v=1'
    );
  });

  it('leaves an already resolved url alone', () => {
    expect(resolve('sandbox-npm://esm.sh/x')).toBe('sandbox-npm://esm.sh/x');
    expect(resolve('data:text/javascript,export default 1')).toBe(
      'data:text/javascript,export default 1'
    );
  });

  it('maps a polyfillable node builtin', () => {
    expect(resolve('node:path')).toBe('sandbox-npm://esm.sh/path');
  });

  it('explains a node builtin that cannot be polyfilled', () => {
    expect(() => resolve('node:fs')).toThrow(ModuleResolutionError);
    expect(() => resolve('node:fs')).toThrow(/Node mode/);
  });

  it('explains that relative imports are not supported yet', () => {
    // A silent failure here would look like the package was missing.
    expect(() => resolve('./helper.js')).toThrow(/Relative imports/);
    expect(() => resolve('/abs/helper.js')).toThrow(/Relative imports/);
  });

  it('rejects an empty specifier', () => {
    expect(() => resolve('  ')).toThrow(ModuleResolutionError);
    expect(() => resolve(null)).toThrow(ModuleResolutionError);
  });

  it('trims incidental whitespace', () => {
    expect(resolve('  lodash  ')).toBe('sandbox-npm://esm.sh/lodash');
  });
});
