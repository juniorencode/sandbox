import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { ConfirmDialog } from './components/ConfirmDialog';
import { EditorPanel } from './components/EditorPanel';
import { OutputPanel } from './components/OutputPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { SidePanel } from './components/SidePanel';
import { StatusBar } from './components/StatusBar';
import { TabBar } from './components/TabBar';
import { Toast } from './components/Toast';
import { UpdateBanner } from './components/UpdateBanner';
import { useCommands } from './hooks/useCommands.hook';
import { useEditorViewport } from './hooks/useEditorViewport.hook';
import { useFiles } from './hooks/useFiles.hook';
import { useHistory } from './hooks/useHistory.hook';
import { useMenuBridge } from './hooks/useMenuBridge.hook';
import { useRunner, STATUS } from './hooks/useRunner.hook';
import { useShare } from './hooks/useShare.hook';
import { useShortcuts } from './hooks/useShortcuts.hook';
import { useTheme } from './hooks/useTheme.hook';
import { useUpdates } from './hooks/useUpdates.hook';
import { useWorkspace } from './hooks/useWorkspace.hook';
import { appInfo as readAppInfo, assets, modules } from './platform';
import { ERROR } from './runtime/protocol.js';
import { formatCode } from './utilities/format.utilities';
import { label } from './utilities/shortcut.utilities';

