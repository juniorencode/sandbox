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
const { app, BrowserWindow, clipboard, session } = require('electron');
const store = require('../electron/store.cjs');
const ipc = require('../electron/ipc.cjs');
const security = require('../electron/security.cjs');
const modules = require('../electron/modules.cjs');
const menu = require('../electron/menu.cjs');
const { createNodeRuntime } = require('../electron/nodeMode.cjs');

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
        status: (document.querySelector('[role="contentinfo"]') || {}).innerText || '',
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

/** Status bar text is multi-line; collapse it for a readable log line. */
const oneLine = text => String(text ?? '').split(/\r?\n/).join(' | ');

/**
 * Monaco renders some spaces as non-breaking spaces, so text read out of its
 * DOM does not compare equal to the source it was typed from. Assertions on
 * editor text go through this.
 */
const normalize = text =>
  String(text ?? '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ');

/**
 * Opens a menu group's submenu.
 *
 * The events are dispatched rather than driven with a real pointer move: a
 * hidden window does no compositor hit-testing, so `sendInputEvent` mouseMove
 * never produces the enter event a hover depends on. What is under test here
 * is the component's own reaction to that event, which is the part this
 * project owns.
 */
const openSubmenu = (win, groupName) =>
  win.webContents.executeJavaScript(`
    (() => {
      const row = [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
        .filter(item => item.getAttribute('aria-haspopup') === 'menu')
        .find(item => item.textContent.trim().startsWith(${JSON.stringify(
          groupName
        )}));
      if (!row) return Promise.resolve({ error: 'no-group' });
      row.parentElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      row.parentElement.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      return new Promise(resolve => setTimeout(() => resolve({
        expanded: row.getAttribute('aria-expanded') === 'true',
        items: [...document.querySelectorAll('[role="menu"] button[role="menuitem"]')]
          .map(node => node.textContent.trim())
      }), 250));
    })()
  `);

app.commandLine.appendSwitch('disable-gpu');

// Privileged schemes must be declared before the app is ready, exactly as
// main.cjs does it, or `import()` of the module scheme is rejected.
modules.registerScheme();

const bail = message => {
  console.error(message);
  app.exit(1);
};

setTimeout(() => bail('\nFAILED: verification timed out'), HARD_TIMEOUT_MS);

process.on('uncaughtException', error =>
  bail('\nFAILED: ' + (error?.stack || error))
);

// Without this, a throw inside the async main body became an unhandled
// rejection: the script simply stopped, and the only signal was the hard
// timeout, which says nothing about what actually went wrong.
process.on('unhandledRejection', reason =>
  bail('\nFAILED (unhandled rejection): ' + (reason?.stack || reason))
);

let currentWindow = null;

