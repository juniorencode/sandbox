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
 * The evaluation worker.
 *
 * Three things changed relative to the original runner:
 *
 *   - The body is evaluated through AsyncFunction, so `await` at the top level
 *     works and promise callbacks are actually awaited. The old runner used
 *     `new Function` and posted its output synchronously the moment the body
 *     returned, which meant anything logged from a timer or a `.then()` was
 *     written into a string that had already been sent. A `console.log` inside
 *     a promise produced completely empty output.
 *   - Output is streamed as individual located messages instead of one string.
 *   - The worker is long lived. The old hook created and terminated a worker on
 *     every keystroke, which ran the user's code twice per edit. Persisting it
 *     means leftover timers now have to be tracked explicitly, which the code
 *     below does.
 */

/**
 * Only the instrumentation handle is passed as a parameter.
 *
 * Handing `console` and the timers in as parameters looked tidier but made
 * them un-shadowable: a parameter and a top-level `const` of the same name
 * live in the same scope, so user code containing `const console = ...` died
 * with "Identifier 'console' has already been declared" instead of simply
 * overriding it. Installing them on the worker's global scope instead lets
 * user code shadow them the way it would in any other environment.
 */
const PARAMS = ['__sbx'];

/** Captured before anything is replaced, so the wrappers can call through. */
const nativeSetTimeout = self.setTimeout.bind(self);
const nativeClearTimeout = self.clearTimeout.bind(self);
const nativeSetInterval = self.setInterval.bind(self);
const nativeClearInterval = self.clearInterval.bind(self);

let lineOffset = 2;
let activeRunId = null;
let activeEmit = null;
let activeSerializer = null;
let sequence = 0;

/**
 * Timer handles opened by the current run.
 *
 * A persistent worker means a `setInterval` left behind by one evaluation
 * would keep firing over every later run. Timers are handed to user code as
 * shadowed parameters so the originals stay untouched for the worker itself.
 */
const openTimeouts = new Set();
const openIntervals = new Set();

const tracked = {
  setTimeout: (handler, delay, ...args) => {
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
  },
  clearTimeout: id => {
    openTimeouts.delete(id);
    return nativeClearTimeout(id);
  },
  setInterval: (handler, delay, ...args) => {
    const id = nativeSetInterval(handler, delay, ...args);
    openIntervals.add(id);
    return id;
  },
  clearInterval: id => {
    openIntervals.delete(id);
    return nativeClearInterval(id);
  }
};

const clearOpenTimers = () => {
  openTimeouts.forEach(id => nativeClearTimeout(id));
  openIntervals.forEach(id => nativeClearInterval(id));
  openTimeouts.clear();
  openIntervals.clear();
};

// Installed once. User code sees the tracked timers as its globals, while the
// worker keeps calling the natives it captured above.
self.setTimeout = tracked.setTimeout;
self.clearTimeout = tracked.clearTimeout;
self.setInterval = tracked.setInterval;
self.clearInterval = tracked.clearInterval;

/**
 * Bare module specifiers are handed here at runtime by the instrumented code.
 * Resolution is intentionally a seam so where modules come from can change
 * without touching the transform.
 */
const resolveSpecifier = specifier => specifier;

const makeEmitter = runId => payload => {
  try {
    self.postMessage({ ...payload, runId, seq: sequence++ });
  } catch {
    // Values are serialised before they reach here, so a structured-clone
    // failure means the channel itself is gone. Nothing to recover.
  }
};

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

  // The global console is what unlocated calls resolve to: code that shadows
  // `console`, or passes it around as a value rather than calling it directly.
  self.console = sandboxConsole.fallback;

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
    await body({ at: sandboxConsole.at, resolve: resolveSpecifier });
  } catch (thrown) {
    reportThrow(emit, thrown, PHASE_RUNTIME);
  }

  // The run is reported as settled but the worker keeps streaming: a timer or
  // an unresolved promise can still produce output, and it is delivered with
  // this same runId so the renderer can append it.
  emit({ t: SETTLED, durationMs: performance.now() - started });
};

self.onmessage = event => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  switch (message.t) {
    case RUN:
      run(message);
      break;

    case CANCEL:
      // Only reaches the worker for asynchronous work. Code stuck in a
      // synchronous loop never returns to the event loop, so the main thread
      // terminates the worker instead.
      clearOpenTimers();
      activeRunId = null;
      activeEmit = null;
      break;

    case EXPAND: {
      if (message.runId !== activeRunId || !activeSerializer) {
        self.postMessage({
          t: EXPANDED,
          runId: message.runId,
          id: message.id,
          value: null,
          stale: true
        });
        return;
      }
      self.postMessage({
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
};

// Failures that escape the top-level body: a rejected promise nobody handled,
// or a throw inside a timer callback. Neither reached the old runner at all.
self.addEventListener('unhandledrejection', event => {
  event.preventDefault();
  if (activeEmit) reportThrow(activeEmit, event.reason, PHASE_REJECTION);
});

self.addEventListener('error', event => {
  event.preventDefault();
  if (activeEmit) reportThrow(activeEmit, event.error ?? event, PHASE_RUNTIME);
});

calibrate(PARAMS).then(offset => {
  lineOffset = offset;
  self.postMessage({ t: READY, lineOffset: offset });
});