const LANGUAGES = ['javascript', 'jsx', 'typescript', 'tsx'];
const RUNTIMES = ['browser', 'node'];
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
    history,
    setHistory,
    persistError,
    updateCode,
    updateSettings
  } = workspace;

  const [editor, setEditor] = useState(null);
  const [outputBottom, setOutputBottom] = useState(0);
  const [extraBottomPadding, setExtraBottomPadding] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelView, setPanelView] = useState(null);
  const [pendingReveal, setPendingReveal] = useState(null);
  const [appInfo, setAppInfo] = useState(null);
  const [pendingRuntime, setPendingRuntime] = useState(null);

  const runTimerRef = useRef(null);
  const lastRunTabRef = useRef(null);
  const splitRef = useRef(null);
  const explicitRunRef = useRef(false);
  const recordedRunRef = useRef(null);

  const language = activeTab?.language ?? 'javascript';
  const runtime = activeTab?.runtime ?? 'browser';
  const vertical = settings.layout === 'vertical';
  const appearance = useTheme(settings.theme);

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
  const historyLog = useHistory({ history, setHistory });
  const shareActions = useShare({
    activeTab,
    addTab: workspace.addTab,
    report: fileActions.report
  });

  useEffect(() => {
    readAppInfo().then(info => info?.ok && setAppInfo(info));
  }, []);

  const runNow = useCallback(
    code => {
      if (runTimerRef.current) {
        clearTimeout(runTimerRef.current);
        runTimerRef.current = null;
      }
      // Marks the run as deliberate, which history records unconditionally;
      // automatic runs are filtered so a keystroke is not a snapshot.
      explicitRunRef.current = true;
      run(code ?? activeTab?.code ?? '', { language, runtime });
    },
    [run, activeTab, language, runtime]
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

  /**
   * Switching a tab to Node mode is gated once, because it moves the code out
   * of a sandboxed worker and into a process with the app's own privileges.
   * The choice is remembered so it is asked for once, not per tab.
   */
  const requestRuntime = useCallback(
    value => {
      if (value !== 'node' || settings.nodeModeAcknowledged) {
        workspace.setTabRuntime(activeTabId, value);
        return;
      }
      setPendingRuntime(value);
    },
    [activeTabId, settings.nodeModeAcknowledged, workspace]
  );

  const palette = useMemo(
    () => ({
      open: () => setPaletteOpen(true),
      close: () => setPaletteOpen(false)
    }),
    []
  );

  const panel = useMemo(
    () => ({
      open: view => setPanelView(current => (current === view ? null : view)),
      close: () => setPanelView(null)
    }),
    []
  );

  const runner = useMemo(
    () => ({ runNow: () => runNow(), stop, clear, toggleAutoRun }),
    [runNow, stop, clear, toggleAutoRun]
  );

  const editorActions = useMemo(
    () => ({
      format,
      openSettings: () => setSettingsOpen(true),
      // Cycles rather than toggles, so `system` stays reachable from the
      // palette instead of only from the settings dialog.
      cycleTheme: () => {
        const order = ['system', 'dark', 'light'];
        const next = order[(order.indexOf(settings.theme) + 1) % order.length];
        updateSettings({ theme: next });
      }
    }),
    [format, settings.theme, updateSettings]
  );

  const commands = useCommands({
    runner,
    workspace,
    fileActions,
    shareActions,
    editorActions,
    panel,
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
        run(code, { language, runtime });
      }, settings.runDebounceMs);
    },
    [
      activeTabId,
      settings.autoRun,
      settings.runDebounceMs,
      run,
      updateCode,
      language,
      runtime
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
    run(activeTab.code, {
      language: activeTab.language ?? 'javascript',
      runtime: activeTab.runtime ?? 'browser'
    });
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
    run(activeTab.code, {
      language: activeTab.language,
      runtime: activeTab.runtime ?? 'browser'
    });
    // Only when the compiler becomes available; edits are handled elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transpiler.status]);

  // The module handler lives in the main process and answers without asking
  // the renderer, so the setting is pushed to it rather than queried.
  useEffect(() => {
    modules.setAllowed(settings.allowModuleDownloads);
  }, [settings.allowModuleDownloads]);

  /**
   * Snapshots are taken on settle rather than on edit, so what is recorded is
   * what actually ran. The signature guard keeps one settle from being
   * recorded twice when late async output re-renders.
   */
  useEffect(() => {
    if (status !== STATUS.SETTLED || !activeTab) return;
    const signature = activeTab.id + ':' + activeTab.code.length + ':' + duration;
    if (recordedRunRef.current === signature) return;
    recordedRunRef.current = signature;

    const explicit = explicitRunRef.current;
    explicitRunRef.current = false;

    historyLog.record({
      tabId: activeTab.id,
      name: activeTab.name,
      language: activeTab.language,
      code: activeTab.code,
      summary: {
        entries: entries.length,
        durationMs: duration,
        errored: entries.some(entry => entry.t === ERROR)
      },
      explicit
    });
    // `entries` is read for the summary but must not retrigger this as late
    // output arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, duration, activeTab]);

  /**
   * A search hit can point at a tab that is not showing, so the jump waits
   * until that tab's model is the one in the editor.
   */
  useEffect(() => {
    if (!pendingReveal || pendingReveal.tabId !== activeTabId) return;
    viewport.revealLine(pendingReveal.line);
    setPendingReveal(null);
  }, [pendingReveal, activeTabId, viewport]);

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
    return <div className="h-screen bg-app" />;
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
        <div className="shrink-0 bg-warn-soft px-3 py-1 text-[12px] text-warn">
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
          appearance={appearance}
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
              vertical ? 'h-0.5 w-full bg-raised' : 'w-0.5 bg-raised'
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

        <SidePanel
          open={Boolean(panelView)}
          view={panelView ?? 'history'}
          onView={setPanelView}
          onClose={panel.close}
          tabs={tabs}
          history={historyLog.entries}
          onRestore={snapshot => updateCode(activeTabId, snapshot.code)}
          onOpenAsTab={snapshot =>
            workspace.addTab({
              name: snapshot.name + ' (restored)',
              code: snapshot.code,
              language: snapshot.language
            })
          }
          onRemove={historyLog.remove}
          onClear={historyLog.clear}
          onReveal={(tabId, line) => {
            workspace.setActive(tabId);
            setPendingReveal({ tabId, line });
          }}
        />
      </div>

      <StatusBar
        status={status}
        duration={duration}
        entryCount={entries.length}
        autoRun={settings.autoRun}
        language={language}
        languages={LANGUAGES}
        runtime={runtime}
        runtimes={RUNTIMES}
        transpiler={transpiler}
        onLanguageChange={value => workspace.setTabLanguage(activeTabId, value)}
        onRuntimeChange={requestRuntime}
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

      <ConfirmDialog
        open={Boolean(pendingRuntime)}
        tone="warning"
        title="Run this tab in Node?"
        confirmLabel="Enable Node mode"
        body={
          <>
            <p>
              Node mode evaluates the tab in a real Node process, so
              <span className="text-ink"> require</span>, the built-in
              modules and packages installed on disk all work.
            </p>
            <p className="mt-2">
              It also means the code runs with this app&apos;s privileges
              instead of inside a sandboxed worker: it can read and write your
              files and reach the network. Only turn it on for code you
              understand.
            </p>
          </>
        }
        onCancel={() => setPendingRuntime(null)}
        onConfirm={() => {
          updateSettings({ nodeModeAcknowledged: true });
          workspace.setTabRuntime(activeTabId, pendingRuntime);
          setPendingRuntime(null);
        }}
      />

      <Toast notice={fileActions.notice} onDismiss={fileActions.dismiss} />
    </div>
  );
};

export default App;
