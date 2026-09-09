import PropTypes from 'prop-types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyCollapse, groupByLine } from '../../utilities/entries.utilities';
import { OutputEntry } from './OutputEntry';

/**
 * Line-anchored output.
 *
 * The old pane was a single <pre> holding one accumulated string, aligned by
 * writing newlines until the line count matched the source line. That is only
 * correct while each log takes exactly one output line and lines arrive in
 * ascending order, and it can never move an entry back up. So a multi-line
 * object shifted everything below it permanently, a loop pushed the rest of
 * the file down, and a log from a function called later than it was defined
 * landed in the wrong place.
 *
 * Each line's entries are now positioned at the pixel offset Monaco reports
 * for that line, then pushed down only as far as the previous block's real
 * height requires. Entries are laid out in line order regardless of the order
 * they arrived in, so alignment holds for values of any height.
 */

/** Breathing room between two blocks that had to be pushed apart. */
const GAP = 2;

export const OutputPanel = ({
  entries,
  viewport,
  onExpand,
  overflowed,
  width,
  onContentBottom
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [tops, setTops] = useState({});
  const rowRefs = useRef(new Map());
  const containerRef = useRef(null);

  const visible = useMemo(
    () => applyCollapse(entries, collapsedGroups),
    [entries, collapsedGroups]
  );
  const groups = useMemo(() => groupByLine(visible), [visible]);

  const toggleGroup = entryId =>
    setCollapsedGroups(previous => {
      const next = new Set(previous);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });

  /**
   * Two-pass layout: position from the editor, then measure what was rendered
   * and push overlapping blocks down. Re-running on `tops` lets the second
   * pass see real heights; the equality check below is what terminates it.
   */
  useLayoutEffect(() => {
    let cursor = 0;
    const next = {};

    for (const group of groups) {
      const desired =
        group.line === null ? cursor : viewport.topForLine(group.line);
      const top = Math.max(desired, cursor);
      next[group.key] = top;
      const height = rowRefs.current.get(group.key)?.offsetHeight ?? 0;
      cursor = top + height + GAP;
    }

    // Drop refs for blocks that are no longer rendered.
    for (const key of rowRefs.current.keys()) {
      if (!(key in next)) rowRefs.current.delete(key);
    }

    setTops(previous => {
      const keys = Object.keys(next);
      const same =
        keys.length === Object.keys(previous).length &&
        keys.every(key => previous[key] === next[key]);
      return same ? previous : next;
    });

    onContentBottom?.(cursor);
  }, [groups, viewport, tops, onContentBottom]);

  /**
   * Monaco is the only scroll authority for both panes, so the wheel is
   * forwarded to it. React attaches wheel handlers passively at the root,
   * which would make preventDefault a no-op, hence the manual listener.
   */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const onWheel = event => {
      event.preventDefault();
      viewport.scrollBy(event.deltaY);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [viewport]);

  const empty = !groups.length;

  return (
    <div
      ref={containerRef}
      className="relative h-full min-w-0 overflow-hidden bg-no-repeat bg-[length:50%] bg-center text-[14px] leading-[1.36] text-neutral-300"
      style={{
        width,
        backgroundImage: empty ? `url('shape.png')` : 'none'
      }}
    >
      <div
        className="absolute inset-x-0 top-0 px-4"
        style={{ transform: `translateY(${-viewport.scrollTop}px)` }}
      >
        {groups.map(group => (
          <div
            key={group.key}
            ref={node => {
              if (node) rowRefs.current.set(group.key, node);
            }}
            className="absolute inset-x-0 px-4"
            style={{ top: tops[group.key] ?? 0 }}
          >
            {group.line === null && !!group.entries.length && (
              <div
                className="text-[11px] uppercase tracking-wide text-[#6b7280]"
                title="Logged through a console reference, so no call site is known"
              >
                no line
              </div>
            )}
            {group.entries.map(entry => (
              <OutputEntry
                key={entry.entryId}
                entry={entry}
                collapsed={collapsedGroups.has(entry.entryId)}
                onToggleGroup={toggleGroup}
                onExpand={onExpand}
                onReveal={viewport.revealLine}
              />
            ))}
          </div>
        ))}
      </div>

      {overflowed && (
        <div className="absolute inset-x-0 top-0 bg-[#3a2d15] px-4 py-1 text-[12px] text-[#e3b341]">
          Output was truncated to the most recent entries.
        </div>
      )}
    </div>
  );
};

OutputPanel.propTypes = {
  entries: PropTypes.array.isRequired,
  viewport: PropTypes.shape({
    scrollTop: PropTypes.number.isRequired,
    topForLine: PropTypes.func.isRequired,
    scrollBy: PropTypes.func.isRequired,
    revealLine: PropTypes.func.isRequired
  }).isRequired,
  onExpand: PropTypes.func,
  overflowed: PropTypes.bool,
  width: PropTypes.string.isRequired,
  onContentBottom: PropTypes.func
};
