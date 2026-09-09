# Sandbox

A hot-reloading scratchpad for JavaScript, built with **Vite**, **React** and
**Electron**. Type code on the left, see what every line produced on the right.

## Installation

Install the program, no additional configuration required.

## Features

- Runs JavaScript as you type, with the output aligned to the line that produced it.
- Multi-tab workspace, persisted between sessions.
- Syntax highlighting and IntelliSense via a locally bundled Monaco editor.
- Fully offline: nothing is fetched at runtime.

## Technologies

- **Electron**: OS integration and window shell.
- **React**: user interface.
- **Vite**: build tooling.
- **Monaco**: code editor.

## Development

```
npm install
npm run dev        # renderer only, in a browser tab
npm run electron   # build the renderer and launch the desktop app
npm run build      # produce an installer via electron-builder
npm run lint
```
