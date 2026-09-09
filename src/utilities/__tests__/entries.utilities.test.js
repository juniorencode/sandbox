import { describe, expect, it } from 'vitest';
import { applyCollapse, groupByLine } from '../entries.utilities.js';

const log = (entryId, line, group = 0) => ({
  t: 'log',
  entryId,
  line,
  group,
  values: []
});
const group = (entryId, line, depth = 0) => ({
  t: 'group',
  entryId,
  line,
  group: depth,
  values: []
});
const groupEnd = (entryId, depth = 0) => ({
  t: 'groupEnd',
  entryId,
  group: depth
});

describe('groupByLine', () => {
  it('orders by line, not by arrival', () => {
    // A function defined at the top but called at the bottom logs last while
    // belonging to the earlier line. Padding-based alignment could never move
    // it back up.
    const groups = groupByLine([log(1, 2), log(2, 1)]);
    expect(groups.map(bucket => bucket.line)).toEqual([1, 2]);
  });

  it('keeps repeated logs from one line together in arrival order', () => {
    const groups = groupByLine([log(1, 2), log(2, 2), log(3, 4)]);
    expect(groups).toHaveLength(2);
    expect(groups[0].entries.map(entry => entry.entryId)).toEqual([1, 2]);
  });

  it('collects unlocated entries at the end', () => {
    const groups = groupByLine([log(1, null), log(2, 5), log(3, null)]);
    expect(groups.map(bucket => bucket.line)).toEqual([5, null]);
    expect(groups[1].entries).toHaveLength(2);
  });

  it('returns nothing for no entries', () => {
    expect(groupByLine([])).toEqual([]);
  });
});

describe('applyCollapse', () => {
  it('drops groupEnd markers, which never render', () => {
    const visible = applyCollapse(
      [group(1, 1), log(2, 2, 1), groupEnd(3, 0)],
      new Set()
    );
    expect(visible.map(entry => entry.entryId)).toEqual([1, 2]);
  });

  it('hides the contents of a collapsed group', () => {
    const visible = applyCollapse(
      [group(1, 1), log(2, 2, 1), groupEnd(3, 0), log(4, 4, 0)],
      new Set([1])
    );
    expect(visible.map(entry => entry.entryId)).toEqual([1, 4]);
  });

  it('stops hiding once the depth returns to the header', () => {
    const entries = [
      group(1, 1),
      log(2, 2, 1),
      group(3, 3, 1),
      log(4, 4, 2),
      groupEnd(5, 1),
      groupEnd(6, 0),
      log(7, 7, 0)
    ];
    expect(applyCollapse(entries, new Set([1])).map(e => e.entryId)).toEqual([
      1, 7
    ]);
    // Collapsing only the inner group keeps the outer contents visible.
    expect(applyCollapse(entries, new Set([3])).map(e => e.entryId)).toEqual([
      1, 2, 3, 7
    ]);
  });

  it('leaves everything visible when nothing is collapsed', () => {
    const entries = [log(1, 1), log(2, 2)];
    expect(applyCollapse(entries, new Set())).toEqual(entries);
  });
});
