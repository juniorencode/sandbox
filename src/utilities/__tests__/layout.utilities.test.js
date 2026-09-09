import { describe, expect, it } from 'vitest';
import {
  estimateHeight,
  layoutBlocks,
  sameLayout,
  visibleBlocks
} from '../layout.utilities.js';

const at = (line, key = String(line)) => ({ key, line, t: 'log' });

/** 20px per line, the shape Monaco reports for a default editor. */
const topForLine = line => (line - 1) * 20;

describe('layoutBlocks', () => {
  it('anchors each entry to its own line', () => {
    const { tops } = layoutBlocks([at(1), at(5)], {
      topForLine,
      heightFor: () => 18,
      gap: 0
    });
    expect(tops['1']).toBe(0);
    expect(tops['5']).toBe(80);
  });

  it('pushes an entry down only as far as the previous one needs', () => {
    // A tall value on line 1 must not be overlapped by line 2, which is the
    // case padding-based alignment could never handle.
    const { tops } = layoutBlocks([at(1), at(2)], {
      topForLine,
      heightFor: block => (block.line === 1 ? 100 : 18),
      gap: 0
    });
    expect(tops['1']).toBe(0);
    expect(tops['2']).toBe(100);
  });

  it('stacks entries that share a line, as a loop produces', () => {
    const loop = [at(2, 'a'), at(2, 'b'), at(2, 'c')];
    const { tops } = layoutBlocks(loop, {
      topForLine,
      heightFor: () => 20,
      gap: 0
    });
    expect([tops.a, tops.b, tops.c]).toEqual([20, 40, 60]);
  });

  it('leaves a gap between entries that had to be pushed apart', () => {
    const { tops } = layoutBlocks([at(1), at(2)], {
      topForLine,
      heightFor: () => 100,
      gap: 2
    });
    expect(tops['2']).toBe(102);
  });

  it('does not pull an entry up to meet a short predecessor', () => {
    const { tops } = layoutBlocks([at(1), at(10)], {
      topForLine,
      heightFor: () => 18,
      gap: 0
    });
    expect(tops['10']).toBe(180);
  });

  it('places an unlocated entry after whatever came before it', () => {
    const { tops } = layoutBlocks([at(3), { key: 'x', line: null, t: 'log' }], {
      topForLine,
      heightFor: () => 20,
      gap: 0
    });
    expect(tops['3']).toBe(40);
    expect(tops.x).toBe(60);
  });

  it('reports the bottom of the last entry', () => {
    const { bottom } = layoutBlocks([at(1), at(3)], {
      topForLine,
      heightFor: () => 20,
      gap: 2
    });
    // Line 3 sits at 40, is 20 tall, plus the gap.
    expect(bottom).toBe(62);
  });

  it('handles no entries at all', () => {
    expect(layoutBlocks([], { topForLine, heightFor: () => 0 })).toEqual({
      tops: {},
      bottom: 0
    });
  });
});

describe('visibleBlocks', () => {
  const many = Array.from({ length: 500 }, (_, index) => at(index + 1));
  const tops = Object.fromEntries(
    many.map((block, index) => [block.key, index * 20])
  );

  it('keeps the node count proportional to the viewport', () => {
    // Rendering everything is what made a long run freeze the app.
    const result = visibleBlocks(many, {
      tops,
      heightFor: () => 20,
      scrollTop: 0,
      paneHeight: 400,
      overscan: 0
    });
    expect(result).toHaveLength(21);
    expect(result[0].line).toBe(1);
  });

  it('bounds the DOM even when every entry shares one line', () => {
    // A loop logging thousands of times puts all of them on a single line,
    // which is the case an entry-level window has to cover and a line-level
    // one could not.
    const loop = Array.from({ length: 5000 }, (_, index) =>
      at(2, `loop-${index}`)
    );
    const stacked = Object.fromEntries(
      loop.map((block, index) => [block.key, 20 + index * 20])
    );
    const result = visibleBlocks(loop, {
      tops: stacked,
      heightFor: () => 20,
      scrollTop: 0,
      paneHeight: 600,
      overscan: 0
    });
    expect(result.length).toBeLessThan(40);
  });

  it('follows the scroll position', () => {
    const result = visibleBlocks(many, {
      tops,
      heightFor: () => 20,
      scrollTop: 2000,
      paneHeight: 400,
      overscan: 0
    });
    // Line 100 sits at 1980 and is 20 tall, so its bottom edge lands exactly
    // on the top of the window. The boundary is inclusive, which avoids an
    // entry flickering out at the edge as it is scrolled past.
    expect(result[0].line).toBe(100);
    expect(result.at(-1).line).toBe(121);
  });

  it('includes an entry that only partly overlaps the window', () => {
    const result = visibleBlocks([at(1)], {
      tops: { 1: -10 },
      heightFor: () => 20,
      scrollTop: 0,
      paneHeight: 100,
      overscan: 0
    });
    expect(result).toHaveLength(1);
  });

  it('keeps a margin beyond the viewport', () => {
    const tight = visibleBlocks(many, {
      tops,
      heightFor: () => 20,
      scrollTop: 1000,
      paneHeight: 200,
      overscan: 0
    });
    const padded = visibleBlocks(many, {
      tops,
      heightFor: () => 20,
      scrollTop: 1000,
      paneHeight: 200,
      overscan: 400
    });
    expect(padded.length).toBeGreaterThan(tight.length);
  });

  it('renders everything until the pane has been measured', () => {
    // Clipping to a zero-height window would show nothing on first paint.
    expect(
      visibleBlocks(many, {
        tops,
        heightFor: () => 20,
        scrollTop: 0,
        paneHeight: 0
      })
    ).toHaveLength(500);
  });
});

describe('estimateHeight', () => {
  it('assumes one line for an ordinary log', () => {
    expect(estimateHeight({ t: 'log' }, 20)).toBe(20);
  });

  it('assumes more for the entry kinds that are reliably taller', () => {
    // Guessing low here would make the scrollbar visibly wrong until those
    // entries are measured.
    expect(estimateHeight({ t: 'table' }, 20)).toBe(80);
    expect(estimateHeight({ t: 'error', frames: [] }, 20)).toBe(40);
    expect(estimateHeight({ t: 'error', frames: [{}, {}] }, 20)).toBe(60);
  });
});

describe('sameLayout', () => {
  it('compares positions rather than identity', () => {
    expect(sameLayout({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameLayout({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameLayout({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameLayout({}, {})).toBe(true);
  });
});