app.whenReady().then(async () => {
  // This script is its own Electron main process, so it has to register the
  // same channels main.cjs does or the renderer's workspace read has nothing
  // to talk to.

  // The same policy main.cjs installs. A Content Security Policy that is too
  // strict only breaks in a packaged build, so it has to be part of what is
  // being verified rather than something the harness relaxes.
  security.apply(session.defaultSession);

  const moduleServer = modules.createModuleServer(app.getPath('userData'), {
    allow: () => true
  });
  moduleServer.install();

  const nodeRuntime = createNodeRuntime(() => currentWindow, {
    userData: app.getPath('userData')
  });

  ipc.register(() => currentWindow, { moduleServer, nodeRuntime });
  menu.install(() => currentWindow);

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
      // Mirrors main.cjs: the renderer ships sandboxed.
      sandbox: true,
      preload: path.join(ROOT, 'preload.cjs')
    }
  });

  security.guardNavigation(win.webContents);

  // Temporary diagnostic: logs what the main process actually sends the
  // renderer on the node channel.
  if (process.argv.includes('--trace-node')) {
    const originalSend = win.webContents.send.bind(win.webContents);
    win.webContents.send = (channel, payload) => {
      if (channel === 'node:message') {
        const text =
          payload?.t === 'node-stdio'
            ? payload.stream + ': ' + payload.text.trim()
            : JSON.stringify(payload).slice(0, 300);
        console.log('  <node ipc>', text);
      }
      return originalSend(channel, payload);
    };
  }

  currentWindow = win;

  // Declared once: both the initial reset and the module phase clear these.
  const { file: workspaceFile, backup: workspaceBackup } = store.paths();

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
    // A blocked resource is reported as a warning, not an error, so it has to
    // be matched explicitly or a too-strict policy passes unnoticed.
    if (/Content Security Policy|Refused to/i.test(message)) {
      problems.push('CSP blocked something: ' + message);
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
  for (const target of [workspaceFile, workspaceBackup]) {
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

  /**
   * Module loading, which the previous engine could not do at all.
   *
   * Runs in both modes on purpose: offline is where the design has to prove
   * itself, since serving modules over a private scheme from a disk cache is
   * only worth the machinery if a package used once keeps working with no
   * network. It is skipped only when there is neither a cache nor a network.
   */
  const cache = moduleServer.stats();
  if (ONLINE || cache.count > 0) {
    await win.webContents.executeJavaScript('localStorage.clear(); true');
    for (const target of [workspaceFile, workspaceBackup]) {
      try {
        if (fs.existsSync(target)) fs.unlinkSync(target);
      } catch {
        /* nothing to clean */
      }
    }
    await win.webContents.reload();
    await sleep(2500);

    win.webContents.focus();
    win.webContents.sendInputEvent({ type: 'mouseDown', x: 300, y: 200, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'left', clickCount: 1 });
    await sleep(300);

    await typeText(win, "import { nanoid } from 'nanoid'");
    pressEnter(win);
    await typeText(win, 'console.log(typeof nanoid(), nanoid().length)');
    // The first run has to reach the registry, so this waits longer.
    await sleep(9000);

    const imported = await readState(win);
    console.log(
      'import :',
      JSON.stringify(imported.output),
      ONLINE ? '(network allowed)' : `(offline, ${cache.count} cached files)`
    );
    expect(
      imported.output.includes('string') && imported.output.includes('21'),
      `an npm import did not produce a value: ${JSON.stringify(imported.output)}`
    );
  } else {
    console.log('import : skipped (no cached packages and no network)');
  }

  /**
   * TypeScript, which the previous engine could not run at all: a type
   * annotation was a syntax error from the evaluator with no explanation.
   *
   * The compiler is loaded on demand, so this also covers the lazy wasm
   * handover, and the assertion on the reported line covers the source map
   * mapping: without it a console call would be reported against the
   * generated text rather than what was typed.
   */
  await win.webContents.executeJavaScript('localStorage.clear(); true');
  for (const target of [workspaceFile, workspaceBackup]) {
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch {
      /* nothing to clean */
    }
  }
  await win.webContents.reload();
  await sleep(2500);

  const switched = await win.webContents.executeJavaScript(`
    (() => {
      const select = document.querySelector(
        'select[aria-label="Language for this tab"]'
      );
      if (!select) return false;
      select.value = 'typescript';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return select.value;
    })()
  `);
  if (switched !== 'typescript') {
    problems.push(`the language selector did not switch: ${switched}`);
  }

  await sleep(500);
  win.webContents.focus();
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 300, y: 200, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'left', clickCount: 1 });
  await sleep(300);

  await typeText(win, 'interface P { x: number }');
  pressEnter(win);
  await typeText(win, 'const p: P = { x: 41 }');
  pressEnter(win);
  await typeText(win, 'console.log(p.x + 1)');
  // The 14 MB compiler is fetched and initialised on demand.
  await sleep(9000);

  const typescript = await readState(win);
  console.log('ts     :', JSON.stringify(typescript.output));
  expect(
    typescript.output.includes('42'),
    `typescript did not run: ${JSON.stringify(typescript.output)}`
  );


  /**
   * Node mode: the one thing a browser tab cannot do, and the reason the app
   * stays on Electron. Also covers the confirmation gate, since switching a
   * tab into Node mode moves it out of the sandbox.
   */
  await win.webContents.executeJavaScript('localStorage.clear(); true');
  for (const target of [workspaceFile, workspaceBackup]) {
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch {
      /* nothing to clean */
    }
  }
  await win.webContents.reload();
  await sleep(2500);

  const gated = await win.webContents.executeJavaScript(`
    (() => {
      const runtime = document.querySelector(
        'select[aria-label="Runtime for this tab"]'
      );
      if (!runtime) return 'no-select';
      runtime.value = 'node';
      runtime.dispatchEvent(new Event('change', { bubbles: true }));
      return 'switched';
    })()
  `);
  if (gated !== 'switched') problems.push('the runtime selector was not found');

  await sleep(400);
  const confirmed = await win.webContents.executeJavaScript(`
    (() => {
      const button = [...document.querySelectorAll('button')].find(
        node => node.textContent.trim() === 'Enable Node mode'
      );
      if (!button) return false;
      button.click();
      return true;
    })()
  `);
  if (!confirmed) {
    problems.push('the Node mode confirmation did not appear');
  }

  await sleep(600);
  win.webContents.focus();
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 300, y: 200, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'left', clickCount: 1 });
  await sleep(300);

  await typeText(win, 'const os = require("os")');
  pressEnter(win);
  await typeText(win, 'console.log(typeof os.platform(), typeof process.pid)');
  await sleep(5000);

  const nodeRun = await readState(win);
  const activeRuntime = await win.webContents.executeJavaScript(
    `(document.querySelector('select[aria-label="Runtime for this tab"]') || {}).value || '?'`
  );
  console.log('node   :', JSON.stringify(nodeRun.output), '| runtime =', activeRuntime);
  console.log('  status:', JSON.stringify(oneLine(nodeRun.status)));
  console.log('  editor:', JSON.stringify(nodeRun.editor.slice(0, 120)));
  expect(
    nodeRun.output.includes('string') && nodeRun.output.includes('number'),
    `node mode did not run: ${JSON.stringify(nodeRun.output)}`
  );


  /**
   * A large run, which used to freeze the app: every entry was a live DOM
   * node. The pane renders only what is near the viewport now, so the node
   * count has to stay bounded no matter how much is logged.
   */
  await win.webContents.executeJavaScript('localStorage.clear(); true');
  for (const target of [workspaceFile, workspaceBackup]) {
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch {
      /* nothing to clean */
    }
  }
  await win.webContents.reload();
  await sleep(2500);

  win.webContents.focus();
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 300, y: 200, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'left', clickCount: 1 });
  await sleep(300);

  const started = Date.now();
  await typeText(win, 'for (let i = 0; i < 5000; i++) console.log("row", i)');
  await sleep(4000);

  const bulk = await win.webContents.executeJavaScript(`
    (() => {
      const panes = document.querySelectorAll(${JSON.stringify(PANES)});
      const pane = panes[2];
      return {
        entries: (document.querySelector('[role="contentinfo"]') || {}).innerText || '',
        blocks: pane ? pane.querySelectorAll('.absolute.inset-x-0.px-4').length : -1,
        nodes: pane ? pane.querySelectorAll('*').length : -1
      };
    })()
  `);
  const elapsed = Date.now() - started;

  console.log(
    'bulk   :',
    oneLine(bulk.entries).split(' | ').slice(0, 3).join(' | '),
    '| blocks in dom =',
    bulk.blocks,
    '| total nodes =',
    bulk.nodes,
    '|',
    elapsed + 'ms'
  );

  expect(
    bulk.entries.includes('5000 entries'),
    `expected 5000 entries, status was: ${JSON.stringify(oneLine(bulk.entries))}`
  );
  expect(
    bulk.blocks > 0 && bulk.blocks < 200,
    `the output pane is not virtualised: ${bulk.blocks} blocks rendered for 5000 entries`
  );
  // The window still has to answer, which is what the freeze took away.
  const responsive = await win.webContents.executeJavaScript('1 + 1');
  expect(responsive === 2, 'the renderer stopped responding under load');


  /**
   * Both themes. The app had a single hardcoded palette, so this checks that
   * the token layer actually reaches the page: the root attribute, the painted
   * background, and Monaco's own theme all have to change together.
   */
  const readAppearance = () =>
    win.webContents.executeJavaScript(`
      (() => {
        const root = document.documentElement;
        const monaco = document.querySelector('.monaco-editor');
        return {
          attribute: root.dataset.theme || '(unset)',
          scheme: getComputedStyle(root).colorScheme,
          body: getComputedStyle(document.body).backgroundColor,
          token: getComputedStyle(root).getPropertyValue('--c-app').trim(),
          editor: monaco ? getComputedStyle(monaco).backgroundColor : null
        };
      })()
    `);

  const setTheme = value =>
    win.webContents.executeJavaScript(`
      (() => {
        const open = document.querySelector('button[aria-label="Settings"]');
        if (!open) return 'no-settings-button';
        open.click();
        return new Promise(resolve => setTimeout(() => {
          const select = document.querySelector('select[aria-label="Theme"]');
          if (!select) return resolve('no-theme-select');
          select.value = ${JSON.stringify('PLACEHOLDER')};
          select.dispatchEvent(new Event('change', { bubbles: true }));
          document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
          );
          resolve('ok');
        }, 250));
      })()
    `.replace('PLACEHOLDER', value));

  const asDark = await (async () => {
    const outcome = await setTheme('dark');
    if (outcome !== 'ok') problems.push('could not reach the theme setting: ' + outcome);
    await sleep(700);
    return readAppearance();
  })();
  console.log('theme  : dark  ->', JSON.stringify(asDark));

  const asLight = await (async () => {
    await setTheme('light');
    await sleep(700);
    return readAppearance();
  })();
  console.log('theme  : light ->', JSON.stringify(asLight));

  expect(asDark.attribute === 'dark', 'the dark theme did not reach the root element');
  expect(asLight.attribute === 'light', 'the light theme did not reach the root element');
  expect(
    asDark.token !== asLight.token,
    `the colour tokens did not change between themes: ${asDark.token} vs ${asLight.token}`
  );
  expect(
    asDark.body !== asLight.body,
    `the painted background did not change: ${asDark.body} vs ${asLight.body}`
  );
  expect(
    asDark.editor !== asLight.editor,
    `Monaco kept the same theme: ${asDark.editor} vs ${asLight.editor}`
  );
  expect(
    asLight.scheme === 'light',
    `color-scheme was not applied: ${asLight.scheme}`
  );


  /**
   * Sharing. There was no way to get a snippet out of the app, and no way
   * back in. A link would be the obvious shape but nothing hosts this editor,
   * so what has to work is a token that round-trips through the clipboard.
   */
  await win.webContents.executeJavaScript('localStorage.clear(); true');
  for (const target of [workspaceFile, workspaceBackup]) {
    try {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    } catch {
      /* nothing to clean */
    }
  }
  await win.webContents.reload();
  await sleep(2500);

  win.webContents.focus();
  win.webContents.sendInputEvent({ type: 'mouseDown', x: 300, y: 200, button: 'left', clickCount: 1 });
  win.webContents.sendInputEvent({ type: 'mouseUp', x: 300, y: 200, button: 'left', clickCount: 1 });
  await sleep(300);

  const shared = 'const shared = 41 + 1';
  await typeText(win, shared);
  await sleep(900);

  clipboard.writeText('');

  /**
   * Runs a registered command through the palette. The keyboard path for these
   * is a menu accelerator in the packaged app, so going through the registry
   * is both deterministic here and the same code path.
   */
  const runCommand = async title => {
    const script =
      '(() => {' +
      "  const open = [...document.querySelectorAll('button')].find(" +
      "    node => node.textContent.trim() === 'Commands');" +
      "  if (!open) return 'no-commands-button';" +
      '  open.click();' +
      '  return new Promise(resolve => setTimeout(() => {' +
      "    const entry = [...document.querySelectorAll('[role=\"option\"]')]" +
      '      .find(node => node.textContent.includes(' +
      JSON.stringify(title) +
      '));' +
      "    if (!entry) return resolve('no-entry');" +
      '    entry.click();' +
      "    resolve('ran');" +
      '  }, 300));' +
      '})()';
    return win.webContents.executeJavaScript(script);
  };

  expect(
    (await runCommand('Copy shareable snippet')) === 'ran',
    'the copy command is not in the palette'
  );
  await sleep(1500);
  const token = clipboard.readText();
  console.log(
    'share  : token =',
    token ? token.slice(0, 24) + '… (' + token.length + ' chars)' : '(empty)'
  );
  expect(
    /^sandbox:\d+:[rz]:/.test(token),
    'no shareable token reached the clipboard: ' + JSON.stringify(token.slice(0, 60))
  );

  expect(
    (await runCommand('Open shared snippet')) === 'ran',
    'the paste command is not in the palette'
  );
  await sleep(1800);

  const reopened = await win.webContents.executeJavaScript(`
    (() => {
      const tabs = [
        ...document.querySelectorAll('.drag-bar .tab button[aria-label^="Close "]')
      ].map(node => node.getAttribute('aria-label').replace('Close ', ''));
      const panes = document.querySelectorAll(${JSON.stringify(PANES)});
      return { tabs, editor: panes[0] ? panes[0].innerText : '' };
    })()
  `);
  console.log('share  : tabs after paste =', JSON.stringify(reopened.tabs));

  expect(
    reopened.tabs.length === 2,
    `pasting a snippet did not open a tab: ${JSON.stringify(reopened.tabs)}`
  );
  expect(
    normalize(reopened.editor).includes('41 + 1'),
    `the reopened tab does not hold the shared code: ${JSON.stringify(reopened.editor)}`
  );


  /**
   * The in-app menu. The native menu is never drawn on a frameless window, so
   * this is the only browsable surface for the commands, and it is built from
   * the command registry rather than from a second list.
   */
  const menuState = await win.webContents.executeJavaScript(`
    (() => {
      const button = document.querySelector('button[aria-label="Application menu"]');
      if (!button) return Promise.resolve({ error: 'no-menu-button' });
      button.click();
      // The click sets state; React has not rendered the menu in this tick.
      return new Promise(resolve => setTimeout(() => resolve({
        groups: [...document.querySelectorAll('[role="menu"] [role="menuitem"]')]
          .filter(node => node.getAttribute('aria-haspopup') === 'menu')
          .map(node => node.textContent.trim())
      }), 250));
    })()
  `);
  console.log('menu   : groups =', JSON.stringify(menuState.groups || menuState.error));

  expect(!menuState.error, 'the menu button was not found: ' + menuState.error);
  expect(
    (menuState.groups || []).includes('Run') &&
      (menuState.groups || []).includes('File') &&
      (menuState.groups || []).includes('Window'),
    'the menu is missing command groups: ' + JSON.stringify(menuState.groups)
  );

  // Hovering a group has to open its submenu, which is how the menu is
  // navigated at all.
  const opened = await openSubmenu(win, 'Run');
  const items = opened.items || [];
  console.log('menu   : Run submenu =', JSON.stringify(items));

  expect(!opened.error, 'the Run group row was not found: ' + opened.error);
  expect(opened.expanded, 'the group row did not report itself as expanded');
  expect(
    items.some(text => text.startsWith('Clear output')),
    'hovering a group did not open its submenu: ' + JSON.stringify(items)
  );
  expect(
    items.some(text => /Ctrl/.test(text)),
    'submenu entries do not show their keyboard binding'
  );

  // Escape has to close it, since it covers the editor.
  await win.webContents.executeJavaScript(`
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    ); true
  `);
  await sleep(300);
  const closed = await win.webContents.executeJavaScript(
    `document.querySelectorAll('[role="menu"]').length === 0`
  );
  expect(closed, 'Escape did not close the menu');

  // The window icon has to exist where main.cjs looks for it, or the taskbar
  // falls back to the host executable's icon, which is how this was found.
  expect(
    fs.existsSync(path.join(ROOT, 'icon.ico')),
    'icon.ico is missing from the location main.cjs points the window at'
  );

  if (SHOT) {
    await win.webContents.executeJavaScript(
      `document.querySelector('button[aria-label="Application menu"]').click(); true`
    );
    await sleep(400);
    const shown = await openSubmenu(win, 'Run');
    await sleep(500);
    // Confirmed open at capture time, so a picture without the submenu means
    // the hidden window composited late rather than the menu not working.
    console.log(
      'menu   : submenu open for the screenshot =',
      shown.expanded === true
    );
    const withMenu = await win.webContents.capturePage();
    fs.writeFileSync(
      path.join(ROOT, 'build', 'verify-app-menu.png'),
      withMenu.toPNG()
    );
    console.log('screenshot: build/verify-app-menu.png');

    for (const [name, value] of [['light', 'light'], ['dark', 'dark']]) {
      await setTheme(value);
      await sleep(800);
      const themed = await win.webContents.capturePage();
      fs.writeFileSync(
        path.join(ROOT, 'build', `verify-app-${name}.png`),
        themed.toPNG()
      );
      console.log('screenshot:', `build/verify-app-${name}.png`);
    }
  }

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

  nodeRuntime.dispose();
  app.exit(problems.length ? 1 : 0);
});
