const fs = require('fs');
const path = require('path');
const { utilityProcess } = require('electron');

/**
 * The Node runtime, as a child process.
 *
 * A utility process rather than a hidden window: it is a real Node runtime
 * with no Chromium attached, it can be killed outright when code will not
 * stop, and it keeps user code out of the process that owns the window.
 *
 * The child is started on demand. A workspace that never turns Node mode on
 * never spawns it.
 */

const RUNTIME_FILE = 'node-runner.cjs';
const REQUIRE_DIR = 'node-mode';

/**
 * A package.json is what makes `createRequire` resolve from this directory,
 * so `npm install` there puts packages within reach of every Node-mode tab.
 */
const ensureRequireDir = userData => {
  const directory = path.join(userData, REQUIRE_DIR);
  try {
    fs.mkdirSync(directory, { recursive: true });
    const manifest = path.join(directory, 'package.json');
    if (!fs.existsSync(manifest)) {
      fs.writeFileSync(
        manifest,
        JSON.stringify(
          {
            name: 'sandbox-node-mode',
            private: true,
            description:
              'Packages installed here are available to Node-mode tabs. Run npm install in this folder.',
            dependencies: {}
          },
          null,
          2
        ),
        'utf8'
      );
    }
  } catch {
    // The runtime still works for built-ins; only local packages are lost.
  }
  return directory;
};

const createNodeRuntime = (getWindow, { userData }) => {
  const runtimePath = path.join(__dirname, '..', 'build', RUNTIME_FILE);
  const requireDir = ensureRequireDir(userData);

  let child = null;
  let spawned = false;
  /**
   * Messages sent before the child reports `spawn` are dropped by Electron, so
   * they wait here. The first of them is always `configure`, without which
   * `require` would be missing from every run.
   */
  let queue = [];

  /**
   * The child's exit event can fire while the app is shutting down, when the
   * window object still exists but its contents are destroyed, so sending
   * without this check throws "Object has been destroyed".
   */
  const notify = payload => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send('node:message', payload);
  };

  const deliver = message => {
    if (!spawned) {
      queue.push(message);
      return { ok: true, queued: true };
    }
    try {
      child.postMessage(message);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  };

  const spawn = () => {
    if (child) return { ok: true };
    if (!fs.existsSync(runtimePath)) {
      return { ok: false, error: 'The Node runtime is missing from this build' };
    }

    try {
      child = utilityProcess.fork(runtimePath, [], {
        serviceName: 'sandbox-node-runtime',
        // Piped rather than ignored or inherited. Ignoring made a child that
        // failed to start completely silent, and inheriting did not reliably
        // surface anything either. Piping also means process.stdout.write from
        // user code can reach the output pane, which is a real thing to do in
        // Node and has nowhere else to go.
        stdio: 'pipe'
      });

      const forward = (stream, name) =>
        stream?.on('data', chunk =>
          notify({ t: 'node-stdio', stream: name, text: String(chunk) })
        );
      forward(child.stdout, 'stdout');
      forward(child.stderr, 'stderr');

      child.on('message', message => notify(message));

      child.on('spawn', () => {
        spawned = true;
        const pending = queue;
        queue = [];
        pending.forEach(message => child?.postMessage(message));
      });

      child.on('exit', code => {
        child = null;
        spawned = false;
        queue = [];
        // The child died rather than being replaced, so the renderer needs to
        // know it should stop waiting for the run in flight.
        notify({ t: 'node-exit', code });
      });

      deliver({ t: 'configure', requireFrom: requireDir });
      return { ok: true };
    } catch (error) {
      child = null;
      return { ok: false, error: String(error?.message || error) };
    }
  };

  return {
    start: spawn,

    send: message => {
      const started = spawn();
      if (!started.ok) return started;
      return deliver(message);
    },

    /**
     * Synchronous code in Node cannot be interrupted any more than it can in a
     * worker, so stopping means killing the process and letting the next run
     * start a fresh one.
     */
    kill: () => {
      if (!child) return { ok: true };
      try {
        child.kill();
      } catch {
        // Already gone.
      }
      child = null;
      return { ok: true };
    },

    dispose: () => {
      if (child) {
        try {
          child.kill();
        } catch {
          /* already gone */
        }
        child = null;
      }
    },

    paths: () => ({ requireDir, runtimePath })
  };
};

module.exports = { createNodeRuntime };
