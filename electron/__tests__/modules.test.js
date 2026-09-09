import { describe, expect, it } from 'vitest';
import modulesModule from '../modules.cjs';

const { rewrite, SCHEME } = modulesModule;

describe('module source rewriting', () => {
  it('moves absolute registry urls onto the private scheme', () => {
    const source = 'import a from "https://esm.sh/react@18/index.js";';
    expect(rewrite(source)).toBe(
      `import a from "${SCHEME}://esm.sh/react@18/index.js";`
    );
  });

  it('leaves relative specifiers untouched', () => {
    // These resolve against the importing module's own sandbox-npm url, so
    // rewriting them would break the graph rather than fix it.
    const source = 'export * from "/lodash@4.17.21/es2022/lodash.mjs";';
    expect(rewrite(source)).toBe(source);
  });

  it('handles several urls in one module', () => {
    const source =
      'import a from "https://esm.sh/a";import b from "https://cdn.jsdelivr.net/b";';
    expect(rewrite(source)).toBe(
      `import a from "${SCHEME}://esm.sh/a";import b from "${SCHEME}://cdn.jsdelivr.net/b";`
    );
  });
});
