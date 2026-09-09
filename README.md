# Sandbox

A hot-reloading scratchpad for JavaScript, built with **Electron**, **Vite**,
**React** and **Monaco**. Type on the left, see what each line produced on the
right.

## Installation

Install the program. Nothing is fetched at runtime, so it works offline from
the first launch.

## Features

### Running code

- Runs as you type, or on demand with `Ctrl+Enter` when auto-run is off.
- Output is anchored to the line that produced it, in line order rather than
  arrival order, so a log from a function defined above its own call site
  appears next to its statement and a multi-line value does not shift
  everything below it.
- `await` works at the top level, and output from timers and promise callbacks
  reaches the pane after the body settles, marked as late.
- A stop button and a configurable timeout. Synchronous code cannot be
  interrupted, so both work by terminating the runtime and starting a fresh
  one.
- Errors report their line and column, underline the offending line in the
  editor, and list clickable stack frames. Unhandled rejections and throws
  inside timer callbacks are reported too.

### Output

- Values render as collapsible trees with a one-level preview, the way a
  devtools console does. `Map`, `Set`, `Date`, `BigInt`, `Symbol`, typed
  arrays, class names, circular references and getters all render as
  themselves; getters are shown but never invoked.
- Top-level strings print unquoted.
- The full console API: `table`, `group`, `groupCollapsed`, `time`, `timeEnd`,
  `count`, `assert`, `dir`, `trace`, and distinct styling per level.
- Virtualised: only entries near the viewport are in the DOM, so a run that
  logs thousands of times stays responsive.

### Languages and packages

- JavaScript, JSX, TypeScript and TSX, per tab. The compiler loads on demand,
  and positions are mapped back through its source map so locations refer to
  what you wrote.
- `import` from npm by name. Packages are served from a local cache through a
  private scheme, so a package is downloaded once and then works offline, and
  downloads can be turned off without breaking what is already cached.
- **Node mode**, per tab: evaluates in a real Node process with real
  `require`, the built-in modules, and packages installed under the Node mode
  folder. It runs with the app's privileges rather than in a sandbox, so it
  asks for confirmation the first time.

### Workspace

- Multi-tab, with rename, drag to reorder, close any tab, and middle-click to
  close.
- Stored as a file under the app's data directory, written through a temp file
  and a rename, with the previous version kept as a `.bak` that is read
  automatically if the current one will not parse.
- Open and save real files, and export or import the whole workspace.
- Execution history, and search across every tab.
- A command palette (`Ctrl+Shift+P`) listing every command with its binding.
- Share a snippet as a self-contained token that any copy of Sandbox reads
  back, or as a markdown code block. Nothing hosts the editor, so there is no
  link to hand out; the token travels through the clipboard instead.
- Light and dark themes, following the operating system unless you pick one.

## Keyboard

| Action | Shortcut |
| --- | --- |
| Command palette | `Ctrl+Shift+P` |
| Run | `Ctrl+Enter` |
| Stop | `Ctrl+.` |
| Clear output | `Ctrl+K` |
| New tab / close tab | `Ctrl+N` / `Ctrl+W` |
| Next / previous tab | `Ctrl+Tab` / `Ctrl+Shift+Tab` |
| Open / save / save as | `Ctrl+O` / `Ctrl+S` / `Ctrl+Shift+S` |
| Find in all tabs | `Ctrl+Shift+F` |
| Execution history | `Ctrl+H` |
| Format document | `Alt+Shift+F` |
| Copy shareable snippet | `Ctrl+Shift+C` |
| Open shared snippet | `Ctrl+Shift+V` |
| Settings | `Ctrl+,` |

On macOS, `Cmd` replaces `Ctrl`.

## Development

Needs Node 24.15.0 or newer, the version in `.nvmrc` and the one CI runs. The
toolchain sets the floor: jsdom loads undici, which needs a `worker_threads`
API added after Node 20. `engines` is enforced at install time, so an
unsupported version is reported by `npm install` rather than surfacing later
as a confusing test failure.

```
npm install
npm run dev          # renderer only, in a browser tab
npm run electron     # build and launch the desktop app
npm run build        # produce an installer via electron-builder
npm run lint
npm test             # unit and integration tests
npm run verify:app   # boot the real build in Electron and drive it
```

`npm run verify:app` loads the build with networking disabled and fails if the
renderer attempts a request, which is what demonstrates the editor and its
packages work offline. Add `--online` to also cover the first download of a
package, `--show` to watch it in a visible window.

To ask the Electron binary something rather than launch the app, set
`ELECTRON_RUN_AS_NODE=1` so it behaves as plain Node. A failed launch does not
write to stderr; it opens a modal dialog, which is a poor way to find out that
a diagnostic was malformed:

```
ELECTRON_RUN_AS_NODE=1 npx electron -e "console.log(process.versions.node)"
```

## How it works

The renderer never evaluates user code itself. Code goes through:

1. **Transpile** — TypeScript and JSX only, via esbuild compiled to
   WebAssembly, keeping a source map.
2. **Instrument** — an acorn pass rewrites console call sites to carry their
   line and column, converts static imports into awaited dynamic imports, and
   strips `export`. Locations are mapped back through the source map.
3. **Evaluate** — through `AsyncFunction`, in either a Web Worker or a Node
   utility process. Both speak the same message protocol.
4. **Serialise** — values are emitted as type-tagged nodes by a cycle-safe,
   budget-bound serialiser, and streamed one message per log.

The output pane positions each entry at the pixel offset Monaco reports for
the line that produced it, pushed down only as far as the previous entry
requires, so entries sharing a line stack under it. The layout pass covers
every entry while only those near the viewport are rendered, using a measured
height where one is known and an estimate otherwise. Monaco is the only scroll
authority for both panes.

Colours are tokens declared in `src/index.css` and exposed as Tailwind roles,
which is what allows a light theme: a border and a raised surface are the same
value in the dark theme and have to differ in the light one.

### Layout

```
main.cjs              Electron entry: window, lifecycle
electron/             Main process: ipc, workspace store, security policy,
                      menu, module cache, node runtime, updater
preload.cjs           The renderer's entire bridge surface
src/platform/         Renderer-side adapter over that bridge, with browser
                      fallbacks so `npm run dev` works
src/runtime/          Protocol, serialiser, instrumentation, both runtimes
src/hooks/            Workspace, runner, commands, files, history
src/components/       UI
scripts/verify-app.cjs  Electron smoke test
```

## Technologies

- **Electron** — window shell, Node runtime, module cache, updates
- **React** — user interface
- **Vite** — build tooling for the renderer and the Node runtime
- **Monaco** — editor, bundled locally
- **acorn** and **magic-string** — instrumentation
- **esbuild-wasm** — TypeScript and JSX
- **Prettier** — formatting
- **Vitest** — tests
