import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { VscClose, VscHistory, VscSearch, VscTrash } from 'react-icons/vsc';

/**
 * A drawer for the two things that need to look across the workspace rather
 * than at the current tab: past runs, and text in any tab.
 *
 * Neither existed. Search in particular was only ever per-tab, through Monaco,
 * so finding which tab a snippet lived in meant opening each one.
 */

const TABS = [
  { id: 'history', label: 'History', icon: VscHistory },
  { id: 'search', label: 'Search', icon: VscSearch }
];

const timeAgo = timestamp => {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
};

const firstLines = (code, count = 3) =>
  code.split('\n').slice(0, count).join('\n');

const History = ({ entries, onRestore, onOpenAsTab, onRemove, onClear }) => {
  if (!entries.length) {
    return (
      <p className="p-4 text-[13px] text-muted">
        Runs are recorded here as you work. Explicit runs are always kept;
        automatic ones only when the code has changed.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wide text-faint">
        <span>{`${entries.length} snapshots`}</span>
        <button className="hover:text-ink" onClick={onClear}>
          Clear all
        </button>
      </div>

      {entries.map(entry => (
        <div
          key={entry.id}
          className="group border-b border-line-soft px-3 py-2 text-[13px]"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-ink">{entry.name}</span>
            <span className="shrink-0 text-[11px] text-faint">
              {timeAgo(entry.at)}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-faint">
              {entry.summary?.errored
                ? 'failed'
                : `${entry.summary?.entries ?? 0} out`}
            </span>
            <button
              className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger"
              onClick={() => onRemove(entry.id)}
              aria-label="Remove snapshot"
            >
              <VscTrash size={12} />
            </button>
          </div>

          <pre className="mt-1 max-h-16 overflow-hidden whitespace-pre-wrap break-words text-[12px] text-muted">
            {firstLines(entry.code)}
          </pre>

          <div className="mt-1 flex gap-2 text-[12px]">
            <button
              className="rounded bg-raised px-2 py-0.5 hover:bg-raised-hover"
              onClick={() => onRestore(entry)}
              title="Replace the current tab's code with this snapshot"
            >
              Restore
            </button>
            <button
              className="rounded px-2 py-0.5 text-muted hover:bg-raised hover:text-ink"
              onClick={() => onOpenAsTab(entry)}
            >
              Open in new tab
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

History.propTypes = {
  entries: PropTypes.array.isRequired,
  onRestore: PropTypes.func.isRequired,
  onOpenAsTab: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired
};

/** Case-insensitive matches, with the line each one is on. */
const findMatches = (tabs, query) => {
  if (!query.trim()) return [];
  const needle = query.toLowerCase();

  return tabs
    .map(tab => {
      const hits = [];
      tab.code.split('\n').forEach((text, index) => {
        if (text.toLowerCase().includes(needle)) {
          hits.push({ line: index + 1, text: text.trim().slice(0, 200) });
        }
      });
      return { tab, hits };
    })
    .filter(result => result.hits.length);
};

const Search = ({ tabs, onReveal }) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const results = useMemo(() => findMatches(tabs, query), [tabs, query]);
  const total = results.reduce((sum, result) => sum + result.hits.length, 0);

  return (
    <div>
      <div className="p-3">
        <input
          ref={inputRef}
          className="w-full rounded border border-line-strong bg-chrome px-2 py-1.5 text-[13px] text-ink outline-none focus:border-focus"
          placeholder="Find in all tabs…"
          value={query}
          onChange={event => setQuery(event.target.value)}
          aria-label="Search all tabs"
        />
        {!!query.trim() && (
          <p className="mt-1.5 text-[11px] text-faint">
            {total
              ? `${total} matches in ${results.length} tabs`
              : 'No matches'}
          </p>
        )}
      </div>

      {results.map(result => (
        <div key={result.tab.id} className="border-b border-line-soft">
          <div className="px-3 py-1 text-[12px] text-ink">
            {result.tab.name}
          </div>
          {result.hits.map(hit => (
            <button
              key={`${result.tab.id}-${hit.line}`}
              className="flex w-full gap-2 px-3 py-1 text-left text-[12px] hover:bg-panel-hover"
              onClick={() => onReveal(result.tab.id, hit.line)}
            >
              <span className="w-8 shrink-0 text-right text-faint">
                {hit.line}
              </span>
              <span className="truncate font-mono text-muted">
                {hit.text}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

Search.propTypes = {
  tabs: PropTypes.array.isRequired,
  onReveal: PropTypes.func.isRequired
};

export const SidePanel = ({
  open,
  view,
  onView,
  onClose,
  tabs,
  history,
  onRestore,
  onOpenAsTab,
  onRemove,
  onClear,
  onReveal
}) => {
  if (!open) return null;

  return (
    <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
        {TABS.map(entry => {
          const Icon = entry.icon;
          return (
            <button
              key={entry.id}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[12px] ${
                view === entry.id
                  ? 'bg-raised text-ink-strong'
                  : 'text-muted hover:text-ink'
              }`}
              onClick={() => onView(entry.id)}
            >
              <Icon size={13} />
              {entry.label}
            </button>
          );
        })}
        <button
          className="ml-auto text-muted hover:text-ink"
          onClick={onClose}
          aria-label="Close panel"
        >
          <VscClose size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'history' ? (
          <History
            entries={history}
            onRestore={onRestore}
            onOpenAsTab={onOpenAsTab}
            onRemove={onRemove}
            onClear={onClear}
          />
        ) : (
          <Search tabs={tabs} onReveal={onReveal} />
        )}
      </div>
    </aside>
  );
};

SidePanel.propTypes = {
  open: PropTypes.bool.isRequired,
  view: PropTypes.string.isRequired,
  onView: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  tabs: PropTypes.array.isRequired,
  history: PropTypes.array.isRequired,
  onRestore: PropTypes.func.isRequired,
  onOpenAsTab: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  onReveal: PropTypes.func.isRequired
};
