/**
 * Message protocol between the main thread and the runner worker.
 *
 * The old runner accumulated everything into a single string and posted it
 * once, at the end of a synchronous evaluation. That made async output
 * impossible to deliver and forced the output pane to guess line alignment by
 * padding newlines. Every message below carries its own source location and
 * sequence number, so the renderer can lay entries out per line and stream
 * them as they happen.
 */

// main -> worker
export const RUN = 'run';
export const CANCEL = 'cancel';
export const EXPAND = 'expand';
export const INIT = 'init';

// worker -> main
export const READY = 'ready';
export const LOG = 'log';
export const GROUP = 'group';
export const GROUP_END = 'groupEnd';
export const TABLE = 'table';
export const CLEAR = 'clear';
export const ERROR = 'error';
export const SETTLED = 'settled';
export const EXPANDED = 'expanded';

/** Console levels the renderer styles differently. */
export const LEVELS = ['log', 'info', 'warn', 'error', 'debug'];

/** Where a failure came from, so the renderer can word it correctly. */
export const PHASE_COMPILE = 'compile';
export const PHASE_RUNTIME = 'runtime';
export const PHASE_REJECTION = 'rejection';
export const PHASE_TIMEOUT = 'timeout';

/** Serialisation budget. Values past these limits are marked, never dropped. */
export const DEFAULT_LIMITS = {
  maxDepth: 5,
  maxItems: 100,
  maxStringLength: 10000,
  maxEntries: 100
};

/**
 * How long the worker keeps streaming after the top-level body settles, so
 * timers and promise callbacks still reach the pane.
 */
export const DEFAULT_ASYNC_GRACE_MS = 2000;

/** Watchdog budget for synchronous code, enforced from the main thread. */
export const DEFAULT_TIMEOUT_MS = 5000;
