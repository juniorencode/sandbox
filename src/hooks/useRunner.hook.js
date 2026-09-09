import { useCallback, useEffect, useRef, useState } from 'react';
import { node } from '../platform';
import {
  RUN,
  CANCEL,
  EXPAND,
  INIT,
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
  const [transpiler, setTranspiler] = useState({ status: 'idle' });
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
  const activeRuntimeRef = useRef('browser');

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

  /**
   * One handler for both transports.
   *
   * The browser worker and the Node process speak the same protocol, so the
   * only difference between them is how a message arrives.
   */
  const handleMessage = useCallback(
    message => {
      if (!message) return;

      if (message.t === 'node-stdio') {
        // Writing to stdout is a normal thing to do in Node and would
        // otherwise have nowhere to go. Marked as unlocated, since a stream
        // write has no call site.
        schedule({
          t: LOG,
          entryId: nextEntryId++,
          runId: runIdRef.current,
          level: message.stream === 'stderr' ? 'error' : 'log',
          line: null,
          column: null,
          group: 0,
          values: [{ t: 'string', v: message.text.trimEnd() }],
          late: settledRef.current
        });
        return;
      }

      if (message.t === 'node-exit') {
        // The Node process died rather than being replaced, so nothing is
        // going to answer the run that was in flight.
        clearWatchdog();
        settledRef.current = true;
        setStatus(STATUS.IDLE);
        return;
      }

      if (message.t === READY) {
        // The same message reports the worker booting, the TypeScript
        // compiler finishing, and the Node runtime coming up.
        if (message.transpiler !== undefined) {
          setTranspiler(
            message.transpiler
              ? { status: 'ready' }
              : { status: 'error', message: message.error }
          );
          return;
        }
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
    },
    [clearWatchdog, schedule]
  );

  const spawn = useCallback(() => {
    const worker = new Worker(
      new URL('../runtime/runner.worker.js', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = event => handleMessage(event.data);
    workerRef.current = worker;
    return worker;
  }, [handleMessage]);

  /** Messages from the Node runtime arrive over IPC rather than a port. */
  useEffect(() => node.onMessage(handleMessage), [handleMessage]);

  /** Routes a message to whichever runtime the current run belongs to. */
  const send = useCallback((message, runtime) => {
    if (runtime === 'node') {
      node.send(message);
      return true;
    }
    const worker = workerRef.current;
    if (!worker) return false;
    worker.postMessage(message);
    return true;
  }, []);

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
      if (activeRuntimeRef.current === 'node') {
        // Killing the process is the only way to stop synchronous code there
        // too; the next run starts a fresh one.
        node.kill();
      } else {
        const worker = workerRef.current;
        if (worker) worker.terminate();
        spawn();
      }
      expandWaitersRef.current.clear();
      pendingRef.current = [];
      settledRef.current = true;
      setStatus(reason === PHASE_TIMEOUT ? STATUS.TIMEOUT : STATUS.IDLE);
    },
    [clearWatchdog, spawn]
  );

  /**
   * Hands the compiler its wasm binary. Lazy on purpose: a workspace that
   * only runs JavaScript never pays the cost of loading it.
   */
  const initTranspiler = useCallback(wasm => {
    const worker = workerRef.current;
    if (!worker) return;
    setTranspiler({ status: 'loading' });
    worker.postMessage({ t: INIT, wasm }, [wasm.buffer].filter(Boolean));
  }, []);

  const run = useCallback(
    (code, { language = 'javascript', runtime = 'browser' } = {}) => {
      if (runtime !== 'node' && !workerRef.current) return;
      activeRuntimeRef.current = runtime;

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
      send({ t: RUN, runId, code, options: { limits, language } }, runtime);

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
    [clearWatchdog, kill, limits, timeoutMs, send]
  );

  const stop = useCallback(() => {
    send({ t: CANCEL, runId: runIdRef.current }, activeRuntimeRef.current);
    kill('stopped');
  }, [kill, send]);

  const clear = useCallback(() => {
    pendingRef.current = [];
    setEntries([]);
    setOverflowed(false);
  }, []);

  /** Asks the worker for one more level of a node that hit a budget. */
  const expand = useCallback(id => {
    return new Promise(resolve => {
      expandWaitersRef.current.set(id, resolve);
      send({ t: EXPAND, runId: runIdRef.current, id }, activeRuntimeRef.current);
      // The worker may have been replaced mid-flight; do not hang the caller.
      setTimeout(() => {
        if (expandWaitersRef.current.delete(id)) resolve(null);
      }, 1000);
    });
  }, [send]);

  return {
    entries,
    status,
    duration,
    overflowed,
    transpiler,
    running: status === STATUS.RUNNING,
    run,
    stop,
    clear,
    expand,
    initTranspiler
  };
};
