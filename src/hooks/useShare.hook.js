import { useCallback } from 'react';
import { clipboard } from '../platform';
import {
  decodeSnippet,
  encodeSnippet,
  looksLikeSnippet,
  toMarkdown
} from '../utilities/share.utilities';

/**
 * Getting a snippet out of the app, and back in.
 *
 * There was no way to share anything. A link would be the obvious shape but
 * nothing hosts this editor, so what these produce is a self-contained token
 * any copy of Sandbox reads back, plus a markdown block for pasting somewhere
 * that renders one.
 */
export const useShare = ({ activeTab, addTab, report }) => {
  const copyToken = useCallback(async () => {
    if (!activeTab) return;
    try {
      const token = await encodeSnippet(activeTab);
      const result = await clipboard.write(token);
      if (!result?.ok) {
        report('error', result?.error || 'Could not reach the clipboard');
        return;
      }
      report('info', 'Snippet copied. Paste it into any Sandbox to open it.');
    } catch (error) {
      report('error', String(error?.message || error));
    }
  }, [activeTab, report]);

  const copyMarkdown = useCallback(async () => {
    if (!activeTab) return;
    const result = await clipboard.write(toMarkdown(activeTab));
    if (!result?.ok) {
      report('error', result?.error || 'Could not reach the clipboard');
      return;
    }
    report('info', 'Copied as a markdown code block');
  }, [activeTab, report]);

  const pasteToken = useCallback(async () => {
    const read = await clipboard.read();
    if (!read?.ok) {
      report('error', read?.error || 'Could not read the clipboard');
      return;
    }
    // Checked before decoding so ordinary clipboard contents produce a useful
    // message rather than a decoding failure.
    if (!looksLikeSnippet(read.text)) {
      report('error', 'The clipboard does not contain a Sandbox snippet');
      return;
    }
    try {
      const snippet = await decodeSnippet(read.text);
      addTab(snippet);
      report('info', `Opened ${snippet.name}`);
    } catch (error) {
      report('error', String(error?.message || error));
    }
  }, [addTab, report]);

  return { copyToken, copyMarkdown, pasteToken };
};
