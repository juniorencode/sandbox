/**
 * Monaco is loaded from the local `monaco-editor` package instead of a CDN.
 *
 * `@monaco-editor/react` delegates to `@monaco-editor/loader`, which by default
 * injects a <script> from cdn.jsdelivr.net. Under Electron the app is served
 * from file:// with no network guarantee, so that default leaves the editor
 * pane blank whenever the machine is offline. Wiring the bundled copy through
 * `loader.config` keeps everything inside the installer.
 *
 * The imports below are deliberately granular. Pulling the `monaco-editor`
 * barrel drags in every language Monaco ships (abap, solidity, pgsql...), which
 * this app never uses. Importing `editor.all` plus the typescript contribution
 * keeps all editor features while shipping only the languages we run.
 */
import 'monaco-editor/esm/vs/editor/editor.all.js';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { loader } from '@monaco-editor/react';

import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Monaco resolves its language services through this global hook. Vite turns
// each `?worker` import into a real bundled worker, so nothing is fetched.
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'javascript' || label === 'typescript') return new TsWorker();
    return new EditorWorker();
  }
};

loader.config({ monaco });

export { monaco };
