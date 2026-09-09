/**
 * Output layout, as pure functions.
 *
 * The pane positions each entry at the pixel offset Monaco reports for the
 * line that produced it, pushed down only as far as the previous entry
 * requires. Entries sharing a line therefore stack under it, which is what a
 * loop logging repeatedly looks like.
 *
 * The unit is one entry rather than one line. Grouping by line first looked
 * tidier, but it put every entry of a group in the DOM as soon as any part of
 * it was visible, and a loop logging thousands of times puts all of them on a
 * single line: exactly the case that made the pane freeze. Laying out entries
 * individually means the node count follows the viewport no matter how the
 * output is distributed across lines.
 */

/** Breathing room between two entries that had to be pushed apart. */
export const GAP = 2;

/**
 * How far beyond the viewport to keep rendered, so scrolling does not reveal
 * unmeasured entries at the edge.
 */
export const OVERSCAN = 400;

/**
 * @param blocks entries in line order, each with a `key` and a `line`
 * @param topForLine content-space offset of a source line, in pixels
 * @param heightFor measured or estimated height of a block, in pixels
 * @returns {{ tops: Record<string, number>, bottom: number }}
 */
export const layoutBlocks = (blocks, { topForLine, heightFor, gap = GAP }) => {
  const tops = {};
  let cursor = 0;

  for (const block of blocks) {
    // Unlocated entries have no line to anchor to, so they follow whatever
    // came before them.
    const desired = block.line === null ? cursor : topForLine(block.line);
    const top = Math.max(desired, cursor);
    tops[block.key] = top;
    cursor = top + heightFor(block) + gap;
  }

  return { tops, bottom: cursor };
};

/**
 * The blocks that intersect the visible window, plus the overscan.
 *
 * Rendering everything is what made a long run freeze the app. The layout pass
 * still covers every block, so positions stay correct while the DOM stays
 * proportional to the viewport rather than to the number of entries.
 */
export const visibleBlocks = (
  blocks,
  { tops, heightFor, scrollTop, paneHeight, overscan = OVERSCAN }
) => {
  // Before the pane has been measured there is no window to clip to, so
  // everything renders and the first measurement narrows it.
  if (!paneHeight) return blocks;

  const from = scrollTop - overscan;
  const to = scrollTop + paneHeight + overscan;

  return blocks.filter(block => {
    const top = tops[block.key] ?? 0;
    return top + heightFor(block) >= from && top <= to;
  });
};

/**
 * Height to assume for an entry that has never been rendered.
 *
 * One line covers the common case of a short log. A table and an error with
 * frames are reliably taller, and guessing low there would make the scrollbar
 * visibly wrong before those entries are measured. Anything that scrolls into
 * view is measured and corrected, so the estimate only has to be close.
 */
export const estimateHeight = (entry, lineHeight) => {
  if (entry.t === 'table') return lineHeight * 4;
  if (entry.t === 'error') return lineHeight * (entry.frames?.length ? 3 : 2);
  return lineHeight;
};

/** True when two position maps describe the same layout. */
export const sameLayout = (a, b) => {
  const keys = Object.keys(b);
  if (keys.length !== Object.keys(a).length) return false;
  return keys.every(key => a[key] === b[key]);
};
