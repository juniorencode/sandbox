import PropTypes from 'prop-types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { VscMenu, VscChevronRight } from 'react-icons/vsc';
import { label } from '../../utilities/shortcut.utilities';

/**
 * The application menu, drawn in the title bar.
 *
 * There is a native menu too, and it does real work: it owns the accelerators
 * and the clipboard roles for the whole window. But the window is frameless,
 * and on Windows the menu bar is part of the frame, so that menu is never
 * drawn and its entries were reachable only by shortcut. This is the visible
 * surface.
 *
 * Its contents come from the command registry, grouped by the `group` each
 * command already declares, so adding a command puts it in the menu, the
 * palette and the keyboard at once and none of the three can drift from the
 * others.
 *
 * Keyboard navigation is deliberately not duplicated here: the palette is one
 * keystroke away, lists the same commands with their bindings, and already has
 * arrow-key navigation and filtering. This menu is for browsing with a mouse.
 */

/**
 * Presentation order. Anything not named here is appended rather than dropped,
 * so a new group cannot disappear from the menu by omission.
 */
const GROUP_ORDER = [
  'Run',
  'Tabs',
  'File',
  'Share',
  'Editor',
  'Workspace',
  'General',
  'Window'
];

const groupCommands = commands => {
  const byGroup = new Map();
  for (const command of commands) {
    const name = command.group || 'Other';
    if (!byGroup.has(name)) byGroup.set(name, []);
    byGroup.get(name).push(command);
  }

  const known = GROUP_ORDER.filter(name => byGroup.has(name));
  const extra = [...byGroup.keys()].filter(name => !GROUP_ORDER.includes(name));

  return [...known, ...extra].map(name => ({
    name,
    commands: byGroup.get(name)
  }));
};

export const MenuBar = ({ commands }) => {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const containerRef = useRef(null);

  const groups = useMemo(() => groupCommands(commands), [commands]);

  const close = () => {
    setOpen(false);
    setExpanded(null);
  };

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = event => {
      if (!containerRef.current?.contains(event.target)) close();
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = command => {
    close();
    command.run();
  };

  return (
    <div ref={containerRef} className="tab relative flex items-center">
      <button
        className={`flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-raised ${
          open ? 'bg-raised text-ink' : 'text-muted'
        }`}
        onClick={() => (open ? close() : setOpen(true))}
        title="Menu"
        aria-label="Application menu"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <VscMenu size={14} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-50 min-w-[168px] overflow-visible rounded-md border border-line bg-panel py-1 shadow-2xl"
          role="menu"
        >
          {groups.map(group => {
            const isExpanded = expanded === group.name;
            return (
              <div
                key={group.name}
                className="relative"
                onMouseEnter={() => setExpanded(group.name)}
              >
                <div
                  className={`flex cursor-default items-center gap-2 px-3 py-1.5 text-[13px] ${
                    isExpanded ? 'bg-raised text-ink' : 'text-ink'
                  }`}
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={isExpanded}
                >
                  <span className="flex-1">{group.name}</span>
                  <VscChevronRight size={12} className="text-muted" />
                </div>

                {isExpanded && (
                  <div
                    className="absolute left-full top-0 -mt-1 ml-0.5 min-w-[240px] rounded-md border border-line bg-panel py-1 shadow-2xl"
                    role="menu"
                  >
                    {group.commands.map(command => (
                      <button
                        key={command.id}
                        className="flex w-full items-center gap-4 px-3 py-1.5 text-left text-[13px] text-ink hover:bg-raised"
                        onClick={() => choose(command)}
                        role="menuitem"
                      >
                        <span className="flex-1">{command.title}</span>
                        {command.shortcut && (
                          <span className="shrink-0 text-[11px] text-muted">
                            {label(command.shortcut)}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

MenuBar.propTypes = {
  commands: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      group: PropTypes.string,
      shortcut: PropTypes.string,
      run: PropTypes.func.isRequired
    })
  ).isRequired
};
