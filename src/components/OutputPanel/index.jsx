import PropTypes from 'prop-types';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  applyCollapse,
  isFirstUnlocated,
  orderEntries
} from '../../utilities/entries.utilities';
import {
  estimateHeight,
  layoutBlocks,
  sameLayout,
  visibleBlocks
} from '../../utilities/layout.utilities';
import { OutputEntry } from './OutputEntry';

/**
 * Line-anchored, virtualised output.
 *
 * The old pane was a single <pre> holding one accumulated string, aligned by
 * writing newlines until the line count matched the source line. That is only
 * correct while each log takes exactly one output line and lines arrive in
 * ascending order, and it can never move an entry back up. So a multi-line
 * object shifted everything below it permanently, a loop pushed the rest of
 * the file down, and a log from a function called later than it was defined
 * landed in the wrong place.
 *
 * Each entry is positioned at the pixel offset Monaco reports for the line
 * that produced it, pushed down only as far as the previous entry requires, in
 * line order regardless of arrival order.
 *
 * Only entries near the viewport are in the DOM. The layout pass still covers
 * every entry, using a measured height where one is known and an estimate
 * otherwise, so positions stay correct while the node count follows the
 * viewport rather than the amount of output. An entry is measured the first
 * time it scrolls into view and the layout corrects itself from there.
 */
export const OutputPanel = ({
  entries,
  viewport,
  onExpand,
  overflowed,
  style,
  fontSize,
  onContentBottom
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
  const [layout, setLayout] = useState({ tops: {}, bottom: 0 });
  const [paneHeight, setPaneHeight] = useState(0);
  /**
   * Measured entry heights, as state rather than a ref: they decide where
   * every entry sits and which ones are on screen, so a new measurement has to
   * produce a render.
   */
  const [heights, setHeights] = useState(() => new Map());

  const nodesRef = useRef(new Map());
  const containerRef = useRef(null);

  const visible = useMemo(
    () => applyCollapse(entries, collapsedGroups),
    [entries, collapsedGroups]
  );
  const ordered = useMemo(() => orderEntries(visible), [visible]);

  const toggleGroup = entryId =>
    setCollapsedGroups(previous => {
      const next = new Set(previous);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });

  const heightFor = useCallback(
    entry => heights.get(entry.key) ?? estimateHeight(entry, viewport.lineHeight),
    [heights, viewport.lineHeight]
  );

  /** Position every entry, whether or not it is currently rendered. */
  useLayoutEffect(() => {
    const next = layoutBlocks(ordered, {
      topForLine: viewport.topForLine,
      heightFor
    });

    setLayout(previous =>
      sameLayout(previous.tops, next.tops) && previous.bottom === next.bottom
        ? previous
        : next
    );

    onContentBottom?.(next.bottom);
  }, [ordered, viewport.topForLine, heightFor, onContentBottom]);

  const rendered = useMemo(
    () =>
      visibleBlocks(ordered, {
        tops: layout.tops,
        heightFor,
        scrollTop: viewport.scrollTop,
        paneHeight
      }),
    [ordered, layout.tops, heightFor, viewport.scrollTop, paneHeight]
  );

  /**
   * Measures what is on screen and caches it. Heights settle after a pass or
   * two, which is what stops this from looping.
   */
  useLayoutEffect(() => {
    let next = null;
    for (const entry of rendered) {
      const node = nodesRef.current.get(entry.key);
      if (!node) continue;
      const height = node.offsetHeight;
      if (height && heights.get(entry.key) !== height) {
        next ??= new Map(heights);
        next.set(entry.key, height);
      }
    }
    if (next) setHeights(next);
  }, [rendered, layout.tops, heights]);

  /** A measurement belongs to an entry, so it is dropped with it. */
  useEffect(() => {
    const live = new Set(ordered.map(entry => entry.key));
    for (const key of nodesRef.current.keys()) {
      if (!live.has(key)) nodesRef.current.delete(key);
    }
    setHeights(previous => {
      if ([...previous.keys()].every(key => live.has(key))) return previous;
      return new Map([...previous].filter(([key]) => live.has(key)));
    });
  }, [ordered]);

  /** The visible window depends on how tall the pane is. */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    setPaneHeight(node.clientHeight);
    const observer = new ResizeObserver(([observed]) =>
      setPaneHeight(observed.contentRect.height)
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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

  /** Which rendered entries should carry the "no line" marker. */
  const markers = useMemo(() => {
    const flags = new Set();
    ordered.forEach((entry, index) => {
      if (isFirstUnlocated(ordered, index)) flags.add(entry.key);
    });
    return flags;
  }, [ordered]);

  const empty = !ordered.length;

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 min-w-0 overflow-hidden bg-no-repeat bg-[length:50%] bg-center leading-[1.36] text-neutral-300"
      style={{
        ...style,
        fontSize: `${fontSize}px`,
        backgroundImage: empty ? `url('shape.png')` : 'none'
      }}
    >
      <div
        className="absolute inset-x-0 top-0"
        style={{ transform: `translateY(${-viewport.scrollTop}px)` }}
      >
        {rendered.map(entry => (
          <div
            key={entry.key}
            ref={node => {
              if (node) nodesRef.current.set(entry.key, node);
              else nodesRef.current.delete(entry.key);
            }}
            className="absolute inset-x-0 px-4"
            style={{ top: layout.tops[entry.key] ?? 0 }}
          >
            {markers.has(entry.key) && (
              <div
                className="text-[11px] uppercase tracking-wide text-[#6b7280]"
                title="Logged through a console reference, so no call site is known"
              >
                no line
              </div>
            )}
            <OutputEntry
              entry={entry}
              collapsed={collapsedGroups.has(entry.entryId)}
              onToggleGroup={toggleGroup}
              onExpand={onExpand}
              onReveal={viewport.revealLine}
            />
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
    lineHeight: PropTypes.number.isRequired,
    topForLine: PropTypes.func.isRequired,
    scrollBy: PropTypes.func.isRequired,
    revealLine: PropTypes.func.isRequired
  }).isRequired,
  onExpand: PropTypes.func,
  overflowed: PropTypes.bool,
  style: PropTypes.object.isRequired,
  fontSize: PropTypes.number.isRequired,
  onContentBottom: PropTypes.func
};
