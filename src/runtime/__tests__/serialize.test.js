import { describe, expect, it } from 'vitest';
import { createSerializer, describe as label } from '../serialize.js';

/**
 * Regression cases for the values JSON.stringify handled wrongly or not at
 * all. Two of them used to abort the whole evaluation.
 */
describe('createSerializer', () => {
  const serialize = value => createSerializer().serialize(value);

  it('emits a reference instead of throwing on a cycle', () => {
    const node = {};
    node.self = node;
    const result = serialize(node);
    expect(result.t).toBe('object');
    expect(result.entries[0][1]).toEqual({
      t: 'ref',
      id: result.id,
      label: 'Object'
    });
  });

  it('renders sibling references to the same object in full', () => {
    const shared = { a: 1 };
    const result = serialize({ x: shared, y: shared });
    expect(result.entries[0][1].t).toBe('object');
    expect(result.entries[1][1].t).toBe('object');
  });

  it('keeps bigint and symbol, which used to abort the run', () => {
    expect(serialize(10n)).toEqual({ t: 'bigint', v: '10' });
    expect(serialize(Symbol('s'))).toEqual({ t: 'symbol', v: 'Symbol(s)' });
  });

  it('keeps Map and Set contents, which collapsed to {}', () => {
    const map = serialize(new Map([['k', 1]]));
    expect(map.t).toBe('map');
    expect(map.size).toBe(1);
    expect(map.entries[0][0]).toEqual({ t: 'string', v: 'k' });

    const set = serialize(new Set([1, 2]));
    expect(set.t).toBe('set');
    expect(set.items).toHaveLength(2);
  });

  it('distinguishes the numbers that collapsed to null', () => {
    expect(serialize(NaN)).toEqual({ t: 'number', special: 'NaN' });
    expect(serialize(Infinity)).toEqual({ t: 'number', special: 'Infinity' });
    expect(serialize(-Infinity)).toEqual({ t: 'number', special: '-Infinity' });
    expect(serialize(-0)).toEqual({ t: 'number', special: '-0' });
    expect(serialize(1.5)).toEqual({ t: 'number', v: 1.5 });
  });

  it('keeps Date as a date and flags an invalid one', () => {
    expect(serialize(new Date(0))).toMatchObject({ t: 'date', ms: 0 });
    expect(serialize(new Date('nope'))).toEqual({ t: 'date', invalid: true });
  });

  it('preserves the class name that was lost', () => {
    class Point {
      constructor() {
        this.x = 1;
      }
    }
    expect(serialize(new Point())).toMatchObject({ t: 'object', ctor: 'Point' });
    // A plain object has no meaningful constructor label.
    expect(serialize({ x: 1 }).ctor).toBeNull();
  });

  it('reports a getter without invoking it', () => {
    let invoked = false;
    const value = Object.defineProperty({}, 'boom', {
      get() {
        invoked = true;
        throw new Error('side effect');
      },
      enumerable: true
    });
    expect(serialize(value).entries[0][1]).toEqual({ t: 'getter' });
    expect(invoked).toBe(false);
  });

  it('keeps functions with their kind', () => {
    expect(serialize(() => {})).toMatchObject({ t: 'function', kind: 'arrow' });
    expect(serialize(class Foo {})).toMatchObject({
      t: 'function',
      kind: 'class',
      name: 'Foo'
    });
    expect(serialize(async function bar() {})).toMatchObject({ kind: 'async' });
    expect(serialize(function* gen() {})).toMatchObject({ kind: 'generator' });
  });

  it('keeps non-index properties of an array', () => {
    const value = Object.assign([1, 2], { note: 'hi' });
    const result = serialize(value);
    expect(result.items).toHaveLength(2);
    expect(result.extra).toEqual([['note', { t: 'string', v: 'hi' }]]);
  });

  it('marks a null-prototype object', () => {
    const value = Object.assign(Object.create(null), { a: 1 });
    expect(serialize(value).nullProto).toBe(true);
  });

  it('cuts off at the depth budget and keeps the node expandable', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
    let node = createSerializer({ maxDepth: 2 }).serialize(deep);
    let hops = 0;
    while (node.t === 'object' && node.entries.length) {
      node = node.entries[0][1];
      hops += 1;
      if (hops > 10) break;
    }
    expect(node.t).toBe('deep');
    expect(typeof node.id).toBe('number');
  });

  it('truncates long strings and reports the real length', () => {
    const result = createSerializer({ maxStringLength: 5 }).serialize('abcdefgh');
    expect(result).toEqual({
      t: 'string',
      v: 'abcde',
      truncated: true,
      length: 8
    });
  });

  it('caps item counts and marks the container truncated', () => {
    const result = createSerializer({ maxItems: 2 }).serialize([1, 2, 3, 4]);
    expect(result.items).toHaveLength(2);
    expect(result.length).toBe(4);
    expect(result.truncated).toBe(true);
  });

  it('expands a truncated node one more level from the registry', () => {
    const serializer = createSerializer({ maxDepth: 0 });
    const root = serializer.serialize({ nested: { value: 42 } });
    const child = root.entries[0][1];
    expect(child.t).toBe('deep');

    const expanded = serializer.expand(child.id);
    expect(expanded.t).toBe('object');
    expect(expanded.entries).toEqual([['value', { t: 'number', v: 42 }]]);
  });

  it('drops the registry on reset so stale ids are not served', () => {
    const serializer = createSerializer({ maxDepth: 0 });
    const root = serializer.serialize({ nested: { value: 1 } });
    serializer.reset();
    expect(serializer.expand(root.entries[0][1].id)).toBeNull();
  });

  it('never throws, whatever it is handed', () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('no keys for you');
        }
      }
    );
    expect(() => serialize(hostile)).not.toThrow();

    const lying = {
      get constructor() {
        throw new Error('nope');
      }
    };
    expect(() => serialize(lying)).not.toThrow();
  });
});

describe('describe', () => {
  it('labels values for previews and cycle markers', () => {
    expect(label([1, 2, 3])).toBe('Array(3)');
    expect(label(new Map([['a', 1]]))).toBe('Map(1)');
    expect(label(new Set())).toBe('Set(0)');
    expect(label(new TypeError('x'))).toBe('TypeError');
    expect(label(/ab/g)).toBe('/ab/g');
    expect(label(10n)).toBe('10n');
    expect(label(null)).toBe('null');
    expect(label(undefined)).toBe('undefined');
  });
});
