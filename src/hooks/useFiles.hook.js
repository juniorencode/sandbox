import { useCallback, useState } from 'react';
import { files, node, revealWorkspace, workspace as store } from '../platform';
import { languageForName } from './useWorkspace.hook';

/**
 * Opening and saving real files, and moving the whole workspace in and out.
 *
 * Everything the user wrote was trapped in the app: there was no open, no
 * save, no export and no import, so a workspace could only ever be read by
 * the app that wrote it and there was no way to get a snippet out.
 */
export const useFiles = ({
  tabs,
  activeTab,
  addTab,
  setTabPath,
  replaceWorkspace,
  snapshot
}) => {
  const [notice, setNotice] = useState(null);

  const report = useCallback((tone, message) => {
    setNotice({ tone, message, at: Date.now() });
  }, []);

  const dismiss = useCallback(() => setNotice(null), []);

  const openFiles = useCallback(async () => {
    const result = await files.open();
    if (result?.canceled) return;
    if (!result?.ok) {
      report('error', result?.error || 'Could not open the file');
      return;
    }

    result.files.forEach(file => {
      // A file already open is focused rather than opened twice.
      const existing = file.path
        ? tabs.find(tab => tab.path === file.path)
        : null;
      if (existing) {
        setTabPath(existing.id, { path: file.path, name: file.name });
        return;
      }
      addTab({
        name: file.name,
        code: file.code,
        path: file.path,
        // A .ts file should not need the language picking by hand.
        language: languageForName(file.name)
      });
    });

    report(
      'info',
      result.files.length === 1
        ? `Opened ${result.files[0].name}`
        : `Opened ${result.files.length} files`
    );
  }, [addTab, report, setTabPath, tabs]);

  const saveAs = useCallback(async () => {
    if (!activeTab) return;
    const result = await files.saveAs({
      name: activeTab.name,
      code: activeTab.code
    });
    if (result?.canceled) return;
    if (!result?.ok) {
      report('error', result?.error || 'Could not save the file');
      return;
    }
    setTabPath(activeTab.id, { path: result.path, name: result.name });
    report('info', `Saved ${result.name ?? result.path}`);
  }, [activeTab, report, setTabPath]);

  const save = useCallback(async () => {
    if (!activeTab) return;
    // A scratchpad tab has nowhere to save to yet, so it becomes a Save As.
    if (!activeTab.path) {
      await saveAs();
      return;
    }
    const result = await files.save({
      path: activeTab.path,
      code: activeTab.code
    });
    if (!result?.ok) {
      report('error', result?.error || 'Could not save the file');
      return;
    }
    report('info', `Saved ${activeTab.name}`);
  }, [activeTab, report, saveAs]);

  const exportWorkspace = useCallback(async () => {
    const result = await store.export(snapshot);
    if (result?.canceled) return;
    if (!result?.ok) {
      report('error', result?.error || 'Could not export the workspace');
      return;
    }
    report('info', `Exported to ${result.path}`);
  }, [report, snapshot]);

  const importWorkspace = useCallback(async () => {
    const result = await store.import();
    if (result?.canceled) return;
    if (!result?.ok) {
      report('error', result?.error || 'Could not import the workspace');
      return;
    }
    replaceWorkspace(result.data);
    report('info', `Imported ${result.data.tabs.length} tabs`);
  }, [replaceWorkspace, report]);

  const showWorkspaceFolder = useCallback(() => revealWorkspace(), []);

  /** Where `npm install` makes packages reachable from Node-mode tabs. */
  const showNodeFolder = useCallback(async () => {
    const result = await node.revealDir();
    if (result?.ok === false) {
      report('error', result.error || 'Node mode is not available');
    }
  }, [report]);

  return {
    notice,
    dismiss,
    // Exposed so actions outside this hook, such as formatting, can surface a
    // message through the same toast rather than inventing their own.
    report,
    openFiles,
    save,
    saveAs,
    exportWorkspace,
    importWorkspace,
    showWorkspaceFolder,
    showNodeFolder
  };
};
