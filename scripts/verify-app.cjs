/**
 * Smoke test for the packaged renderer.
 *
 * Unit tests cover the runner and the value rendering, but neither proves that
 * the app boots inside Electron: Monaco used to be fetched from a CDN, so the
 * editor pane rendered blank on any machine without network access and no unit
 * test could have caught it.
 *
 * This boots the real build in an Electron window, types into the editor with
 * native input events, and reads the resulting DOM. It adds no test-only hooks
 * to the app.
 *
 *   npm run build-vite && npm run verify:app
 *   npm run verify:app -- --show     # watch it happen in a visible window
 */
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow } = require('electron');
const store = require('../electron/store.cjs');
const ipc = require('../electron/ipc.cjs');

const ROOT = path.join(__dirname, '..');
const VISIBLE = process.argv.includes('--show');
const SHOT = process.argv.includes('--shot');
const ONLINE = process.argv.includes('--online');
const PANES = '.flex.min-h-0.flex-1 > div';

/**
 * Nothing here may hang.
 *
 * Electron shows a modal error dialog when the main script fails or stalls,
 * which is a terrible thing to leave on someone's desktop from a test run.
 */
const HARD_TIMEOUT_MS = 90000;

const problems = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const readState = win =>
  win.webContents.executeJavaScript(`
    (() => {
      const panes = document.querySelectorAll(${JSON.stringify(PANES)});
      return {
        monaco: !!document.querySelector('.monaco-editor'),
        status: (document.querySelector('.h-6') || {}).innerText || '',
        editor: panes[0] ? panes[0].innerText : '',
        output: panes[2] ? panes[2].innerText : ''
      };
    })()
  `);

const typeText = async (win, text) => {
  for (const char of text) {
    win.webContents.sendInputEvent({ type: 'char', keyCode: char });
    await sleep(6);
  }
};

const pressEnter = win => {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
};

const expect = (condition, message) => {
  if (!condition) problems.push(message);
};

app.commandLine.appendSwitch('disable-gpu');

const bail = message => {
  console.error(message);
  app.exit(1);
};

setTimeout(() => bail('\nFAILED: verification timed out'), HARD_TIMEOUT_MS);

process.on('uncaughtException', error =>
  bail('\nFAILED: ' + (error?.stack || error))
);

let currentWindow = null;

app.whenReady().then(async () => {
  // This script is its own Electron main process, so it has to register the
  // same channels main.cjs does or the renderer's workspace read has nothing
  // to talk to.
  ipc.register(() => currentWindow);

  const indexFile = path.join(ROOT, 'build', 'index.html');
  if (!fs.existsSync(indexFile)) {
    bail('No build found. Run `npm run build-vite` first.');
    return;
  }

  const win = new BrowserWindow({
    show: VISIBLE,
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(ROOT, 'preload.cjs')
    }
  });

  currentWindow = win;

  /**
   * The whole point of bundling Monaco was that the editor must not depend on
   * a network. @monaco-editor/loader still carries its default CDN URL as a
   * dead string in the bundle, so the only way to prove the override works is
   * to load the page with no network at all.
   */
  if (!ONLINE) {
    win.webContents.session.enableNetworkEmulation({ offline: true });
    win.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*'] },
      (details, callback) => {
        problems.push('the renderer tried to reach the network: ' + details.url);
        callback({ cancel: true });
      }
    );
  }

  win.webContents.on('console-message', (_event, level, message) => {
    // Electron's own CSP advisory is emitted as a warning in development
    // builds and is not something the page did wrong.
    if (level === 3 && !message.includes('Electron Security Warning')) {
      problems.push('renderer console error: ' + message);
    }
  });
  win.webContents.on('render-process-gone', (_event, details) =>
    problems.push('renderer gone: ' + JSON.stringify(details))
  );
  win.webContents.on('did-fail-load', (_event, code, description) =>
    problems.push(`did-fail-load ${code} ${description}`)
  );

  await win.loadFile(indexFile);
  await sleep(2500);

  // Start from a known workspace rather than whatever was last persisted.
  // The workspace is a file now, so clearing localStorage is not enough; the
  // 1.x keys are cleared too so the migration path does not repopulate it.
  await win.webContents.executeJavaScript('localStorage.clear(); true');
  const { file, backup } = store.paths();
  for (const target of [file, backup]) {
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch {
      /* a leftover workspace only makes the assertions stricter */
    }
  }
  await win.webContents.reload();
  await sleep(2500);

  const booted = await readState(win);
  expect(booted.monaco, 'Monaco did not mount (is it still loading from a CDN?)');
  expect(
    booted.status.includes('Ready'),
    `expected an idle status bar, got: ${JSON.stringify(booted.status)}`
  );

  win.webContents.focus();
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 300, y: 200, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'left', clickCount: 1 });
  await sleep(300);

  await typeText(win, 'const user = { name: "ada", langs: ["js","rust"] }');
  pressEnter(win);
  await typeText(win, 'console.log(user)');
  pressEnter(win);
  await typeText(win, 'console.log("plain string")');
  await sleep(1800);

  const ran = await readState(win);
  console.log('status :', JSON.stringify(ran.status.replace(/\n/g, ' | ')));
  console.log('output :', JSON.stringify(ran.output));

  expect(
    ran.output.includes('plain string'),
    'the last log did not reach the output pane'
  );
  expect(
    !ran.output.includes('"plain string"'),
    'a top-level string is still being printed with quotes'
  );
  expect(
    ran.output.includes('name') && ran.output.includes('Array(2)'),
    'the object preview did not render'
  );
  expect(
    ran.status.includes('Done'),
    `expected a settled status bar, got: ${JSON.stringify(ran.status)}`
  );

  if (SHOT) {
    const image = await win.webContents.capturePage();
    const target = path.join(ROOT, 'build', 'verify-app.png');
    fs.writeFileSync(target, image.toPNG());
    console.log('screenshot:', target);
  }

  if (problems.length) {
    console.error('\nFAILED');
    problems.forEach(problem => console.error('  - ' + problem));
  } else {
    console.log('\nOK');
  }

  app.exit(problems.length ? 1 : 0);
});
