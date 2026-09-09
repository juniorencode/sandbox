import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';
import { GoPlus } from 'react-icons/go';
import { IoClose } from 'react-icons/io5';
import { windowControls } from '../../platform';
import './TabBar.css';

/**
 * The tab strip and window controls.
 *
 * Every tab now carries its own close button. Previously only the active tab
 * rendered one, so closing an inactive tab meant activating it first, and the
 * inactive tabs still reserved the space where the missing button would have
 * been. Tabs can also be renamed, which `name` was already stored for but no
 * UI ever exposed, and reordered.
 */
export const TabBar = ({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onCreate,
  onRename,
  onMove,
  newTabHint
}) => {
  const [renamingId, setRenamingId] = useState(null);
  const [draft, setDraft] = useState('');
  const [dragId, setDragId] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (renamingId !== null) inputRef.current?.select();
  }, [renamingId]);

  const startRename = tab => {
    setRenamingId(tab.id);
    setDraft(tab.name);
  };

  const commitRename = () => {
    if (renamingId !== null) onRename(renamingId, draft);
    setRenamingId(null);
  };

  const handleRenameKey = event => {
    if (event.key === 'Enter') commitRename();
    if (event.key === 'Escape') setRenamingId(null);
  };

  // Middle click closes, matching browsers and editors.
  const handleAuxClick = (event, tab) => {
    if (event.button === 1) {
      event.preventDefault();
      onClose(tab.id);
    }
  };

  const handleDrop = (event, tab) => {
    event.preventDefault();
    if (dragId === null || dragId === tab.id) return;
    onMove(
      dragId,
      tabs.findIndex(candidate => candidate.id === tab.id)
    );
    setDragId(null);
  };

  return (
    <div className="drag-bar flex shrink-0 gap-1 px-2 select-none bg-[#14181f]">
      <div className="flex items-center justify-center gap-2 px-1">
        <button
          className="h-3 w-3 rounded-full bg-red-500 hover:bg-red-600"
          title="Close"
          aria-label="Close window"
          onClick={windowControls.close}
        ></button>
        <button
          className="h-3 w-3 rounded-full bg-yellow-500 hover:bg-yellow-600"
          title="Minimize"
          aria-label="Minimize window"
          onClick={windowControls.minimize}
        ></button>
        <button
          className="h-3 w-3 rounded-full bg-green-500 hover:bg-green-600"
          title="Maximize"
          aria-label="Maximize window"
          onClick={windowControls.maximize}
        ></button>
      </div>

      <div
        className="ml-[10px] flex w-[20px] items-center justify-center bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: `url('favicon.png')` }}
      ></div>

      <div className="scrollbar-hidden flex h-[40px] flex-nowrap overflow-x-auto overflow-y-hidden whitespace-nowrap px-3 text-neutral-600">
        {tabs.map(tab => {
          const active = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={`tab group relative flex items-center justify-center gap-1 rounded-t-[10px] pl-4 pr-2 transition-colors ${
                active
                  ? 'indicator bg-[#212830] text-neutral-300'
                  : 'hover:bg-[#1b212b] hover:text-neutral-500'
              } ${dragId === tab.id ? 'opacity-50' : ''}`}
              draggable={renamingId !== tab.id}
              onDragStart={() => setDragId(tab.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, tab)}
              onAuxClick={event => handleAuxClick(event, tab)}
            >
              {renamingId === tab.id ? (
                <input
                  ref={inputRef}
                  className="w-24 bg-transparent text-neutral-100 outline-none"
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={handleRenameKey}
                  onBlur={commitRename}
                  aria-label={`Rename ${tab.name}`}
                />
              ) : (
                <button
                  className="py-1"
                  onClick={() => onSelect(tab.id)}
                  onDoubleClick={() => startRename(tab)}
                  title={tab.path || 'Double-click to rename'}
                >
                  {tab.name}
                  {/* A tab backed by a real file is worth distinguishing from
                      a scratchpad tab. */}
                  {tab.path && <span className="ml-1 text-[#6b7280]">·</span>}
                </button>
              )}

              <button
                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-[#464d5a]"
                title="Close tab"
                aria-label={`Close ${tab.name}`}
                onClick={() => onClose(tab.id)}
              >
                <IoClose size={16} />
              </button>
            </div>
          );
        })}

        <div className="ml-2 flex items-center justify-center">
          <button
            className="tab rounded-full p-0.5 transition-colors hover:bg-[#2d3641] hover:text-neutral-300"
            title={newTabHint ? `New tab (${newTabHint})` : 'New tab'}
            aria-label="New tab"
            onClick={() => onCreate()}
          >
            <GoPlus size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

TabBar.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      code: PropTypes.string.isRequired,
      path: PropTypes.string
    })
  ).isRequired,
  activeTabId: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
  onRename: PropTypes.func.isRequired,
  onMove: PropTypes.func.isRequired,
  newTabHint: PropTypes.string
};
