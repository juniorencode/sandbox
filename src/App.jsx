import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { EditorPanel } from './components/EditorPanel';
import { OutputPanel } from './components/OutputPanel';
import { SettingsDialog } from './components/SettingsDialog';
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
import { appInfo as readAppInfo, assets, modules } from './platform';
import { ERROR } from './runtime/protocol.js';
import { formatCode } from './utilities/format.utilities';
import { label } from './utilities/shortcut.utilities';

const LANGUAGES = ['javascript', 'jsx', 'typescript', 'tsx'];
/** Hysteresis so the editor's bottom padding cannot oscillate. */
const PADDING_TOLERANCE = 8;
/** Size of the drag handle, on whichever axis the split is on. */
const HANDLE = 10;

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appInfo, setAppInfo] = useState(null);

  const runTimerRef = useRef(null);
  const lastRunTabRef = useRef(null);
  const splitRef = useRef(null);

  const language = activeTab?.language ?? 'javascript';
  const vertical = settings.layout === 'vertical';

  const limits = useMemo(
    () => ({ maxDepth: settings.maxDepth, maxItems: settings.maxItems }),
    [settings.maxDepth, settings.maxItems]
  );

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
  } = useRunner({ timeoutMs: settings.timeoutMs, limits });

  const fileActions = useFiles(workspace);
  const updateState = useUpdates();

  useEffect(() => {
    readAppInfo().then(info => info?.ok && setAppInfo(info));
  }, []);

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

  /**
   * Formatting runs through the same registry as everything else, so it is
   * reachable from the keyboard, the palette and the native menu.
   */
  const format = useCallback(async () => {
    if (!activeTab) return;
    const result = await formatCode(activeTab.code, language, {
      tabSize: settings.tabSize
    });
    if (!result.ok) {
      fileActions.report('error', `Could not format: ${result.error}`);
      return;
    }
    if (result.code === activeTab.code) return;

    // Applied as an edit rather than a value swap, so undo still works.
    const model = editor?.getModel();
    if (model) {
      editor.executeEdits('format', [
        { range: model.getFullModelRange(), text: result.code }
      ]);
      editor.pushUndoStop();
    } else {
      updateCode(activeTab.id, result.code);
    }
  }, [activeTab, language, settings.tabSize, editor, updateCode, fileActions]);

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

  const editorActions = useMemo(
    () => ({ format, openSettings: () => setSettingsOpen(true) }),
    [format]
  );

  const commands = useCommands({
    runner,
    workspace,
    fileActions,
    editorActions,
    palette,
    settings,
    updates: updateState
  });

  useShortcuts(commands);
  useMenuBridge(commands);

  /** Shortcut labels for the buttons, derived from the same registry. */
  const hints = useMemo(() => {
    const found = id => commands.find(command => command.id === id)?.shortcut;
    const show = id => (found(id) ? label(found(id)) : undefined);
    return {
      run: show('run.now'),
      stop: show('run.stop'),
      clear: show('output.clear'),
      newTab: show('tab.new'),
      palette: show('palette.open'),
      settings: show('settings.open')
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
      }, settings.runDebounceMs);
    },
    [
      activeTabId,
      settings.autoRun,
      settings.runDebounceMs,
      run,
      updateCode,
      language
    ]
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
    run(activeTab.code, { language: activeTab.language ?? 'javascript' });
  }, [loaded, status, activeTab, run]);

  /**
   * The compiler is only loaded once a tab actually needs it: the wasm binary
   * is 14 MB, and a workspace that never leaves JavaScript should not pay for
   * it. Re-running once it is ready is what turns the placeholder message into
   * real output.
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
   *
   * Measured against the split container rather than the viewport, so it stays
   * correct on either axis and whatever else the window happens to be showing.
   */
  const startResize = useCallback(
    event => {
      event.preventDefault();
      const container = splitRef.current;
      if (!container) return;

      const onMove = moveEvent => {
        const box = container.getBoundingClientRect();
        const fraction = vertical
          ? (moveEvent.clientY - box.top) / box.height
          : (moveEvent.clientX - box.left) / box.width;
        updateSettings({
          editorSeparator: Math.min(Math.max(fraction * 100, 15), 85)
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
    [updateSettings, vertical]
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

      {/* Panes are sized with flex-basis rather than vw units, so one set of
          styles works on both axes and they cannot drift out of the container
          the way a hardcoded `calc(...vw - 10px)` pair did. */}
      <div
        ref={splitRef}
        className={`flex min-h-0 flex-1 ${vertical ? 'flex-col' : 'flex-row'}`}
      >
        <EditorPanel
          value={activeTab?.code ?? ''}
          language={language}
          onChange={handleChange}
          onEditorReady={setEditor}
          markers={markers}
          extraBottomPadding={extraBottomPadding}
          fontSize={settings.fontSize}
          tabSize={settings.tabSize}
          wordWrap={settings.wordWrap}
          style={{ flex: `0 0 ${settings.editorSeparator}%` }}
        />

        <div
          className={`flex shrink-0 ${
            vertical ? 'cursor-ns-resize py-1' : 'cursor-ew-resize px-1'
          }`}
          style={vertical ? { height: HANDLE } : { width: HANDLE }}
          onMouseDown={startResize}
          role="separator"
          aria-orientation={vertical ? 'horizontal' : 'vertical'}
        >
          <div
            className={
              vertical ? 'h-0.5 w-full bg-[#2d3641]' : 'w-0.5 bg-[#2d3641]'
            }
          ></div>
        </div>

        <OutputPanel
          entries={entries}
          viewport={viewport}
          onExpand={expand}
          overflowed={overflowed}
          fontSize={settings.fontSize}
          style={{ flex: '1 1 0%' }}
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
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <CommandPalette
        commands={commands}
        open={paletteOpen}
        onClose={palette.close}
      />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setSettingsOpen(false)}
        appInfo={appInfo}
      />

      <Toast notice={fileActions.notice} onDismiss={fileActions.dismiss} />
    </div>
  );
};

export default App;
