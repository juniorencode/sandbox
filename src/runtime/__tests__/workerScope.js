import { vi } from 'vitest';

/**
 * Boots the runner worker inside the test process.
 *
 * A real worker scope has `self === globalThis`, and the runner relies on that
 * when it installs the sandbox console and the tracked timers as globals. The
 * harness has to alias them the same way or those paths are not under test.
 */
export const bootWorker = async () => {
  const posted = [];
  const listeners = new Map();

  vi.stubGlobal('self', globalThis);
  vi.stubGlobal('postMessage', message => posted.push(message));
  vi.stubGlobal('addEventListener', (type, handler) => {
    const existing = listeners.get(type) || [];
    listeners.set(type, [...existing, handler]);
  });

  await import('../runner.worker.js');
  // Calibration resolves on a microtask before the worker reports ready.
  await new Promise(resolve => setTimeout(resolve, 20));

  const settle = (ms = 60) => new Promise(resolve => setTimeout(resolve, ms));

  let runId = 0;

  const drive = async (code, waitMs) => {
    posted.length = 0;
    runId += 1;
    globalThis.onmessage({ data: { t: 'run', runId, code } });
    await settle(waitMs);
    return posted.slice();
  };

  return {
    posted,

    ready: () => posted.find(message => message.t === 'ready'),

    /** Runs code and resolves with the messages it produced. */
    run: (code, waitMs = 80) => drive(code, waitMs),

    /**
     * Same, but routes Node's unhandledRejection to the worker's own listener
     * for the duration of the run.
     *
     * In a browser the worker scope raises `unhandledrejection` itself. Here
     * the test runner owns that process event and would report the rejection
     * as a suite failure, so its listeners are parked while the case runs.
     */
    runExpectingRejection: async (code, waitMs = 150) => {
      const parked = process.listeners('unhandledRejection');
      process.removeAllListeners('unhandledRejection');
      const bridge = reason =>
        (listeners.get('unhandledrejection') || []).forEach(handler =>
          handler({ reason, preventDefault: () => {} })
        );
      process.on('unhandledRejection', bridge);
      try {
        return await drive(code, waitMs);
      } finally {
        process.removeListener('unhandledRejection', bridge);
        parked.forEach(handler => process.on('unhandledRejection', handler));
      }
    },

    send: message => globalThis.onmessage({ data: message }),

    /** Fires a worker-level event the way the browser would. */
    emitEvent: (type, event) =>
      (listeners.get(type) || []).forEach(handler => handler(event)),

    settle
  };
};

/** Convenience filters, since a run posts several message kinds. */
export const logs = messages => messages.filter(message => message.t === 'log');
export const errors = messages =>
  messages.filter(message => message.t === 'error');
export const settled = messages =>
  messages.find(message => message.t === 'settled');

/** Flattens a log message into `line:column level text` for readable asserts. */
export const describeLog = message =>
  `${message.line ?? '?'}:${message.column ?? '?'} ${message.level} ${message.values
    .map(value => value.v ?? value.special ?? value.t)
    .join(' ')}`;
