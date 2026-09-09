import { describe, expect, it } from 'vitest';
import { label, matches, parse } from '../shortcut.utilities.js';

const press = (key, modifiers = {}) => ({
  key,
  code: `Key${key.toUpperCase()}`,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers
});

describe('parse', () => {
  it('splits modifiers from the key', () => {
    expect(parse('Mod+Shift+S')).toEqual({
      key: 's',
      mod: true,
      shift: true,
      alt: false
    });
    expect(parse('Enter')).toEqual({
      key: 'enter',
      mod: false,
      shift: false,
      alt: false
    });
  });
});

describe('matches', () => {
  it('requires the modifier the shortcut declares', () => {
    expect(matches(press('k', { ctrlKey: true }), 'Mod+K')).toBe(true);
    expect(matches(press('k'), 'Mod+K')).toBe(false);
  });

  it('does not fire a plain shortcut while a modifier is held', () => {
    // Otherwise Ctrl+Enter would also trigger a bare Enter binding.
    expect(matches(press('enter', { ctrlKey: true }), 'Enter')).toBe(false);
  });

  it('distinguishes shift', () => {
    expect(
      matches(press('s', { ctrlKey: true, shiftKey: true }), 'Mod+Shift+S')
    ).toBe(true);
    expect(matches(press('s', { ctrlKey: true }), 'Mod+Shift+S')).toBe(false);
    expect(
      matches(press('s', { ctrlKey: true, shiftKey: true }), 'Mod+S')
    ).toBe(false);
  });

  it('distinguishes alt', () => {
    expect(
      matches(press('f', { shiftKey: true, altKey: true }), 'Alt+Shift+F')
    ).toBe(true);
    expect(matches(press('f', { shiftKey: true }), 'Alt+Shift+F')).toBe(false);
  });

  it('is case insensitive about the reported key', () => {
    expect(
      matches(press('S', { ctrlKey: true, shiftKey: true }), 'Mod+Shift+S')
    ).toBe(true);
  });

  it('falls back to the physical key for digits', () => {
    // Shift turns event.key for a digit into punctuation, so the code is what
    // identifies which number was actually pressed.
    const event = {
      ...press('!', { ctrlKey: true, shiftKey: true }),
      code: 'Digit1'
    };
    expect(matches(event, 'Mod+Shift+1')).toBe(true);
  });
});

describe('label', () => {
  it('renders a readable binding', () => {
    expect(label('Mod+Enter')).toBe('Ctrl+↵');
    expect(label('Mod+Shift+S')).toBe('Ctrl+Shift+S');
    expect(label('Mod+.')).toBe('Ctrl+.');
    expect(label('Escape')).toBe('Esc');
  });
});
