/**
 * Portable snippet tokens.
 *
 * There was no way to get a snippet out of the app at all. A URL would be the
 * obvious shape, but nothing hosts this editor, so a link would not resolve
 * anywhere and would be a promise the app cannot keep. What it can do is
 * produce a self-contained token that any copy of Sandbox reads back, and a
 * plain markdown block for pasting into an issue or a chat.
 *
 * The payload is deflated before encoding, because code compresses well and a
 * token that has to survive being pasted into a chat window should be as short
 * as it can be.
 */

const PREFIX = 'sandbox';
const VERSION = '1';
/** Refuses anything implausible before spending work on decoding it. */
const MAX_TOKEN_LENGTH = 2_000_000;

export class SnippetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SnippetError';
  }
}

/** Chunked, because spreading a large array into a call blows the stack. */
const toBase64Url = bytes => {
  let binary = '';
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = text => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const through = async (bytes, transform) => {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

/**
 * `z` marks a deflated payload. Compression is skipped where the streams API
 * is unavailable rather than failing, so a token is always produced.
 */
const deflate = async bytes => {
  if (typeof CompressionStream === 'undefined') return { bytes, mode: 'r' };
  try {
    return {
      bytes: await through(bytes, new CompressionStream('deflate-raw')),
      mode: 'z'
    };
  } catch {
    return { bytes, mode: 'r' };
  }
};

const inflate = async (bytes, mode) => {
  if (mode !== 'z') return bytes;
  if (typeof DecompressionStream === 'undefined') {
    throw new SnippetError('This build cannot read compressed snippets');
  }
  return through(bytes, new DecompressionStream('deflate-raw'));
};

/** @returns {Promise<string>} a token of the form `sandbox:1:z:<payload>` */
export const encodeSnippet = async ({ name, language, code }) => {
  const json = JSON.stringify({
    n: name ?? 'Snippet',
    l: language ?? 'javascript',
    c: code ?? ''
  });
  const { bytes, mode } = await deflate(new TextEncoder().encode(json));
  return `${PREFIX}:${VERSION}:${mode}:${toBase64Url(bytes)}`;
};

/** @returns {Promise<{ name: string, language: string, code: string }>} */
export const decodeSnippet = async token => {
  const text = String(token ?? '').trim();

  if (!text) throw new SnippetError('The clipboard is empty');
  if (text.length > MAX_TOKEN_LENGTH) {
    throw new SnippetError('That snippet is too large to read');
  }

  const parts = text.split(':');
  if (parts[0] !== PREFIX) {
    throw new SnippetError('That does not look like a Sandbox snippet');
  }
  if (parts[1] !== VERSION) {
    throw new SnippetError(`Unsupported snippet version: ${parts[1]}`);
  }
  if (parts.length !== 4) {
    throw new SnippetError('That snippet is malformed');
  }

  let payload;
  try {
    payload = new TextDecoder().decode(
      await inflate(fromBase64Url(parts[3]), parts[2])
    );
  } catch (error) {
    if (error instanceof SnippetError) throw error;
    throw new SnippetError('That snippet could not be decoded');
  }

  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    throw new SnippetError('That snippet does not contain valid data');
  }

  if (typeof data?.c !== 'string') {
    throw new SnippetError('That snippet contains no code');
  }

  return {
    name: typeof data.n === 'string' && data.n ? data.n : 'Snippet',
    language: typeof data.l === 'string' ? data.l : 'javascript',
    code: data.c
  };
};

/** True for text that looks like a token, so a paste can be routed. */
export const looksLikeSnippet = text =>
  new RegExp(`^${PREFIX}:\\d+:[rz]:`).test(String(text ?? '').trim());

const FENCE_LANGUAGE = {
  javascript: 'js',
  jsx: 'jsx',
  typescript: 'ts',
  tsx: 'tsx'
};

/** A fenced block, for pasting somewhere that renders markdown. */
export const toMarkdown = ({ name, language, code }) => {
  const fence = FENCE_LANGUAGE[language] ?? 'js';
  // A fence has to be longer than the longest run of backticks inside it.
  const longest = Math.max(
    3,
    ...[...String(code ?? '').matchAll(/`+/g)].map(match => match[0].length + 1)
  );
  const ticks = '`'.repeat(longest);
  return `${name ? `**${name}**\n\n` : ''}${ticks}${fence}\n${code ?? ''}\n${ticks}`;
};
