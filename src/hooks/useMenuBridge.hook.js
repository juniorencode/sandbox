import { useEffect } from 'react';
import { onMenuCommand } from '../platform';

/**
 * Runs a native menu selection through the command registry.
 *
 * The menu could have called into the app directly, but then every action
 * would exist twice: once for the menu and once for the palette and keyboard.
 * Menu items send a command id instead, so all three share one definition and
 * cannot drift apart.
 */
export const useMenuBridge = commands => {
  useEffect(() => {
    return onMenuCommand(id => {
      const command = commands.find(candidate => candidate.id === id);
      // Menu templates are built in the main process and can name a command
      // the renderer has not registered; ignoring it beats throwing.
      command?.run();
    });
  }, [commands]);
};
