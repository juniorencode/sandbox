import { useEffect } from 'react';
import { matches } from '../utilities/shortcut.utilities';

/**
 * Binds the command registry to the keyboard.
 *
 * The app had no shortcuts at all: no new tab, no close tab, no run, no clear.
 * Monaco claims most keys while it has focus, so the listener runs in the
 * capture phase to see the event first, and only the exact combinations a
 * command declares are consumed. Everything else falls through to the editor
 * untouched.
 */
export const useShortcuts = (commands, { enabled = true } = {}) => {
  useEffect(() => {
    if (!enabled) return undefined;

    const onKeyDown = event => {
      // Never steal keys from a text field: the tab rename input and the
      // palette filter both need them.
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      for (const command of commands) {
        if (!command.shortcut) continue;
        if (typing && !command.worksWhileTyping) continue;
        if (!matches(event, command.shortcut)) continue;
        event.preventDefault();
        event.stopPropagation();
        command.run();
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () =>
      document.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [commands, enabled]);
};
