import { describe, expect, it } from 'vitest';
import { instrument } from '../instrument.js';

describe('instrument', () => {
  it('bakes the call site into console calls', () => {
    const { code, located } = instrument("console.log('a')");
    expect(code).toBe("__sbx.at(1,1).log('a')");
    expect(located).toBe(true);
  });

  it('locates a call inside a callback by its own line', () => {
    const source = 'function f(){\n  [1,2].forEach(n => console.log(n))\n}\nf()';
    expect(instrument(source).code).toContain('__sbx.at(2,22).log(n)');
  });

  it('keeps optional chaining intact', () => {
    expect(instrument("console?.log('x')").code).toBe("__sbx.at(1,1)?.log('x')");
  });

  it.each([
    ['a top-level const', "const console = { log(){} };\nconsole.log('x')"],
    ['a function parameter', 'function f(console) { console.log(1) }'],
    ['an arrow parameter', 'const f = console => console.log(1)'],
    ['a catch binding', 'try {} catch (console) { console.log(1) }'],
    ['a class declaration', 'class console {}\nconsole.log(1)']
  ])('leaves console alone when %s shadows it', (_case, source) => {
    const result = instrument(source);
    expect(result.code).toBe(source);
    expect(result.located).toBe(false);
  });

  describe('module syntax, which AsyncFunction rejects outright', () => {
    it.each([
      ['default', "import d from 'm'", 'const { default: d } = await import(__sbx.resolve("m"));'],
      ['named', "import { a, b as c } from 'm'", 'const { a, b: c } = await import(__sbx.resolve("m"));'],
      ['namespace', "import * as ns from 'm'", 'const ns = await import(__sbx.resolve("m"));'],
      ['bare', "import 'm'", 'await import(__sbx.resolve("m"));']
    ])('rewrites a %s import', (_case, source, expected) => {
      expect(instrument(source).code).toBe(expected);
    });

    it('binds default and namespace separately when both are present', () => {
      const { code } = instrument("import d, * as ns from 'm'");
      expect(code).toBe(
        'const ns = await import(__sbx.resolve("m")); const d = ns.default;'
      );
    });

    it('strips export keywords but keeps the declarations', () => {
      expect(instrument('export const a = 1').code).toBe('const a = 1');
      expect(instrument('export default function hi(){}').code).toBe(
        'function hi(){}'
      );
      expect(instrument('export default 42').code).toBe('const __sbxDefault = 42');
      expect(instrument('const a=1;\nexport { a }').code.trim()).toBe('const a=1;');
      expect(instrument("export * from 'm'").code.trim()).toBe('');
    });
  });

  it('keeps top-level await, which used to be a syntax error', () => {
    const { code, error } = instrument('const r = await Promise.resolve(1)');
    expect(error).toBeNull();
    expect(code).toContain('await Promise.resolve(1)');
  });

  it('reports a syntax error with a precise position', () => {
    const { error } = instrument('const x = {\n  a: 1,\n  b:');
    expect(error).toMatchObject({ line: 3, column: 5 });
    // The position is reported separately, so it is not repeated in the text.
    expect(error.message).not.toMatch(/\(\d+:\d+\)/);
  });

  it('passes an empty program through untouched', () => {
    expect(instrument('   ')).toEqual({
      code: '   ',
      located: false,
      error: null
    });
  });

  it('locates every call independently, including nested ones', () => {
    const { code } = instrument('console.log(1)\nconsole.warn(2)');
    expect(code).toBe('__sbx.at(1,1).log(1)\n__sbx.at(2,1).warn(2)');
  });

  it('leaves console alone when it is used as a value', () => {
    // Not a call with console as the receiver, so there is no site to bake in.
    expect(instrument('const f = console.log').code).toBe(
      'const f = console.log'
    );
  });
});
