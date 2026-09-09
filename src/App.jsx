import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorPanel } from './components/EditorPanel';
import { OutputPanel } from './components/OutputPanel';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { useEditorViewport } from './hooks/useEditorViewport.hook';
import { useRunner } from './hooks/useRunner.hook';
import { ERROR } from './runtime/protocol.js';

const RUN_DEBOUNCE_MS = 200;
const PERSIST_DEBOUNCE_MS = 400;
/** Hysteresis so the editor's bottom padding cannot oscillate. */
const PADDING_TOLERANCE = 8;

const readTabs = () => {
  const saved = localStorage.getItem('data');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      // Corrupt storage used to take the whole app down: this parse ran during
      // the initial render with no try/catch, and there is no devtools or menu
      // in the packaged build to clear it from.
    }
  }
  return [{ id: 1, name: 'Tab 1', code: '' }];
};

const App = () => {
  const [tabs, setTabs] = useState(readTabs);
  const [activeTab, setActiveTab] = useState(() => {
    const saved = parseInt(localStorage.getItem('activeTab'), 10);
    return Number.isInteger(saved) ? saved : 1;
  });
  const [editorSeparator, setEditorSeparator] = useState(() => {
    const saved = parseFloat(localStorage.getItem('editorSeparator'));
    return Number.isFinite(saved) ? saved : 60;
  });
  const [autoRun, setAutoRun] = useState(
    () => localStorage.getItem('autoRun') !== 'false'
  );
  const [editor, setEditor] = useState(null);
  const [outputBottom, setOutputBottom] = useState(0);
  const [extraBottomPadding, setExtraBottomPadding] = useState(0);

  const runTimerRef = useRef(null);
  const persistTimerRef = useRef(null);

  const viewport = useEditorViewport(editor);
  const { entries, status, duration, overflowed, run, stop, clear, expand } =
    useRunner();

  /**
   * An activeTab pointing at a tab that no longer exists left the editor
   * apparently read-only: `value` fell back to '', the change handler found no
   * matching tab, and the controlled value reverted every keystroke.
   */
  const current = useMemo(
    () => tabs.find(tab => tab.id === activeTab) ?? tabs[0],
    [tabs, activeTab]
  );

  useEffect(() => {
    if (current && current.id !== activeTab) setActiveTab(current.id);
  }, [current, activeTab]);

  // Writing every tab's JSON on each keystroke blocked the main thread while
  // typing, so persistence is debounced separately from the run.
  useEffect(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      try {
        localStorage.setItem('data', JSON.stringify(tabs));
      } catch {
        // Quota exceeded. Dropping the write is survivable; letting it throw
        // from an effect took the whole renderer down with a blank window.
      }
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem('activeTab', String(activeTab));
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('editorSeparator', String(editorSeparator));
  }, [editorSeparator]);

  useEffect(() => {
    localStorage.setItem('autoRun', String(autoRun));
  }, [autoRun]);

  const runNow = useCallback(
    code => {
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
      run(code ?? current?.code ?? '');
    },
    [run, current]
  );

  /**
   * The tab is updated immediately and only the run is debounced.
   *
   * The old handler debounced both, and rebuilt the array from the `tabs`
   * value captured when the timeout was scheduled. Switching or closing a tab
   * inside that 200ms window wrote a stale array back: it could resurrect a
   * closed tab, discard a new one, or store the code under the wrong tab.
   */
  const handleChange = useCallback(
    value => {
      const code = value ?? '';
      setTabs(previous =>
        previous.map(tab => (tab.id === activeTab ? { ...tab, code } : tab))
      );

      if (!autoRun) return;
      if (runTimerRef.current) clearTimeout(runTimerRef.current);
      runTimerRef.current = setTimeout(() => {
        runTimerRef.current = null;
        run(code);
      }, RUN_DEBOUNCE_MS);
    },
    [activeTab, autoRun, run]
  );

  useEffect(
    () => () => {
      if (runTimerRef.current) clearTimeout(runTimerRef.current);
    },
    []
  );

  // Run once the worker is up, and whenever the active tab changes.
  const lastRunTabRef = useRef(null);
  useEffect(() => {
    if (status === 'starting' || !current) return;
    if (lastRunTabRef.current === current.id) return;
    lastRunTabRef.current = current.id;
    run(current.code);
  }, [current, status, run]);

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
  const startResize = useCallback(event => {
    event.preventDefault();

    const onMove = moveEvent => {
      const percentage = (moveEvent.clientX / window.innerWidth) * 100;
      setEditorSeparator(Math.min(Math.max(percentage, 20), 80));
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };

    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        setTabs={setTabs}
        setActiveTab={setActiveTab}
      />

      <div className="flex min-h-0 flex-1">
        <EditorPanel
          value={current?.code ?? ''}
          language="javascript"
          onChange={handleChange}
          onEditorReady={setEditor}
          markers={markers}
          extraBottomPadding={extraBottomPadding}
          width={`${editorSeparator}vw`}
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
          width={`calc(${100 - editorSeparator}vw - 10px)`}
          onContentBottom={setOutputBottom}
        />
      </div>

      <StatusBar
        status={status}
        duration={duration}
        entryCount={entries.length}
        autoRun={autoRun}
        onToggleAutoRun={() => setAutoRun(value => !value)}
        onRun={() => runNow()}
        onStop={stop}
        onClear={clear}
      />
    </div>
  );
};

export default App;
