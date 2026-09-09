import { beforeAll, describe, expect, it } from 'vitest';
import { bootWorker, describeLog, errors, logs, settled } from './workerScope.js';

/**
 * End-to-end runs against the real worker, one case per defect the previous
 * engine had. Each `it` name states the behaviour that used to be wrong.
 */
describe('runner worker', () => {
  let worker;

  beforeAll(async () => {
    worker = await bootWorker();
  });

  it('measures the wrapper line offset instead of assuming it', () => {
    expect(worker.ready()).toMatchObject({ t: 'ready' });
    expect(worker.ready().lineOffset).toBeGreaterThanOrEqual(1);
  });

  it('keeps a log on its own line after a multi-line value', async () => {
    const messages = await worker.run(
      'console.log([{a:1},{a:2}])\nconsole.log("second")'
    );
    expect(logs(messages).map(m => m.line)).toEqual([1, 2]);
  });

  it('reports a call site above the call that reached it', async () => {
    const messages = await worker.run(
      "function f(){ console.log('inner') }\nconsole.log('outer')\nf()"
    );
    // Arrival order is outer then inner, but each keeps its own line so the
    // pane can order them by position.
    expect(logs(messages).map(describeLog)).toEqual([
      '2:1 log outer',
      '1:15 log inner'
    ]);
  });

  it('keeps every iteration of a loop on the loop body line', async () => {
    const messages = await worker.run(
      'for (let i=0;i<3;i++) {\n  console.log(i)\n}\nconsole.log("after")'
    );
    expect(logs(messages).map(m => m.line)).toEqual([2, 2, 2, 4]);
  });

  it('delivers output logged from a timer, which used to be dropped', async () => {
    const messages = await worker.run(
      'setTimeout(()=>console.log("late"),5)\nconsole.log("sync")',
      120
    );
    const values = logs(messages).map(m => m.values[0].v);
    expect(values).toContain('sync');
    expect(values).toContain('late');
  });

  it('delivers output logged from a promise, which produced nothing', async () => {
    const messages = await worker.run(
      'Promise.resolve("resolved").then(v=>console.log(v))'
    );
    expect(logs(messages).map(m => m.values[0].v)).toEqual(['resolved']);
  });

  it('marks output that arrived after the body settled', async () => {
    const messages = await worker.run(
      'setTimeout(()=>console.log("after"),5)',
      120
    );
    expect(logs(messages)[0]).toMatchObject({ values: [{ v: 'after' }] });
    // The worker keeps streaming; the settled marker comes first.
    expect(messages.findIndex(m => m.t === 'settled')).toBeLessThan(
      messages.findIndex(m => m.t === 'log')
    );
  });

  it('supports top-level await, which was a syntax error', async () => {
    const messages = await worker.run(
      'const r = await Promise.resolve(42)\nconsole.log(r)'
    );
    expect(logs(messages)[0].values[0]).toEqual({ t: 'number', v: 42 });
  });

  it('reports a syntax error with its position', async () => {
    const messages = await worker.run('const x = {\n  a: 1,\n  b:');
    expect(errors(messages)[0]).toMatchObject({
      phase: 'compile',
      name: 'SyntaxError',
      line: 3,
      column: 5
    });
  });

  it('locates a runtime throw and keeps the output before it', async () => {
    const messages = await worker.run(
      'console.log("before")\nnull.x\nconsole.log("never")'
    );
    expect(logs(messages).map(m => m.values[0].v)).toEqual(['before']);
    expect(errors(messages)[0]).toMatchObject({
      phase: 'runtime',
      name: 'TypeError',
      line: 2
    });
  });

  it('reports an unhandled rejection, which was invisible', async () => {
    const messages = await worker.runExpectingRejection(
      'Promise.reject(new Error("no catch"))'
    );
    expect(errors(messages)[0]).toMatchObject({
      phase: 'rejection',
      message: 'no catch'
    });
  });

  it('reports a thrown non-Error', async () => {
    const messages = await worker.run('throw "just a string"');
    const failure = errors(messages)[0];
    expect(failure).toMatchObject({
      name: 'Uncaught',
      message: 'just a string'
    });
    // A value with no stack still has to report an array of frames, not a
    // different shape that every caller would have to guess at.
    expect(Array.isArray(failure.frames)).toBe(true);
  });

  it('survives user code sabotaging the logger', async () => {
    // Both of these broke the old stack-parsing logger, and the failure was
    // reported as if the user's own code had thrown.
    //
    // A real worker gets its own realm, but here the sandbox shares this
    // process, so the prototype has to be put back before anything else runs,
    // including the array helpers these assertions themselves use.
    const original = Object.getOwnPropertyDescriptor(
      Array.prototype,
      'filter'
    );
    const originalLimit = Error.stackTraceLimit;
    let messages;
    try {
      messages = await worker.run(
        'Error.stackTraceLimit = 0\nArray.prototype.filter = () => []\nconsole.log("still here")'
      );
    } finally {
      Object.defineProperty(Array.prototype, 'filter', original);
      Error.stackTraceLimit = originalLimit;
    }

    expect(errors(messages)).toHaveLength(0);
    expect(logs(messages)[0].values[0].v).toBe('still here');
  });

  it('distinguishes console levels', async () => {
    const messages = await worker.run(
      'console.info(1)\nconsole.warn(2)\nconsole.error(3)\nconsole.debug(4)'
    );
    expect(logs(messages).map(m => m.level)).toEqual([
      'info',
      'warn',
      'error',
      'debug'
    ]);
  });

  it('implements console.table', async () => {
    const messages = await worker.run(
      'console.table([{n:"a",v:1},{n:"b",v:2}])'
    );
    const table = messages.find(m => m.t === 'table');
    expect(table.columns).toEqual(['n', 'v']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].cells.n).toEqual({ t: 'string', v: 'a' });
  });

  it('implements group nesting depth', async () => {
    const messages = await worker.run(
      'console.group("g")\nconsole.log("in")\nconsole.groupEnd()\nconsole.log("out")'
    );
    expect(messages.find(m => m.t === 'group')).toMatchObject({ group: 0 });
    expect(logs(messages).map(m => [m.values[0].v, m.group])).toEqual([
      ['in', 1],
      ['out', 0]
    ]);
  });

  it('implements time, count and assert', async () => {
    const messages = await worker.run(
      'console.time("t")\nconsole.timeEnd("t")\nconsole.count("c")\nconsole.count("c")\nconsole.assert(false,"failed")'
    );
    const values = logs(messages).map(m => m.values[0].v);
    expect(values[0]).toMatch(/^t: /);
    expect(values.slice(1, 3)).toEqual(['c: 1', 'c: 2']);
    expect(logs(messages).at(-1)).toMatchObject({
      level: 'error',
      assertion: true
    });
  });

  it('lets user code shadow console without a redeclaration error', async () => {
    // As an AsyncFunction parameter this failed with "Identifier 'console'
    // has already been declared".
    const messages = await worker.run(
      'const console = { log: () => {} }\nconsole.log("silenced")'
    );
    expect(errors(messages)).toHaveLength(0);
    expect(logs(messages)).toHaveLength(0);
  });

  it('routes console used as a value through an unlocated console', async () => {
    const messages = await worker.run(
      'const alias = console.log\nalias("via alias")'
    );
    expect(logs(messages)[0]).toMatchObject({
      line: null,
      values: [{ v: 'via alias' }]
    });
  });

  it('clears timers left open by the previous run', async () => {
    await worker.run('setInterval(()=>console.log("tick"), 5)', 60);
    // A new run must not inherit the interval from the one before it.
    const messages = await worker.run('console.log("clean")', 90);
    expect(logs(messages).map(m => m.values[0].v)).toEqual(['clean']);
  });

  it('stamps messages with the run that produced them', async () => {
    const messages = await worker.run('console.log(1)');
    const ids = new Set(messages.filter(m => m.runId).map(m => m.runId));
    expect(ids.size).toBe(1);
  });

  it('reports duration on settle', async () => {
    const messages = await worker.run('console.log(1)');
    expect(settled(messages).durationMs).toBeGreaterThanOrEqual(0);
  });

  it('answers an expand request for the current run', async () => {
    const messages = await worker.run(
      'console.log({a:{b:{c:{d:{e:{f:{g:1}}}}}}})'
    );
    const root = logs(messages)[0].values[0];
    let node = root;
    while (node.t === 'object' && node.entries?.length) node = node.entries[0][1];
    expect(node.t).toBe('deep');

    worker.posted.length = 0;
    worker.send({ t: 'expand', runId: messages[0].runId, id: node.id });
    await worker.settle(20);
    expect(worker.posted[0]).toMatchObject({ t: 'expanded', id: node.id });
    expect(worker.posted[0].value.t).toBe('object');
  });

  it('marks an expand request from a superseded run as stale', async () => {
    worker.posted.length = 0;
    worker.send({ t: 'expand', runId: -1, id: 1 });
    await worker.settle(20);
    expect(worker.posted[0]).toMatchObject({ t: 'expanded', stale: true });
  });
});
