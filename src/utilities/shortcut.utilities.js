/**
 * Keyboard shortcut parsing and matching.
 *
 * Shortcuts are written as `Mod+Shift+S`, where `Mod` is Ctrl everywhere and
 * Cmd on macOS. Keeping the format declarative means one command registry can
 * feed both the key handler and the labels shown in the palette and tooltips,
 * so a shortcut can never be advertised in the UI without being bound.
 */

const APPLE = /Mac|iP(hone|ad|od)/.test(globalThis.navigator?.platform ?? '');

export const parse = shortcut => {
  const parts = shortcut.split('+').map(part => part.trim());
  const key = parts[parts.length - 1].toLowerCase();
  const modifiers = parts.slice(0, -1).map(part => part.toLowerCase());
  return {
    key,
    mod: modifiers.includes('mod'),
    shift: modifiers.includes('shift'),
    alt: modifiers.includes('alt')
  };
};

export const matches = (event, shortcut) => {
  const wanted = parse(shortcut);
  const modPressed = APPLE ? event.metaKey : event.ctrlKey;

  if (wanted.mod !== modPressed) return false;
  if (wanted.shift !== event.shiftKey) return false;
  if (wanted.alt !== event.altKey) return false;
  // A shortcut without Mod must not fire while the other modifier is held.
  if (!wanted.mod && (APPLE ? event.ctrlKey : event.metaKey)) return false;

  const pressed = event.key.toLowerCase();
  if (pressed === wanted.key) return true;
  // Shift changes event.key for punctuation and digits, so fall back to the
  // physical key: Mod+Shift+1 reports '!' rather than '1'.
  return event.code?.toLowerCase() === `digit${wanted.key}`;
};

/** Human-readable label, using the symbols each platform actually shows. */
export const label = shortcut => {
  const { key, mod, shift, alt } = parse(shortcut);
  const pieces = [];
  if (mod) pieces.push(APPLE ? '⌘' : 'Ctrl');
  if (alt) pieces.push(APPLE ? '⌥' : 'Alt');
  if (shift) pieces.push(APPLE ? '⇧' : 'Shift');

  const named = {
    enter: '↵',
    escape: 'Esc',
    tab: 'Tab',
    arrowup: '↑',
    arrowdown: '↓'
  };
  pieces.push(named[key] ?? key.toUpperCase());

  return pieces.join(APPLE ? '' : '+');
};
