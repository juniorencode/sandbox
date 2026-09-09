/**
 * Minimal source map reader, used to map a position in transpiled output back
 * to the line the user actually wrote.
 *
 * Only the generated-to-original direction is needed, and only at line and
 * column granularity, so this decodes the mappings itself rather than pulling
 * in a source map library. Without it, a TypeScript or JSX tab would report
 * console locations and errors against the transpiled text, and JSX in
 * particular does not preserve line positions.
 */

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const CHAR_TO_INT = new Map(
  [...ALPHABET].map((character, index) => [character, index])
);

/** Base64 VLQ: 5 data bits per character, low bit of the first is the sign. */
const decodeVlq = (segment, start) => {
  let result = 0;
  let shift = 0;
  let index = start;
  let digit;

  do {
    if (index >= segment.length) return null;
    digit = CHAR_TO_INT.get(segment[index]);
    if (digit === undefined) return null;
    index += 1;
    result += (digit & 31) << shift;
    shift += 5;
  } while (digit & 32);

  const negative = result & 1;
  result >>>= 1;
  return { value: negative ? -result : result, next: index };
};

/**
 * @returns {{ lookup: (line: number, column: number) =>
 *   { line: number, column: number } | null }}
 */
export const createMapper = rawMap => {
  let mappings = '';
  try {
    const parsed = typeof rawMap === 'string' ? JSON.parse(rawMap) : rawMap;
    mappings = parsed?.mappings ?? '';
  } catch {
    mappings = '';
  }

  // One array of [generatedColumn, originalLine, originalColumn] per line.
  const lines = [];
  let originalLine = 0;
  let originalColumn = 0;

  for (const group of mappings.split(';')) {
    const segments = [];
    let generatedColumn = 0;

    if (group) {
      for (const segment of group.split(',')) {
        if (!segment) continue;
        let cursor = 0;
        const fields = [];
        while (cursor < segment.length) {
          const decoded = decodeVlq(segment, cursor);
          if (!decoded) break;
          fields.push(decoded.value);
          cursor = decoded.next;
        }
        if (!fields.length) continue;

        generatedColumn += fields[0];
        // A segment with only a generated column has no original position.
        // The source index at fields[1] is skipped: a transform is always
        // given one file, so every mapping points at the same source.
        if (fields.length >= 4) {
          originalLine += fields[2];
          originalColumn += fields[3];
          segments.push([generatedColumn, originalLine, originalColumn]);
        }
      }
    }

    lines.push(segments);
  }

  return {
    /**
     * @param line 1-based generated line
     * @param column 1-based generated column
     */
    lookup: (line, column) => {
      const segments = lines[line - 1];
      if (!segments?.length) return null;

      const target = column - 1;
      let best = segments[0];
      for (const segment of segments) {
        if (segment[0] > target) break;
        best = segment;
      }
      return { line: best[1] + 1, column: best[2] + 1 };
    },

    /** True when the map carried no usable positions. */
    empty: !lines.some(segments => segments.length)
  };
};

/** A mapper that reports positions unchanged, for untranspiled sources. */
export const identityMapper = {
  lookup: (line, column) => ({ line, column }),
  empty: false
};
