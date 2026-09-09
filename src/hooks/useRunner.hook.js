import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RUN,
  CANCEL,
  EXPAND,
  READY,
  LOG,
  GROUP,
  GROUP_END,
  TABLE,
  CLEAR,
  ERROR,
  SETTLED,
  EXPANDED,
  PHASE_TIMEOUT,
  DEFAULT_TIMEOUT_MS
} from '../runtime/protocol.js';

/**
 * Owns the runner worker and the output it streams.
 *
 * Replaces useWorker, which created and terminated a worker inside an effect
 * keyed on `[tabs, activeTab]`. Because `tabs` changed on every debounced
 * keystroke, that effect tore down the worker and built a new one on each
 * edit, then posted the code a second time. Every keystroke therefore ran the
 * user's code twice in two different workers, doubling CPU and side effects
 * (a fetch fired twice), and the first result was often discarded by the
 * terminate that followed. `setWorker` is async, so a fast typist could also
 * post to a worker that had already been terminated and lose the output.
 *
 * Here a single worker lives for the lifetime of the hook. Runs are identified
 * by an incrementing id so late messages from a superseded run are dropped
 * instead of overwriting current output, and the worker is only ever replaced
 * when it has to be killed.
 */

const MAX_ENTRIES = 2000;

export const STATUS = {
  STARTING: 'starting',
  IDLE: 'idle',
  RUNNING: 'running',
  SETTLED: 'settled',
  TIMEOUT: 'timeout'
};

let nextEntryId = 1;

export const useRunner = ({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  limits,
  enabled = true
} = {}) => {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState(STATUS.STARTING);
  const [duration, setDuration] = useState(null);
  const [overflowed, setOverflowed] = useState(false);

  const workerRef = useRef(null);
  const runIdRef = useRef(0);
  const settledRef = useRef(true);
  const watchdogRef = useRef(null);
  const pendingRef = useRef([]);
  const frameRef = useRef(null);
  const expandWaitersRef = useRef(new Map());

  // Streaming one setState per message would re-render once per console call;
  // a loop logging a thousand times would render a thousand times. Messages
  // are collected and flushed on the next frame instead.
  const flush = useCallback(() => {
    frameRef.current = null;
    const batch = pendingRef.current;
    if (!batch.length) return;
    pendingRef.current = [];

    setEntries(previous => {
      let next = previous;
      for (const message of batch) {
        if (message.t === CLEAR) {
          next = [];
          continue;
        }
        if (next === previous) next = previous.slice();
        next.push(message);
      }
      if (next.length > MAX_ENTRIES) {
        setOverflowed(true);
        return next.slice(next.length - MAX_ENTRIES);
      }
      return next;
    });
  }, []);

  const schedule = useCallback(
    message => {
      pendingRef.current.push(message);
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(flush);
      }
    },
    [flush]
  );

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const spawn = useCallback(() => {
    const worker = new Worker(
      new URL('../runtime/runner.worker.js', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = event => {
      const message = event.data;
      if (!message) return;

      if (message.t === READY) {
        setStatus(current =>
          current === STATUS.STARTING ? STATUS.IDLE : current
        );
        return;
      }

      if (message.t === EXPANDED) {
        const waiter = expandWaitersRef.current.get(message.id);
        if (waiter) {
          expandWaitersRef.current.delete(message.id);
          waiter(message.stale ? null : message.value);
        }
        return;
      }

      // A superseded run can still be streaming. Its output is no longer on
      // screen, so drop it rather than mixing it into the current run.
      if (message.runId !== runIdRef.current) return;

      switch (message.t) {
        case SETTLED:
          clearWatchdog();
          settledRef.current = true;
          setDuration(message.durationMs);
          setStatus(STATUS.SETTLED);
          break;

        case LOG:
        case GROUP:
        case GROUP_END:
        case TABLE:
        case ERROR:
        case CLEAR:
          // Output arriving after the body settled came from a timer or a
          // promise callback; the pane marks it so the ordering is not
          // mistaken for a bug.
          schedule({
            ...message,
            entryId: nextEntryId++,
            late: settledRef.current
          });
          break;

        default:
          break;
      }
    };

    workerRef.current = worker;
    return worker;
  }, [clearWatchdog, schedule]);

  useEffect(() => {
    if (!enabled) return undefined;
    const worker = spawn();
    return () => {
      clearWatchdog();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      worker.terminate();
      workerRef.current = null;
    };
  }, [enabled, spawn, clearWatchdog]);

  /**
   * Kills the worker and starts a fresh one.
   *
   * Synchronous code never returns to the event loop, so a `while (true)`
   * cannot be stopped by posting it a message: terminating is the only option.
   * The old build had no stop button and no timeout at all, so an infinite
   * loop pinned a core forever while the pane kept showing stale output with
   * no indication anything was wrong.
   */
  const kill = useCallback(
    reason => {
      clearWatchdog();
      const worker = workerRef.current;
      if (worker) worker.terminate();
      expandWaitersRef.current.clear();
      pendingRef.current = [];
      settledRef.current = true;
      setStatus(reason === PHASE_TIMEOUT ? STATUS.TIMEOUT : STATUS.IDLE);
      spawn();
    },
    [clearWatchdog, spawn]
  );

  const run = useCallback(
    code => {
      const worker = workerRef.current;
      if (!worker) return;

      const runId = runIdRef.current + 1;
      runIdRef.current = runId;

      clearWatchdog();
      pendingRef.current = [];
      settledRef.current = false;
      setEntries([]);
      setOverflowed(false);
      setDuration(null);

      if (!code.trim()) {
        settledRef.current = true;
        setStatus(STATUS.IDLE);
        return;
      }

      setStatus(STATUS.RUNNING);
      worker.postMessage({ t: RUN, runId, code, options: { limits } });

      watchdogRef.current = setTimeout(() => {
        watchdogRef.current = null;
        const entry = {
          t: ERROR,
          entryId: nextEntryId++,
          runId,
          phase: PHASE_TIMEOUT,
          name: 'Timeout',
          message: `Execution exceeded ${timeoutMs}ms and was stopped`,
          line: null,
          column: null,
          frames: []
        };
        setEntries(previous => [...previous, entry]);
        kill(PHASE_TIMEOUT);
      }, timeoutMs);
    },
    [clearWatchdog, kill, limits, timeoutMs]
  );

  const stop = useCallback(() => {
    const worker = workerRef.current;
    if (worker) worker.postMessage({ t: CANCEL, runId: runIdRef.current });
    kill('stopped');
  }, [kill]);

  const clear = useCallback(() => {
    pendingRef.current = [];
    setEntries([]);
    setOverflowed(false);
  }, []);

  /** Asks the worker for one more level of a node that hit a budget. */
  const expand = useCallback(id => {
    const worker = workerRef.current;
    if (!worker) return Promise.resolve(null);
    return new Promise(resolve => {
      expandWaitersRef.current.set(id, resolve);
      worker.postMessage({ t: EXPAND, runId: runIdRef.current, id });
      // The worker may have been replaced mid-flight; do not hang the caller.
      setTimeout(() => {
        if (expandWaitersRef.current.delete(id)) resolve(null);
      }, 1000);
    });
  }, []);

  return {
    entries,
    status,
    duration,
    overflowed,
    running: status === STATUS.RUNNING,
    run,
    stop,
    clear,
    expand
  };
};
