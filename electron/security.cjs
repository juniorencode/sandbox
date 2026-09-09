const { shell } = require('electron');

/**
 * Renderer hardening.
 *
 * The window shipped with no Content Security Policy, no sandbox, and no
 * navigation guards, which Electron itself warns about at runtime. None of it
 * was exploited by the app's own code, but a scratchpad evaluates whatever is
 * pasted into it, so the shell around that should be as narrow as the product
 * allows.
 */

/**
 * `unsafe-eval` is required, not an oversight: the whole product is evaluating
 * user code, and AsyncFunction is governed by script-src. Everything else is
 * closed down. `connect-src` stays on 'self' until module loading is added,
 * which is the only feature that needs the network.
 */
const POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval'",
  // Monaco injects its own stylesheets at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  // Vite emits the runner and Monaco's language services as separate chunks.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'"
].join('; ');

const apply = (session, windowRef) => {
  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [POLICY]
      }
    });
  });

  // The app never needs a device or a notification, so nothing is granted.
  session.setPermissionRequestHandler((_contents, _permission, grant) =>
    grant(false)
  );
  session.setPermissionCheckHandler(() => false);
};

/**
 * Links open in the user's browser and the window itself cannot be navigated
 * away from the app. Without this, a link pasted into the editor and clicked
 * through could replace the renderer.
 */
const guardNavigation = contents => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  contents.on('will-attach-webview', event => event.preventDefault());
};

module.exports = { apply, guardNavigation, POLICY };
