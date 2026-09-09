const fs = require('fs');
const path = require('path');

/**
 * Remembers where the window was.
 *
 * The window was hardcoded to maximise on every launch, so a user who wanted
 * it at a particular size or on a second monitor had to arrange it again each
 * time. Bounds are only restored if they still land on an attached display,
 * since a saved position from a monitor that is no longer connected would put
 * the window off screen with no way to reach it.
 */

const FILE = 'window-state.json';

const createWindowState = (directory, { defaultWidth, defaultHeight }) => {
  const file = path.join(directory, FILE);

  const read = () => {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof saved?.width !== 'number' || typeof saved?.height !== 'number') {
        return null;
      }
      return saved;
    } catch {
      return null;
    }
  };

  const visibleOn = (bounds, displays) =>
    displays.some(
      display =>
        bounds.x < display.bounds.x + display.bounds.width &&
        bounds.x + bounds.width > display.bounds.x &&
        bounds.y < display.bounds.y + display.bounds.height &&
        bounds.y + bounds.height > display.bounds.y
    );

  return {
    /** Bounds to open with, plus whether the window was maximised. */
    initial: displays => {
      const saved = read();
      if (!saved) {
        return { width: defaultWidth, height: defaultHeight, maximized: true };
      }
      const positioned =
        typeof saved.x === 'number' &&
        typeof saved.y === 'number' &&
        visibleOn(saved, displays);

      return {
        width: saved.width,
        height: saved.height,
        ...(positioned ? { x: saved.x, y: saved.y } : {}),
        maximized: Boolean(saved.maximized)
      };
    },

    save: window => {
      try {
        if (!window || window.isDestroyed()) return;
        // getNormalBounds is the un-maximised geometry, which is what should
        // be restored once the window is un-maximised again.
        const bounds = window.getNormalBounds
          ? window.getNormalBounds()
          : window.getBounds();
        fs.mkdirSync(directory, { recursive: true });
        fs.writeFileSync(
          file,
          JSON.stringify({ ...bounds, maximized: window.isMaximized() }, null, 2),
          'utf8'
        );
      } catch {
        // Losing the remembered position is not worth surfacing.
      }
    },

    paths: () => ({ file })
  };
};

module.exports = { createWindowState };
