import { DEFAULT_LIMITS } from './protocol.js';

/**
 * Structured value serialisation for the output pane.
 *
 * The previous runner ran every logged value through JSON.stringify, which is
 * the wrong tool for inspecting values: it threw on circular references and on
 * BigInt, turned Map and Set into `{}`, collapsed NaN and Infinity to null,
 * flattened Date to a string, dropped functions, symbols and undefined, and
 * lost class names. Worse, a throw inside the logger surfaced as if the user's
 * own code had failed.
 *
 * This serialiser emits type-tagged nodes instead, is cycle-safe, budget-bound,
 * and is written so that no input can make it throw: every branch that touches
 * user-controlled data is guarded, and the fallback is an `unknown` node.
 */

const objectTag = value => {
  try {
    return Object.prototype.toString.call(value);
  } catch {
    return '[object Unknown]';
  }
};

/** Constructor name, guarded: the prototype may be null or throw on access. */
const ctorName = value => {
  try {
    const name = value?.constructor?.name;
    return typeof name === 'string' && name ? name : null;
  } catch {
    return null;
  }
};

const functionKind = fn => {
  try {
    const src = Function.prototype.toString.call(fn);
    if (/^\s*class[\s{]/.test(src)) return 'class';
    if (/^\s*async/.test(src)) return 'async';
    if (/^\s*function\s*\*/.test(src)) return 'generator';
    if (!/^\s*(async\s+)?function/.test(src) && src.includes('=>')) return 'arrow';
    return 'function';
  } catch {
    return 'function';
  }
};

/** Short one-line label used for cycles, depth cut-offs and group headers. */
export const describe = value => {
  try {
    if (value === null) return 'null';
    const type = typeof value;
    if (type === 'undefined') return 'undefined';
    if (type === 'string') return JSON.stringify(value);
    if (type === 'number' || type === 'boolean') return String(value);
    if (type === 'bigint') return `${value}n`;
    if (type === 'symbol') return value.toString();
    if (type === 'function') {
      const kind = functionKind(value);
      const name = value.name || '(anonymous)';
      return kind === 'class' ? `class ${name}` : `f ${name}`;
    }
    if (Array.isArray(value)) return `Array(${value.length})`;
    const tag = objectTag(value);
    if (tag === '[object Map]') return `Map(${value.size})`;
    if (tag === '[object Set]') return `Set(${value.size})`;
    if (tag === '[object Date]') return 'Date';
    if (tag === '[object RegExp]') return String(value);
    if (value instanceof Error) return ctorName(value) || 'Error';
    return ctorName(value) || 'Object';
  } catch {
    return 'Unknown';
  }
};

const isTypedArray = value => {
  try {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
  } catch {
    return false;
  }
};

/**
 * Creates a serialiser bound to one run.
 *
 * Objects are kept in a registry keyed by id so the renderer can ask for one
 * more level of a node that hit the depth or item budget. The registry is
 * scoped to a single run and dropped when the next one starts, which keeps
 * lazy expansion available for the output on screen without retaining every
 * value the editor has ever produced.
 */
export const createSerializer = (limits = DEFAULT_LIMITS) => {
  const opts = { ...DEFAULT_LIMITS, ...limits };
  let registry = new Map();
  let nextId = 1;

  const remember = value => {
    const id = nextId++;
    registry.set(id, value);
    return id;
  };

  const serializeString = value => {
    if (value.length <= opts.maxStringLength) return { t: 'string', v: value };
    return {
      t: 'string',
      v: value.slice(0, opts.maxStringLength),
      truncated: true,
      length: value.length
    };
  };

  const serializeNumber = value => {
    if (Number.isNaN(value)) return { t: 'number', special: 'NaN' };
    if (value === Infinity) return { t: 'number', special: 'Infinity' };
    if (value === -Infinity) return { t: 'number', special: '-Infinity' };
    if (value === 0 && Object.is(value, -0)) return { t: 'number', special: '-0' };
    return { t: 'number', v: value };
  };

  /**
   * Own enumerable properties, including symbol keys. Getters are reported but
   * never invoked: evaluating one during logging can trigger side effects in
   * the user's code or throw, and neither belongs in a console read.
   */
  const ownEntries = (value, seen, depth) => {
    const entries = [];
    let truncated = false;
    let keys = [];
    try {
      keys = [
        ...Object.keys(value),
        ...Object.getOwnPropertySymbols(value).filter(sym => {
          try {
            return Object.getOwnPropertyDescriptor(value, sym)?.enumerable;
          } catch {
            return false;
          }
        })
      ];
    } catch {
      return { entries, truncated };
    }

    for (const key of keys) {
      if (entries.length >= opts.maxEntries) {
        truncated = true;
        break;
      }
      const label = typeof key === 'symbol' ? key.toString() : key;
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, key);
      } catch {
        entries.push([label, { t: 'unknown' }]);
        continue;
      }
      if (!descriptor) continue;
      if (typeof descriptor.get === 'function') {
        entries.push([label, { t: 'getter' }]);
        continue;
      }
      entries.push([label, walk(descriptor.value, seen, depth + 1)]);
    }
    return { entries, truncated };
  };

  const walk = (value, seen, depth) => {
    try {
      if (value === null) return { t: 'null' };

      const type = typeof value;
      if (type === 'undefined') return { t: 'undefined' };
      if (type === 'boolean') return { t: 'boolean', v: value };
      if (type === 'number') return serializeNumber(value);
      if (type === 'string') return serializeString(value);
      if (type === 'bigint') return { t: 'bigint', v: String(value) };
      if (type === 'symbol') return { t: 'symbol', v: value.toString() };
      if (type === 'function') {
        return {
          t: 'function',
          name: value.name || '',
          kind: functionKind(value),
          id: remember(value)
        };
      }

      // Cycle: the value is already on the current path.
      if (seen.has(value)) {
        return { t: 'ref', id: seen.get(value), label: describe(value) };
      }

      if (depth > opts.maxDepth) {
        return { t: 'deep', id: remember(value), label: describe(value) };
      }

      const id = remember(value);
      seen.set(value, id);

      try {
        const tag = objectTag(value);

        if (Array.isArray(value)) {
          const items = [];
          const length = value.length;
          const shown = Math.min(length, opts.maxItems);
          for (let i = 0; i < shown; i++) {
            items.push(walk(value[i], seen, depth + 1));
          }
          // Extra non-index properties, which arrays can legitimately carry.
          const extra = [];
          for (const key of Object.keys(value)) {
            if (!/^\d+$/.test(key) && extra.length < opts.maxEntries) {
              extra.push([key, walk(value[key], seen, depth + 1)]);
            }
          }
          return {
            t: 'array',
            id,
            items,
            length,
            truncated: shown < length,
            ...(extra.length ? { extra } : {})
          };
        }

        if (tag === '[object Map]') {
          const entries = [];
          let count = 0;
          for (const [key, val] of value) {
            if (count >= opts.maxItems) break;
            entries.push([walk(key, seen, depth + 1), walk(val, seen, depth + 1)]);
            count++;
          }
          return {
            t: 'map',
            id,
            entries,
            size: value.size,
            truncated: count < value.size
          };
        }

        if (tag === '[object Set]') {
          const items = [];
          let count = 0;
          for (const item of value) {
            if (count >= opts.maxItems) break;
            items.push(walk(item, seen, depth + 1));
            count++;
          }
          return {
            t: 'set',
            id,
            items,
            size: value.size,
            truncated: count < value.size
          };
        }

        if (tag === '[object WeakMap]') return { t: 'opaque', ctor: 'WeakMap' };
        if (tag === '[object WeakSet]') return { t: 'opaque', ctor: 'WeakSet' };

        if (tag === '[object Date]') {
          const time = value.getTime();
          return Number.isNaN(time)
            ? { t: 'date', invalid: true }
            : { t: 'date', v: value.toISOString(), ms: time };
        }

        if (tag === '[object RegExp]') return { t: 'regexp', v: String(value) };

        if (tag === '[object Promise]') return { t: 'promise', id };

        if (value instanceof Error) {
          const { entries } = ownEntries(value, seen, depth);
          return {
            t: 'error',
            id,
            name: String(value.name || 'Error'),
            message: String(value.message || ''),
            stack: typeof value.stack === 'string' ? value.stack : '',
            entries: entries.filter(([key]) => key !== 'stack' && key !== 'message')
          };
        }

        if (isTypedArray(value)) {
          const items = [];
          const shown = Math.min(value.length, opts.maxItems);
          for (let i = 0; i < shown; i++) {
            items.push(serializeNumber(Number(value[i])));
          }
          return {
            t: 'typedarray',
            id,
            ctor: ctorName(value) || 'TypedArray',
            items,
            length: value.length,
            truncated: shown < value.length
          };
        }

        const { entries, truncated } = ownEntries(value, seen, depth);
        const name = ctorName(value);
        return {
          t: 'object',
          id,
          // `Object` is the default and adds nothing; a class name does.
          ctor: name && name !== 'Object' ? name : null,
          nullProto: Object.getPrototypeOf(value) === null || undefined,
          entries,
          truncated
        };
      } finally {
        // Only the current path counts as a cycle. Two sibling references to
        // the same object should both render in full.
        seen.delete(value);
      }
    } catch {
      return { t: 'unknown' };
    }
  };

  return {
    serialize: value => walk(value, new Map(), 0),

    /** One more level of a node that hit a budget, for click-to-expand. */
    expand: id => {
      if (!registry.has(id)) return null;
      return walk(registry.get(id), new Map(), 0);
    },

    reset: () => {
      registry = new Map();
      nextId = 1;
    }
  };
};
