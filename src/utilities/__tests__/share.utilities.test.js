import { describe, expect, it } from 'vitest';
import {
  SnippetError,
  decodeSnippet,
  encodeSnippet,
  looksLikeSnippet,
  toMarkdown
} from '../share.utilities.js';

const snippet = {
  name: 'sums.js',
  language: 'typescript',
  code: 'const total: number = 1 + 1\nconsole.log(total)'
};

describe('encodeSnippet and decodeSnippet', () => {
  it('round-trips a snippet', async () => {
    const token = await encodeSnippet(snippet);
    expect(await decodeSnippet(token)).toEqual(snippet);
  });

  it('produces a token that survives being pasted as text', async () => {
    const token = await encodeSnippet(snippet);
    // No characters that a chat client or an issue tracker would mangle.
    expect(token).toMatch(/^sandbox:1:[rz]:[A-Za-z0-9_-]+$/);
  });

  it('compresses, so a token stays short enough to paste', async () => {
    const repetitive = { ...snippet, code: 'console.log("x")\n'.repeat(400) };
    const token = await encodeSnippet(repetitive);
    expect(token.length).toBeLessThan(repetitive.code.length / 4);
  });

  it('round-trips code with characters that need escaping', async () => {
    const awkward = {
      name: 'edge',
      language: 'javascript',
      code: 'const s = "üñî — \\n\\t`${}" // ✓\nconsole.log(s)'
    };
    expect(await decodeSnippet(await encodeSnippet(awkward))).toEqual(awkward);
  });

  it('round-trips a large snippet without blowing the stack', async () => {
    // The base64 step spreads bytes into a call, which fails on a long array
    // unless it is chunked.
    const large = {
      name: 'large',
      language: 'javascript',
      code: Array.from({ length: 40000 }, (_, i) => `console.log(${i})`).join('\n')
    };
    const decoded = await decodeSnippet(await encodeSnippet(large));
    expect(decoded.code).toBe(large.code);
  });

  it('fills in a missing name and language', async () => {
    const decoded = await decodeSnippet(await encodeSnippet({ code: 'x' }));
    expect(decoded).toEqual({
      name: 'Snippet',
      language: 'javascript',
      code: 'x'
    });
  });

  it('accepts a token with surrounding whitespace, as a paste brings', async () => {
    const token = await encodeSnippet(snippet);
    expect(await decodeSnippet(`  ${token}\n`)).toEqual(snippet);
  });

  describe('rejections', () => {
    it.each([
      ['empty input', '', /clipboard is empty/],
      ['unrelated text', 'https://example.com/x', /does not look like/],
      ['a future version', 'sandbox:9:z:AAAA', /Unsupported snippet version/],
      ['a malformed token', 'sandbox:1:z', /malformed/],
      ['a corrupt payload', 'sandbox:1:r:!!!!', /could not be decoded/]
    ])('explains %s', async (_case, input, message) => {
      await expect(decodeSnippet(input)).rejects.toThrow(message);
    });

    it('reports a payload that is not a snippet', async () => {
      const notSnippet = btoa('{"hello":1}')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      await expect(decodeSnippet(`sandbox:1:r:${notSnippet}`)).rejects.toThrow(
        /contains no code/
      );
    });

    it('throws SnippetError rather than a bare Error', async () => {
      await expect(decodeSnippet('nope')).rejects.toBeInstanceOf(SnippetError);
    });
  });
});

describe('looksLikeSnippet', () => {
  it('recognises a token so a paste can be routed', async () => {
    expect(looksLikeSnippet(await encodeSnippet(snippet))).toBe(true);
    expect(looksLikeSnippet('  sandbox:1:r:abc  ')).toBe(true);
  });

  it.each([['plain code', 'console.log(1)'], ['a url', 'https://x.dev'], ['nothing', '']])(
    'rejects %s',
    (_case, input) => {
      expect(looksLikeSnippet(input)).toBe(false);
    }
  );
});

describe('toMarkdown', () => {
  it('fences the code with the right language', () => {
    expect(toMarkdown({ name: 'a.ts', language: 'typescript', code: 'let x = 1' }))
      .toBe('**a.ts**\n\n```ts\nlet x = 1\n```');
  });

  it('lengthens the fence past backticks in the code', () => {
    // A three-backtick fence would be closed early by the code itself.
    const result = toMarkdown({
      name: '',
      language: 'javascript',
      code: 'const s = `a ``` b`'
    });
    expect(result.startsWith('````js')).toBe(true);
    expect(result.endsWith('````')).toBe(true);
  });

  it('omits the heading when there is no name', () => {
    expect(toMarkdown({ language: 'javascript', code: 'x' })).toBe(
      '```js\nx\n```'
    );
  });
});
