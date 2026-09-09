import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { label } from '../../utilities/shortcut.utilities';

/**
 * Fuzzy command launcher.
 *
 * The app exposed its features only as buttons in two bars, so anything
 * without a visible control was unreachable. Every command in the registry
 * shows up here with its binding, which also means the shortcuts are
 * discoverable rather than undocumented.
 */

/**
 * Subsequence match with a small preference for matches on word boundaries,
 * so "sw" finds "Show workspace folder" and ranks it above an incidental hit.
 */
const score = (title, query) => {
  if (!query) return 0;
  const haystack = title.toLowerCase();
  const needle = query.toLowerCase();

  let position = 0;
  let points = 0;
  for (const character of needle) {
    const found = haystack.indexOf(character, position);
    if (found === -1) return null;
    const atBoundary = found === 0 || haystack[found - 1] === ' ';
    points += atBoundary ? 3 : 1;
    // Adjacent characters read as a real prefix rather than a scatter.
    if (found === position) points += 2;
    position = found + 1;
  }
  return points;
};

export const CommandPalette = ({ commands, open, onClose }) => {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setCursor(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return commands;
    return commands
      .map(command => ({ command, points: score(command.title, query.trim()) }))
      .filter(entry => entry.points !== null)
      .sort((a, b) => b.points - a.points)
      .map(entry => entry.command);
  }, [commands, query]);

  useEffect(() => {
    setCursor(current => Math.min(current, Math.max(results.length - 1, 0)));
  }, [results.length]);

  // Keeps the highlighted row visible when moving with the arrow keys.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor, results]);

  if (!open) return null;

  const choose = command => {
    onClose();
    command.run();
  };

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor(current => Math.min(current + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor(current => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && results[cursor]) {
      event.preventDefault();
      choose(results[cursor]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="w-[min(560px,90vw)] overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="w-full bg-transparent px-4 py-3 text-[14px] text-ink outline-none placeholder:text-faint"
          placeholder="Type a command…"
          value={query}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Command palette"
        />

        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto border-t border-line"
          role="listbox"
        >
          {!results.length && (
            <div className="px-4 py-3 text-[13px] text-muted">
              No matching commands
            </div>
          )}

          {results.map((command, index) => (
            <button
              key={command.id}
              data-active={index === cursor}
              role="option"
              aria-selected={index === cursor}
              className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] ${
                index === cursor
                  ? 'bg-raised text-ink-strong'
                  : 'text-ink hover:bg-panel-hover'
              }`}
              onMouseMove={() => setCursor(index)}
              onClick={() => choose(command)}
            >
              <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-faint">
                {command.group}
              </span>
              <span className="flex-1">{command.title}</span>
              {command.shortcut && (
                <span className="shrink-0 rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-muted">
                  {label(command.shortcut)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

CommandPalette.propTypes = {
  commands: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      group: PropTypes.string,
      shortcut: PropTypes.string,
      run: PropTypes.func.isRequired
    })
  ).isRequired,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};
