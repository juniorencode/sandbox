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
 * Buckets entries by source line and orders them by line number.
 *
 * Ordering by line rather than by arrival is what makes a log from a function
 * defined at the top but called at the bottom appear next to its own
 * statement. Entries with no location, which happens when console is used as
 * a value rather than called directly, are collected at the end instead of
 * being pinned to a line they do not belong to.
 */
export const groupByLine = entries => {
  const buckets = new Map();

  for (const entry of entries) {
    const key = entry.line == null ? 'unlocated' : String(entry.line);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, line: entry.line ?? null, entries: [] };
      buckets.set(key, bucket);
    }
    bucket.entries.push(entry);
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.line === null) return 1;
    if (b.line === null) return -1;
    return a.line - b.line;
  });
};
