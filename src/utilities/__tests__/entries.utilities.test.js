import { describe, expect, it } from 'vitest';
import {
  applyCollapse,
  isFirstUnlocated,
  orderEntries
} from '../entries.utilities.js';

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

describe('orderEntries', () => {
  it('orders by line, not by arrival', () => {
    // A function defined at the top but called at the bottom logs last while
    // belonging to the earlier line. Padding-based alignment could never move
    // it back up.
    const ordered = orderEntries([log(1, 2), log(2, 1)]);
    expect(ordered.map(entry => entry.line)).toEqual([1, 2]);
  });

  it('keeps repeated logs from one line in arrival order', () => {
    const ordered = orderEntries([log(3, 2), log(1, 2), log(2, 2)]);
    expect(ordered.map(entry => entry.entryId)).toEqual([1, 2, 3]);
  });

  it('sends unlocated entries to the end', () => {
    const ordered = orderEntries([log(1, null), log(2, 5), log(3, null)]);
    expect(ordered.map(entry => entry.line)).toEqual([5, null, null]);
  });

  it('gives every entry its own layout key', () => {
    const ordered = orderEntries([log(7, 1), log(8, 1)]);
    expect(ordered.map(entry => entry.key)).toEqual(['7', '8']);
  });

  it('normalises a missing line to null', () => {
    const ordered = orderEntries([{ t: 'log', entryId: 1, group: 0 }]);
    expect(ordered[0].line).toBeNull();
  });

  it('returns nothing for no entries', () => {
    expect(orderEntries([])).toEqual([]);
  });
});

describe('isFirstUnlocated', () => {
  it('marks only the first of a run of unlocated entries', () => {
    // The marker explains why those entries have no line; repeating it on
    // every one of them would be noise.
    const ordered = orderEntries([log(1, 4), log(2, null), log(3, null)]);
    expect(ordered.map((_, index) => isFirstUnlocated(ordered, index))).toEqual([
      false,
      true,
      false
    ]);
  });

  it('marks the first entry when everything is unlocated', () => {
    const ordered = orderEntries([log(1, null)]);
    expect(isFirstUnlocated(ordered, 0)).toBe(true);
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
