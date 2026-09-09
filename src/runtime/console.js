import { LOG, GROUP, GROUP_END, TABLE, CLEAR } from './protocol.js';

/**
 * The console surface handed to user code.
 *
 * Previously only `log` did anything: `debug`, `info`, `warn` and `error` were
 * aliased to it with no way to tell them apart, and the other sixteen methods
 * were bound to empty functions, so `console.table`, `group`, `time`, `count`,
 * `assert` and `dir` silently did nothing.
 *
 * `at(line, column)` returns a console bound to a source location, which is
 * what the instrumented call sites use. Every method is wrapped so that no
 * argument can make the logger itself throw: a failure inside logging used to
 * be caught by the runner and misreported as an error in the user's code.
 */

const asLabel = value => (value === undefined ? 'default' : String(value));

const formatDuration = ms =>
  ms >= 1000 ? `${(ms / 1000).toFixed(3)}s` : `${ms.toFixed(3)}ms`;

/**
 * Column/row model for console.table.
 *
 * Arrays are indexed by position, plain objects by key. Rows that are not
 * objects get a single "Value" column, matching what devtools shows.
 */
const buildTable = (data, only, serialize) => {
  const isArray = Array.isArray(data);
  let source;
  try {
    source = isArray
      ? data.map((value, index) => [String(index), value])
      : Object.entries(data);
  } catch {
    return null;
  }

  const columns = [];
  let hasValueColumn = false;

  source.forEach(([, value]) => {
    const objectLike = value !== null && typeof value === 'object';
    if (!objectLike) {
      hasValueColumn = true;
      return;
    }
    try {
      const keys = Array.isArray(value)
        ? value.map((_, index) => String(index))
        : Object.keys(value);
      keys.forEach(key => {
        if (!columns.includes(key)) columns.push(key);
      });
    } catch {
      hasValueColumn = true;
    }
  });

  const selected = Array.isArray(only)
    ? columns.filter(column => only.includes(column))
    : columns;

  const rows = source.map(([key, value]) => {
    const objectLike = value !== null && typeof value === 'object';
    const cells = {};
    if (objectLike) {
      selected.forEach(column => {
        try {
          if (Object.prototype.hasOwnProperty.call(value, column)) {
            cells[column] = serialize(value[column]);
          }
        } catch {
          /* leave the cell empty */
        }
      });
    }
    return {
      key,
      cells,
      value: objectLike ? null : serialize(value)
    };
  });

  return { columns: selected, rows, hasValueColumn };
};

export const createConsole = ({ emit, serialize }) => {
  const timers = new Map();
  const counts = new Map();
  const cache = new Map();
  let groupDepth = 0;

  // A logger must never be able to break the program it is observing.
  const post = payload => {
    try {
      emit(payload);
    } catch {
      /* the channel is gone; there is nothing useful to do here */
    }
  };

  const values = args => {
    try {
      return args.map(arg => {
        try {
          return serialize(arg);
        } catch {
          return { t: 'unknown' };
        }
      });
    } catch {
      return [];
    }
  };

  const build = (line, column) => {
    const site = { line, column };

    const write = (level, args, extra) =>
      post({
        t: LOG,
        level,
        line: site.line,
        column: site.column,
        group: groupDepth,
        values: values(args),
        ...extra
      });

    const api = {
      log: (...args) => write('log', args),
      info: (...args) => write('info', args),
      warn: (...args) => write('warn', args),
      error: (...args) => write('error', args),
      debug: (...args) => write('debug', args),

      /** Forces the object view even for values that render as one line. */
      dir: value => write('log', [value], { dir: true }),

      dirxml: (...args) => write('log', args, { dir: true }),

      trace: (...args) => {
        let stack = '';
        try {
          stack = new Error().stack || '';
        } catch {
          /* stacks are best effort */
        }
        write('trace', args, { stack });
      },

      assert: (condition, ...args) => {
        if (condition) return;
        write('error', args, { assertion: true });
      },

      table: (data, only) => {
        if (data === null || typeof data !== 'object') {
          write('log', [data]);
          return;
        }
        const table = buildTable(data, only, serialize);
        if (!table) {
          write('log', [data]);
          return;
        }
        post({
          t: TABLE,
          line: site.line,
          column: site.column,
          group: groupDepth,
          ...table
        });
      },

      group: (...args) => {
        post({
          t: GROUP,
          line: site.line,
          column: site.column,
          group: groupDepth,
          collapsed: false,
          values: values(args)
        });
        groupDepth++;
      },

      groupCollapsed: (...args) => {
        post({
          t: GROUP,
          line: site.line,
          column: site.column,
          group: groupDepth,
          collapsed: true,
          values: values(args)
        });
        groupDepth++;
      },

      groupEnd: () => {
        if (groupDepth === 0) return;
        groupDepth--;
        post({ t: GROUP_END, group: groupDepth });
      },

      time: label => {
        const key = asLabel(label);
        if (timers.has(key)) {
          write('warn', [`Timer '${key}' already exists`]);
          return;
        }
        timers.set(key, performance.now());
      },

      timeLog: (label, ...args) => {
        const key = asLabel(label);
        if (!timers.has(key)) {
          write('warn', [`Timer '${key}' does not exist`]);
          return;
        }
        const elapsed = performance.now() - timers.get(key);
        write('log', [`${key}: ${formatDuration(elapsed)}`, ...args], {
          timing: true
        });
      },

      timeEnd: label => {
        const key = asLabel(label);
        if (!timers.has(key)) {
          write('warn', [`Timer '${key}' does not exist`]);
          return;
        }
        const elapsed = performance.now() - timers.get(key);
        timers.delete(key);
        write('log', [`${key}: ${formatDuration(elapsed)}`], { timing: true });
      },

      count: label => {
        const key = asLabel(label);
        const next = (counts.get(key) || 0) + 1;
        counts.set(key, next);
        write('log', [`${key}: ${next}`], { counting: true });
      },

      countReset: label => {
        const key = asLabel(label);
        if (!counts.has(key)) {
          write('warn', [`Count for '${key}' does not exist`]);
          return;
        }
        counts.set(key, 0);
      },

      clear: () => {
        groupDepth = 0;
        post({ t: CLEAR });
      },

      // Profiling has no meaning in this sandbox but must stay callable.
      profile: () => {},
      profileEnd: () => {},
      timeStamp: () => {}
    };

    return api;
  };

  const fallback = build(null, null);

  return {
    /**
     * Console bound to a source location. Memoised per site so a call inside a
     * hot loop does not allocate a new object on every iteration.
     */
    at: (line, column) => {
      const key = `${line}:${column}`;
      let located = cache.get(key);
      if (!located) {
        located = build(line, column);
        cache.set(key, located);
      }
      return located;
    },

    /**
     * Unlocated console, used when the instrumentation was skipped (user code
     * shadows `console`) or when console is passed around as a value.
     */
    fallback,

    reset: () => {
      timers.clear();
      counts.clear();
      cache.clear();
      groupDepth = 0;
    }
  };
};
