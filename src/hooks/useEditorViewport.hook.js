import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Exposes the editor's own layout so the output pane can align to it.
 *
 * Alignment used to be done by padding the output string with newlines until
 * its line count reached the reported source line. That only worked while
 * every log occupied exactly one output line and while lines arrived in
 * ascending order, so a single multi-line value, a loop, or a log from a
 * function defined earlier and called later broke every entry below it and
 * could never be corrected: the padding loop can only move forward.
 *
 * Reading pixel offsets from Monaco instead means the layout is derived from
 * where the lines actually are, including when folding or word wrap moves
 * them, and it makes the output a projection of the editor's scroll position
 * rather than a second scrollable pane that has to be kept in sync.
 */
export const useEditorViewport = editor => {
  const [scrollTop, setScrollTop] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [lineHeight, setLineHeight] = useState(19);
  // Bumped whenever line positions may have moved, so the output relayouts
  // without recomputing on every scroll frame.
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    if (!editor) return undefined;

    const readLayout = () => {
      setContentHeight(editor.getContentHeight());
      // Derived rather than read from the option enum, which would couple this
      // hook to Monaco's internal option ids.
      const delta =
        editor.getTopForLineNumber(2) - editor.getTopForLineNumber(1);
      if (delta > 0) setLineHeight(delta);
      setLayoutVersion(version => version + 1);
    };

    setScrollTop(editor.getScrollTop());
    readLayout();

    const subscriptions = [
      editor.onDidScrollChange(event => setScrollTop(event.scrollTop)),
      editor.onDidContentSizeChange(readLayout),
      editor.onDidChangeModelContent(readLayout),
      editor.onDidChangeModelDecorations(readLayout),
      editor.onDidLayoutChange(readLayout)
    ];

    return () => subscriptions.forEach(subscription => subscription.dispose());
  }, [editor]);

  /** Content-space offset of a line, in pixels. */
  const topForLine = useCallback(
    line => {
      if (!editor || !line) return 0;
      try {
        return editor.getTopForLineNumber(line);
      } catch {
        return (line - 1) * lineHeight;
      }
    },
    [editor, lineHeight]
  );

  /**
   * Monaco owns scrolling for both panes. Forwarding the wheel here means
   * there is one source of truth, so the two sides cannot drift and there is
   * no echo to guard against: the previous implementation had the output write
   * to the editor and the editor write back to the output, with nothing
   * breaking the loop.
   */
  const scrollBy = useCallback(
    delta => {
      if (!editor) return;
      editor.setScrollTop(editor.getScrollTop() + delta);
    },
    [editor]
  );

  const revealLine = useCallback(
    line => {
      if (!editor || !line) return;
      editor.revealLineInCenterIfOutsideViewport(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    },
    [editor]
  );

  // Memoised so consumers can depend on the object itself without re-running
  // their effects on every render of the tree.
  return useMemo(
    () => ({
      scrollTop,
      contentHeight,
      lineHeight,
      layoutVersion,
      topForLine,
      scrollBy,
      revealLine
    }),
    [
      scrollTop,
      contentHeight,
      lineHeight,
      layoutVersion,
      topForLine,
      scrollBy,
      revealLine
    ]
  );
};
