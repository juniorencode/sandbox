import { GROUP, GROUP_END } from '../runtime/protocol.js';

/**
 * Hides the contents of collapsed console.group blocks.
 *
 * A group header is emitted with the depth it opens at, and everything inside
 * it carries a deeper value, so collapsing means skipping entries until the
 * depth comes back to the header's own. groupEnd markers exist only to close
 * the indentation and never render.
 */
export const applyCollapse = (entries, collapsed) => {
  const visible = [];
  let hideDeeperThan = null;

  for (const entry of entries) {
    const depth = entry.group ?? 0;

    if (hideDeeperThan !== null) {
      if (depth > hideDeeperThan) continue;
      hideDeeperThan = null;
    }

    if (entry.t === GROUP_END) continue;

    visible.push(entry);

    if (entry.t === GROUP && collapsed.has(entry.entryId)) {
      hideDeeperThan = depth;
    }
  }

  return visible;
};

/**
 * Orders entries by the line that produced them, then by arrival.
 *
 * Ordering by line rather than by arrival is what makes a log from a function
 * defined at the top but called at the bottom appear next to its own
 * statement, which padding-based alignment could never do: it could only move
 * forward. Entries with no location, which happens when console is used as a
 * value rather than called directly, go to the end instead of being pinned to
 * a line they do not belong to.
 *
 * Each entry carries its own layout key, so the pane can position and
 * virtualise them one at a time.
 */
export const orderEntries = entries =>
  entries
    .map(entry => ({
      ...entry,
      key: String(entry.entryId),
      line: entry.line ?? null
    }))
    .sort((a, b) => {
      if (a.line === b.line) return a.entryId - b.entryId;
      if (a.line === null) return 1;
      if (b.line === null) return -1;
      return a.line - b.line;
    });

/** True when an entry is the first unlocated one, which gets the marker. */
export const isFirstUnlocated = (ordered, index) =>
  ordered[index].line === null &&
  (index === 0 || ordered[index - 1].line !== null);
