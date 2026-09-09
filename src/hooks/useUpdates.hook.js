import { useCallback, useEffect, useState } from 'react';
import { updates } from '../platform';

/**
 * Update availability, surfaced to the UI.
 *
 * There was no update mechanism at all, and the NSIS installer is one-click,
 * so a fix could only reach users as a manual reinstall. Downloads are opt-in
 * rather than automatic: this is a tool people leave open, and replacing it
 * underneath them is not a courtesy.
 */
export const useUpdates = () => {
  const [state, setState] = useState({ status: 'idle' });

  useEffect(
    () =>
      updates.onEvent(event => {
        switch (event.type) {
          case 'available':
            setState({ status: 'available', version: event.version });
            break;
          case 'progress':
            setState({ status: 'downloading', percent: event.percent });
            break;
          case 'ready':
            setState({ status: 'ready', version: event.version });
            break;
          case 'none':
            setState({ status: 'none' });
            break;
          case 'error':
            setState({ status: 'error', message: event.message });
            break;
          default:
            break;
        }
      }),
    []
  );

  const check = useCallback(async () => {
    setState({ status: 'checking' });
    const result = await updates.check();
    // A packaged build answers through the event stream; anything else here
    // is the updater declining, which is worth showing since the user asked.
    if (result?.ok === false && result.reason) {
      setState({ status: 'error', message: result.reason });
    }
  }, []);

  return {
    ...state,
    check,
    download: updates.download,
    install: updates.install,
    dismiss: () => setState({ status: 'idle' })
  };
};
