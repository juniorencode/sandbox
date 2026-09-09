import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorPanel } from './components/EditorPanel';
import { OutputPanel } from './components/OutputPanel';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { useEditorViewport } from './hooks/useEditorViewport.hook';
import { useRunner, STATUS } from './hooks/useRunner.hook';
import { useWorkspace } from './hooks/useWorkspace.hook';
import { ERROR } from './runtime/protocol.js';

const RUN_DEBOUNCE_MS = 200;
/** Hysteresis so the editor's bottom padding cannot oscillate. */
const PADDING_TOLERANCE = 8;

const App = () => {
  const {
    loaded,
    tabs,
    activeTabId,
    activeTab,
    settings,
    persistError,
    setActive,
    updateCode,
    addTab,
    closeTab,
    renameTab,
    moveTab,
    updateSettings
  } = useWorkspace();

  const [editor, setEditor] = useState(null);
  const [outputBottom, setOutputBottom] = useState(0);
  const [extraBottomPadding, setExtraBottomPadding] = useState(0);

  const runTimerRef = useRef(null);
  const lastRunTabRef = useRef(null);

  const viewport = useEditorViewport(editor);
  const { entries, status, duration, overflowed, run, stop, clear, expand } =
    useRunner({ timeoutMs: settings.timeoutMs });

  const runNow = useCallback(
    code => {
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
      run(code ?? activeTab?.code ?? '');
    },
    [run, activeTab]
  );

  /**
   * The tab is updated immediately and only the run is debounced.
   *
   * The old handler debounced both and rebuilt the tab array from the value
   * captured when the timeout was scheduled, so switching or closing a tab
   * inside that window wrote a stale array back: it could resurrect a closed
   * tab, discard a new one, or save the code under the wrong tab.
   */
  const handleChange = useCallback(
    value => {
      const code = value ?? '';
      updateCode(activeTabId, code);

      if (!settings.autoRun) return;
      if (runTimerRef.current) clearTimeout(runTimerRef.current);
      runTimerRef.current = setTimeout(() => {
        runTimerRef.current = null;
        run(code);
      }, RUN_DEBOUNCE_MS);
    },
    [activeTabId, settings.autoRun, run, updateCode]
  );

  useEffect(
    () => () => {
      if (runTimerRef.current) clearTimeout(runTimerRef.current);
    },
    []
  );

  // Run once the worker is up, and again whenever a different tab is shown.
  // Switching tabs no longer has to push code into the worker by hand, which
  // is what left the closed tab's output on screen.
  useEffect(() => {
    if (!loaded || status === STATUS.STARTING || !activeTab) return;
    if (lastRunTabRef.current === activeTab.id) return;
    lastRunTabRef.current = activeTab.id;
    run(activeTab.code);
  }, [loaded, status, activeTab, run]);

  const markers = useMemo(
    () =>
      entries
        .filter(entry => entry.t === ERROR && entry.line)
        .map(entry => ({
          line: entry.line,
          column: entry.column,
          message: `${entry.name}: ${entry.message}`
        })),
    [entries]
  );

  /**
   * Output can be taller than the code that produced it. Growing the editor's
   * bottom padding extends Monaco's scroll range so the tail stays reachable
   * while Monaco remains the only scroll authority.
   */
  useEffect(() => {
    const natural = viewport.contentHeight - extraBottomPadding;
    const needed = Math.max(0, outputBottom - natural + 40);
    if (Math.abs(needed - extraBottomPadding) > PADDING_TOLERANCE) {
      setExtraBottomPadding(needed);
    }
  }, [outputBottom, viewport.contentHeight, extraBottomPadding]);

  /**
   * Both listeners are removed when the drag ends. The previous version added
   * a fresh anonymous mouseup listener on every mousedown and never removed
   * any of them, so they accumulated for the life of the session.
   */
  const startResize = useCallback(
    event => {
      event.preventDefault();

      const onMove = moveEvent => {
        const percentage = (moveEvent.clientX / window.innerWidth) * 100;
        updateSettings({
          editorSeparator: Math.min(Math.max(percentage, 20), 80)
        });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
      };

      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [updateSettings]
  );

  // The workspace is a file now, so the first paint happens before it is read.
  if (!loaded) {
    return <div className="h-screen bg-[#212830]" />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={setActive}
        onClose={closeTab}
        onCreate={addTab}
        onRename={renameTab}
        onMove={moveTab}
      />

      {persistError && (
        <div className="shrink-0 bg-[#3a2d15] px-3 py-1 text-[12px] text-[#e3b341]">
          {`Could not save the workspace: ${persistError}`}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <EditorPanel
          value={activeTab?.code ?? ''}
          language={settings.language}
          onChange={handleChange}
          onEditorReady={setEditor}
          markers={markers}
          extraBottomPadding={extraBottomPadding}
          width={`${settings.editorSeparator}vw`}
        />

        <div
          className="flex cursor-ew-resize px-1"
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
        >
          <div className="w-0.5 bg-[#2d3641]"></div>
        </div>

        <OutputPanel
          entries={entries}
          viewport={viewport}
          onExpand={expand}
          overflowed={overflowed}
          width={`calc(${100 - settings.editorSeparator}vw - 10px)`}
          onContentBottom={setOutputBottom}
        />
      </div>

      <StatusBar
        status={status}
        duration={duration}
        entryCount={entries.length}
        autoRun={settings.autoRun}
        onToggleAutoRun={() => updateSettings({ autoRun: !settings.autoRun })}
        onRun={() => runNow()}
        onStop={stop}
        onClear={clear}
      />
    </div>
  );
};

export default App;
