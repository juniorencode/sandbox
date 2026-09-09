import { useEffect, useState } from 'react';

/**
 * Resolves the theme preference and applies it to the document.
 *
 * The app had one hardcoded palette. `system` is the default and follows the
 * OS, which is why the tokens in index.css put the dark values on bare
 * `:root` and reapply the light ones under both a media query and an explicit
 * `data-theme`: an explicit choice has to win in either direction, not only
 * when it disagrees with the OS.
 */

const QUERY = '(prefers-color-scheme: light)';

const systemAppearance = () =>
  globalThis.matchMedia?.(QUERY).matches ? 'light' : 'dark';

export const useTheme = preference => {
  const [system, setSystem] = useState(systemAppearance);

  useEffect(() => {
    const media = globalThis.matchMedia?.(QUERY);
    if (!media) return undefined;
    const onChange = event => setSystem(event.matches ? 'light' : 'dark');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const appearance = preference === 'system' ? system : preference;

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      // Leaving the attribute off is what lets the media query decide, so a
      // later OS change needs no work from us.
      delete root.dataset.theme;
    } else {
      root.dataset.theme = preference;
    }
  }, [preference]);

  return appearance;
};
