import { useCallback, useMemo } from 'react';

/**
 * Execution history.
 *
 * The 1.x README advertised this and it did not exist. What makes it awkward
 * in a hot-reloading editor is that auto-run settles on every keystroke, so
 * recording every run would produce a snapshot per character. Explicit runs
 * are always recorded; automatic ones only when the code has actually changed
 * and enough time has passed for the previous snapshot to be worth keeping.
 *
 * Snapshots hold the source and a summary, never the serialised output: a
 * single logged object can be far larger than the code that produced it, and
 * the source is what a user wants back.
 */

const LIMIT = 60;
const QUIET_PERIOD_MS = 10000;

let nextId = 1;

export const useHistory = ({ history, setHistory }) => {
  const record = useCallback(
    ({ tabId, name, language, code, summary, explicit }) => {
      if (!code?.trim()) return;

      setHistory(previous => {
        const list = Array.isArray(previous) ? previous : [];
        const latest = list.find(entry => entry.tabId === tabId);

        if (!explicit) {
          if (latest?.code === code) return list;
          if (latest && Date.now() - latest.at < QUIET_PERIOD_MS) return list;
        }
        // An explicit re-run of unchanged code updates the existing snapshot
        // rather than stacking duplicates.
        if (explicit && latest?.code === code) {
          return list.map(entry =>
            entry === latest ? { ...entry, at: Date.now(), summary } : entry
          );
        }

        const snapshot = {
          id: `h${nextId++}-${Date.now()}`,
          at: Date.now(),
          tabId,
          name,
          language,
          code,
          summary
        };
        return [snapshot, ...list].slice(0, LIMIT);
      });
    },
    [setHistory]
  );

  const remove = useCallback(
    id => setHistory(previous => (previous ?? []).filter(e => e.id !== id)),
    [setHistory]
  );

  const clear = useCallback(() => setHistory([]), [setHistory]);

  const entries = useMemo(
    () => (Array.isArray(history) ? history : []),
    [history]
  );

  return { entries, record, remove, clear };
};
