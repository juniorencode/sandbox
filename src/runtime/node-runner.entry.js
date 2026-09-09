import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  RUN,
  CANCEL,
  EXPAND,
  READY,
  ERROR,
  SETTLED,
  EXPANDED,
  PHASE_COMPILE,
  PHASE_RUNTIME,
  PHASE_REJECTION,
  DEFAULT_LIMITS
} from './protocol.js';
import { createSerializer } from './serialize.js';
import { createConsole } from './console.js';
import { instrument } from './instrument.js';
import {
  AsyncFunction,
  tagSource,
  calibrate,
  locate,
  cleanStack,
  describeThrown
} from './stack.js';

/**
 * The Node runtime for the sandbox.
 *
 * This is the one thing a desktop editor can do that a browser tab cannot,
 * and it is the reason the app stays on Electron: user code runs in a real
 * Node process with real `require`, real built-in modules, and packages
 * installed on disk. A browser worker can only ever approximate that.
 *
 * It reuses the same protocol, serializer, console and instrumentation as the
 * browser runner, so output looks identical and there is only one
 * implementation of each to maintain. Only three things differ: specifiers are
 * handed to Node's own resolution rather than rewritten to a registry URL,
 * `require` exists, and messages travel over the utility process port.
 *
 * Code here runs with the privileges of the app, which is why the renderer
 * treats it as opt-in per tab rather than a default.
 */

const port = process.parentPort;

let lineOffset = 2;
let activeRunId = null;
let activeEmit = null;
let activeSerializer = null;
let sequence = 0;
let requireFrom = null;

const PARAMS = ['__sbx'];

const nativeSetTimeout = globalThis.setTimeout;
const nativeClearTimeout = globalThis.clearTimeout;
const nativeSetInterval = globalThis.setInterval;
const nativeClearInterval = globalThis.clearInterval;

/**
 * Timers opened by the current run.
 *
 * The process is long lived, so an interval left behind by one evaluation
 * would keep firing over every later run, and here it would also keep the
 * process alive.
 */
const openTimeouts = new Set();
const openIntervals = new Set();

globalThis.setTimeout = (handler, delay, ...args) => {
  if (typeof handler !== 'function') return nativeSetTimeout(handler, delay);
  const id = nativeSetTimeout(
    (...called) => {
      openTimeouts.delete(id);
      handler(...called);
    },
    delay,
    ...args
  );
  openTimeouts.add(id);
  return id;
};
globalThis.clearTimeout = id => {
  openTimeouts.delete(id);
  return nativeClearTimeout(id);
};
globalThis.setInterval = (handler, delay, ...args) => {
  const id = nativeSetInterval(handler, delay, ...args);
  openIntervals.add(id);
  return id;
};
globalThis.clearInterval = id => {
  openIntervals.delete(id);
  return nativeClearInterval(id);
};

/**
 * Holds the process open.
 *
 * A utility process exits as soon as its event loop empties, and a listener on
 * the parent port is not enough to keep it referenced, so the runtime would
 * shut down moments after reporting ready and every run afterwards would find
 * nothing listening. Created from the captured native timer so clearing the
 * run's own timers cannot cancel it.
 */
const keepAlive = nativeSetInterval(() => {}, 1 << 30);

const clearOpenTimers = () => {
  openTimeouts.forEach(id => nativeClearTimeout(id));
  openIntervals.forEach(id => nativeClearInterval(id));
  openTimeouts.clear();
  openIntervals.clear();
};

const post = message => {
  try {
    port.postMessage(message);
  } catch {
    // The parent is gone; there is nothing to recover.
  }
};

const makeEmitter = runId => payload =>
  post({ ...payload, runId, seq: sequence++ });

const reportThrow = (emit, thrown, phase) => {
  const { name, message } = describeThrown(thrown);
  const at = locate(thrown, lineOffset);
  emit({
    t: ERROR,
    phase,
    name,
    message,
    line: at?.line ?? null,
    column: at?.column ?? null,
    frames: cleanStack(thrown, lineOffset)
  });
};

const run = async ({ runId, code, options }) => {
  activeRunId = runId;
  clearOpenTimers();

  const serializer = createSerializer({ ...DEFAULT_LIMITS, ...options?.limits });
  const emit = makeEmitter(runId);
  activeEmit = emit;
  activeSerializer = serializer;

  const sandboxConsole = createConsole({
    emit,
    serialize: serializer.serialize
  });

  // Installed as globals rather than parameters so user code can shadow them,
  // the same reasoning as in the browser runner.
  globalThis.console = sandboxConsole.fallback;

  const { code: transformed, error: syntaxError } = instrument(code);

  if (syntaxError) {
    emit({
      t: ERROR,
      phase: PHASE_COMPILE,
      name: 'SyntaxError',
      message: syntaxError.message,
      line: syntaxError.line,
      column: syntaxError.column,
      frames: []
    });
    emit({ t: SETTLED, durationMs: 0 });
    return;
  }

  const started = performance.now();

  try {
    const body = new AsyncFunction(...PARAMS, tagSource(transformed));
    await body({
      at: sandboxConsole.at,
      // Node resolves specifiers itself, which is the whole point of this
      // runtime: `fs`, `path` and anything installed under the node-mode
      // directory all work as they would in a script.
      resolve: specifier => specifier
    });
  } catch (thrown) {
    reportThrow(emit, thrown, PHASE_RUNTIME);
  }

  emit({ t: SETTLED, durationMs: performance.now() - started });
};

port.on('message', event => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  switch (message.t) {
    case 'configure':
      requireFrom = message.requireFrom;
      // A require bound to a directory the user controls, so `npm install`
      // there makes packages available to every Node-mode tab.
      globalThis.require = createRequire(
        path.join(requireFrom, 'package.json')
      );
      globalThis.__dirname = requireFrom;
      break;

    case RUN:
      run(message);
      break;

    case CANCEL:
      clearOpenTimers();
      activeRunId = null;
      activeEmit = null;
      break;

    case EXPAND: {
      if (message.runId !== activeRunId || !activeSerializer) {
        post({
          t: EXPANDED,
          runId: message.runId,
          id: message.id,
          value: null,
          stale: true
        });
        return;
      }
      post({
        t: EXPANDED,
        runId: message.runId,
        id: message.id,
        value: activeSerializer.expand(message.id)
      });
      break;
    }

    default:
      break;
  }
});

/** Releases the anchor so the process can exit when the parent asks it to. */
const release = () => nativeClearInterval(keepAlive);

process.on('exit', release);

process.on('unhandledRejection', reason => {
  if (activeEmit) reportThrow(activeEmit, reason, PHASE_REJECTION);
});

process.on('uncaughtException', error => {
  if (activeEmit) reportThrow(activeEmit, error, PHASE_RUNTIME);
});

calibrate(PARAMS).then(offset => {
  lineOffset = offset;
  post({ t: READY, lineOffset: offset, runtime: 'node' });
});
