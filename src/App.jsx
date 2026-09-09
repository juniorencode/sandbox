import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { EditorPanel } from './components/EditorPanel';
import { OutputPanel } from './components/OutputPanel';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { Toast } from './components/Toast';
import { UpdateBanner } from './components/UpdateBanner';
import { useCommands } from './hooks/useCommands.hook';
import { useEditorViewport } from './hooks/useEditorViewport.hook';
import { useFiles } from './hooks/useFiles.hook';
import { useMenuBridge } from './hooks/useMenuBridge.hook';
import { useRunner, STATUS } from './hooks/useRunner.hook';
import { useShortcuts } from './hooks/useShortcuts.hook';
import { useUpdates } from './hooks/useUpdates.hook';
import { useWorkspace } from './hooks/useWorkspace.hook';
import { assets, modules } from './platform';
import { ERROR } from './runtime/protocol.js';
import { label } from './utilities/shortcut.utilities';

const LANGUAGES = ['javascript', 'jsx', 'typescript', 'tsx'];

const RUN_DEBOUNCE_MS = 200;
/** Hysteresis so the editor's bottom padding cannot oscillate. */
const PADDING_TOLERANCE = 8;

const App = () => {
  const workspace = useWorkspace();
  const {
    loaded,
    tabs,
    activeTabId,
    activeTab,
    settings,
    persistError,
    updateCode,
    updateSettings
  } = workspace;

  const [editor, setEditor] = useState(null);
  const [outputBottom, setOutputBottom] = useState(0);
  const [extraBottomPadding, setExtraBottomPadding] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const runTimerRef = useRef(null);
  const lastRunTabRef = useRef(null);

  const viewport = useEditorViewport(editor);
  const {
    entries,
    status,
    duration,
    overflowed,
    transpiler,
    run,
    stop,
    clear,
    expand,
    initTranspiler
  } = useRunner({ timeoutMs: settings.timeoutMs });

  const language = activeTab?.language ?? 'javascript';

  const fileActions = useFiles(workspace);
  const updateState = useUpdates();

  const runNow = useCallback(
    code => {
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
      run(code ?? activeTab?.code ?? '', { language });
    },
    [run, activeTab, language]
  );

  const toggleAutoRun = useCallback(
    () => updateSettings({ autoRun: !settings.autoRun }),
    [settings.autoRun, updateSettings]
  );

  const palette = useMemo(
    () => ({
      open: () => setPaletteOpen(true),
      close: () => setPaletteOpen(false)
    }),
    []
  );

  const runner = useMemo(
    () => ({ runNow: () => runNow(), stop, clear, toggleAutoRun }),
    [runNow, stop, clear, toggleAutoRun]
  );

  const commands = useCommands({
    runner,
    workspace,
    fileActions,
    palette,
    settings,
    updates: updateState
  });

  useShortcuts(commands);
  useMenuBridge(commands);

  /** Shortcut labels for the buttons, derived from the same registry. */
  const hints = useMemo(() => {
    const found = id => commands.find(command => command.id === id)?.shortcut;
    return {
      run: found('run.now') && label(found('run.now')),
      stop: found('run.stop') && label(found('run.stop')),
      clear: found('output.clear') && label(found('output.clear')),
      newTab: found('tab.new') && label(found('tab.new')),
      palette: found('palette.open') && label(found('palette.open'))
    };
  }, [commands]);

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
        run(code, { language });
      }, RUN_DEBOUNCE_MS);
    },
    [activeTabId, settings.autoRun, run, updateCode, language]
  );

  useEffect(
    () => () => {
      if (runTimerRef.current) clearTimeout(runTimerRef.current);
    },
    []
  );

  /**
   * The compiler is only loaded once a tab actually needs it: the wasm binary
   * is 14 MB, and a workspace that never leaves JavaScript should not pay for
   * it. Re-running once it is ready is what turns the placeholder message
   * into real output.
   */
  useEffect(() => {
    if (language === 'javascript' || transpiler.status !== 'idle') return;
    let cancelled = false;
    assets.esbuildWasm().then(result => {
      if (cancelled) return;
      if (result?.ok) initTranspiler(result.wasm);
    });
    return () => {
      cancelled = true;
    };
  }, [language, transpiler.status, initTranspiler]);

  useEffect(() => {
    if (transpiler.status !== 'ready' || !activeTab) return;
    if (activeTab.language === 'javascript') return;
    run(activeTab.code, { language: activeTab.language });
    // Only when the compiler becomes available; edits are handled elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transpiler.status]);

  // The module handler lives in the main process and answers without asking
  // the renderer, so the setting is pushed to it rather than queried.
  useEffect(() => {
    modules.setAllowed(settings.allowModuleDownloads);
  }, [settings.allowModuleDownloads]);

  // Run once the worker is up, and again whenever a different tab is shown.
  // Switching tabs no longer has to push code into the worker by hand, which
  // is what left the closed tab's output on screen.
  useEffect(() => {
    if (!loaded || status === STATUS.STARTING || !activeTab) return;
    if (lastRunTabRef.current === activeTab.id) return;
    lastRunTabRef.current = activeTab.id;
    run(activeTab.code, { language: activeTab.language ?? 'javascript' });
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
        onSelect={workspace.setActive}
        onClose={workspace.closeTab}
        onCreate={workspace.addTab}
        onRename={workspace.renameTab}
        onMove={workspace.moveTab}
        newTabHint={hints.newTab}
      />

      <UpdateBanner
        state={updateState}
        onDownload={updateState.download}
        onInstall={updateState.install}
        onDismiss={updateState.dismiss}
      />

      {persistError && (
        <div className="shrink-0 bg-[#3a2d15] px-3 py-1 text-[12px] text-[#e3b341]">
          {`Could not save the workspace: ${persistError}`}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <EditorPanel
          value={activeTab?.code ?? ''}
          language={language}
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
        language={language}
        languages={LANGUAGES}
        transpiler={transpiler}
        onLanguageChange={value => workspace.setTabLanguage(activeTabId, value)}
        hints={hints}
        onToggleAutoRun={toggleAutoRun}
        onRun={() => runNow()}
        onStop={stop}
        onClear={clear}
        onOpenPalette={palette.open}
      />

      <CommandPalette
        commands={commands}
        open={paletteOpen}
        onClose={palette.close}
      />

      <Toast notice={fileActions.notice} onDismiss={fileActions.dismiss} />
    </div>
  );
};

export default App;
