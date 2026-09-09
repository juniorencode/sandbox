import { describe, expect, it } from 'vitest';
import { transformSync } from 'esbuild';
import { createMapper, identityMapper } from '../sourcemap.js';

/**
 * Checked against real esbuild output rather than a hand-written map, because
 * the point of this module is to survive what the transpiler actually emits.
 * JSX is the case that matters: it does not preserve line positions, so
 * without mapping a console call in a .tsx tab would be reported against the
 * generated text.
 */
const compile = (source, loader) =>
  transformSync(source, {
    loader,
    sourcemap: 'external',
    sourcefile: 'sandbox',
    format: 'esm',
    target: 'esnext',
    jsx: 'automatic'
  });

/** Position of a marker in generated code, as 1-based line and column. */
const findMarker = (code, marker) => {
  const lines = code.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const column = lines[index].indexOf(marker);
    if (column !== -1) return { line: index + 1, column: column + 1 };
  }
  throw new Error(`marker ${marker} not found in output`);
};

describe('createMapper', () => {
  it('maps a stripped type annotation back to its own line', () => {
    const source = [
      'interface Point { x: number }',
      'const p: Point = { x: 1 }',
      'console.log(p.x)'
    ].join('\n');

    const result = compile(source, 'ts');
    const mapper = createMapper(result.map);
    const marker = findMarker(result.code, 'console.log');

    // The interface disappears, so the console call moves up in the output
    // while still belonging to line 3 of the source.
    expect(mapper.lookup(marker.line, marker.column).line).toBe(3);
  });

  it('maps a jsx expression back through its expansion', () => {
    const source = [
      'const name = "ada"',
      'const el = (',
      '  <div className="x">',
      '    {name}',
      '  </div>',
      ')',
      'console.log(typeof el)'
    ].join('\n');

    const result = compile(source, 'tsx');
    const mapper = createMapper(result.map);
    const marker = findMarker(result.code, 'console.log');

    expect(mapper.lookup(marker.line, marker.column).line).toBe(7);
  });

  it('picks the nearest mapping at or before the column', () => {
    const source = 'const a: number = 1; console.log(a); console.log(a + 1)';
    const result = compile(source, 'ts');
    const mapper = createMapper(result.map);

    const first = findMarker(result.code, 'console.log(a)');
    expect(mapper.lookup(first.line, first.column).line).toBe(1);
  });

  it('reports an empty map rather than guessing', () => {
    const mapper = createMapper('{"version":3,"sources":["x"],"mappings":""}');
    expect(mapper.empty).toBe(true);
    expect(mapper.lookup(1, 1)).toBeNull();
  });

  it('survives a map that is not valid json', () => {
    const mapper = createMapper('{ truncated');
    expect(mapper.empty).toBe(true);
    expect(mapper.lookup(1, 1)).toBeNull();
  });

  it('returns null for a line the map does not cover', () => {
    const result = compile('const a: number = 1', 'ts');
    const mapper = createMapper(result.map);
    expect(mapper.lookup(9999, 1)).toBeNull();
  });
});

describe('identityMapper', () => {
  it('reports positions unchanged, for untranspiled sources', () => {
    expect(identityMapper.lookup(4, 7)).toEqual({ line: 4, column: 7 });
    expect(identityMapper.empty).toBe(false);
  });
});
