import { useMemo } from 'react';

/**
 * One registry for everything the app can do.
 *
 * The keyboard handler, the command palette and the button tooltips all read
 * from this list, so a shortcut cannot be shown in the UI without being bound
 * and a command cannot be bound without being discoverable. The app previously
 * had no shortcuts and no palette at all.
 */
export const useCommands = ({
  runner,
  workspace,
  fileActions,
  editorActions,
  panel,
  palette,
  settings,
  updates
}) =>
  useMemo(() => {
    const tabIndex = () =>
      workspace.tabs.findIndex(tab => tab.id === workspace.activeTabId);

    const cycleTab = step => {
      const count = workspace.tabs.length;
      if (count < 2) return;
      const next = (tabIndex() + step + count) % count;
      workspace.setActive(workspace.tabs[next].id);
    };

    return [
      {
        id: 'palette.open',
        title: 'Command palette',
        group: 'General',
        shortcut: 'Mod+Shift+P',
        run: palette.open
      },
      {
        id: 'run.now',
        title: 'Run',
        group: 'Run',
        shortcut: 'Mod+Enter',
        run: runner.runNow
      },
      {
        id: 'run.stop',
        title: 'Stop execution',
        group: 'Run',
        shortcut: 'Mod+.',
        run: runner.stop
      },
      {
        id: 'output.clear',
        title: 'Clear output',
        group: 'Run',
        shortcut: 'Mod+K',
        run: runner.clear
      },
      {
        id: 'run.toggleAuto',
        title: settings.autoRun ? 'Turn off auto-run' : 'Turn on auto-run',
        group: 'Run',
        run: runner.toggleAutoRun
      },
      {
        id: 'tab.new',
        title: 'New tab',
        group: 'Tabs',
        shortcut: 'Mod+N',
        run: () => workspace.addTab()
      },
      {
        id: 'tab.close',
        title: 'Close tab',
        group: 'Tabs',
        shortcut: 'Mod+W',
        run: () => workspace.closeTab(workspace.activeTabId)
      },
      {
        id: 'tab.next',
        title: 'Next tab',
        group: 'Tabs',
        shortcut: 'Mod+Tab',
        run: () => cycleTab(1)
      },
      {
        id: 'tab.previous',
        title: 'Previous tab',
        group: 'Tabs',
        shortcut: 'Mod+Shift+Tab',
        run: () => cycleTab(-1)
      },
      {
        id: 'file.open',
        title: 'Open file…',
        group: 'File',
        shortcut: 'Mod+O',
        run: fileActions.openFiles
      },
      {
        id: 'file.save',
        title: 'Save',
        group: 'File',
        shortcut: 'Mod+S',
        run: fileActions.save
      },
      {
        id: 'file.saveAs',
        title: 'Save as…',
        group: 'File',
        shortcut: 'Mod+Shift+S',
        run: fileActions.saveAs
      },
      {
        id: 'workspace.export',
        title: 'Export workspace…',
        group: 'Workspace',
        run: fileActions.exportWorkspace
      },
      {
        id: 'workspace.import',
        title: 'Import workspace…',
        group: 'Workspace',
        run: fileActions.importWorkspace
      },
      {
        id: 'workspace.reveal',
        title: 'Show workspace folder',
        group: 'Workspace',
        run: fileActions.showWorkspaceFolder
      },
      {
        id: 'search.open',
        title: 'Find in all tabs',
        group: 'General',
        shortcut: 'Mod+Shift+F',
        run: () => panel.open('search')
      },
      {
        id: 'history.open',
        title: 'Execution history',
        group: 'General',
        shortcut: 'Mod+H',
        run: () => panel.open('history')
      },
      {
        id: 'editor.format',
        title: 'Format document',
        group: 'Editor',
        shortcut: 'Alt+Shift+F',
        run: editorActions.format
      },
      {
        id: 'settings.open',
        title: 'Settings',
        group: 'General',
        shortcut: 'Mod+,',
        run: editorActions.openSettings
      },
      {
        id: 'node.revealDir',
        title: 'Show Node mode packages folder',
        group: 'Workspace',
        run: fileActions.showNodeFolder
      },
      {
        id: 'app.checkUpdates',
        title: 'Check for updates',
        group: 'General',
        run: updates.check
      }
    ];
  }, [
    runner,
    workspace,
    fileActions,
    editorActions,
    panel,
    palette,
    settings.autoRun,
    updates
  ]);
