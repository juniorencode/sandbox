import PropTypes from 'prop-types';
import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { githubDarkTheme } from '../../utilities/theme.utilities';

export const EditorPanel = ({
  tabs,
  setTabs,
  activeTab,
  editorRef,
  outputRef,
  editorSeparator,
  executeCode
}) => {
  const [timeoutId, setTimeoutId] = useState(null);

  const handleEditorChange = value => {
    if (timeoutId) clearInterval(timeoutId);

    setTimeoutId(
      setTimeout(() => {
        const updateCode = tabs.map(tab =>
          tab.id === activeTab ? { ...tab, code: value } : tab
        );

        setTabs(updateCode);
        executeCode(value);
      }, 200)
    );
  };

  const handleEditorDidMount = editor => {
    editorRef.current = editor;
    editor.onDidScrollChange(handleScrollEditor);
  };

  const handleScrollEditor = e => {
    if (editorRef.current && outputRef.current) {
      outputRef.current.scrollTop = e.scrollTop;
    }
  };

  const handleBeforeMount = monaco => {
    monaco.editor.defineTheme('github-dark-theme', githubDarkTheme);
  };

  return (
    <div
      className="h-[calc(100vh-40px)]"
      style={{ width: `${editorSeparator}vw` }}
    >
      <Editor
        theme="github-dark-theme"
        defaultLanguage="javascript"
        value={tabs.find(tab => tab.id === activeTab)?.code || ''}
        options={{
          minimap: { enabled: false },
          padding: { top: 20, bottom: 20 }
        }}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        beforeMount={handleBeforeMount}
        onDidScrollChange={handleScrollEditor}
      />
    </div>
  );
};

EditorPanel.propTypes = {
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      code: PropTypes.string.isRequired
    })
  ).isRequired,
  setTabs: PropTypes.func.isRequired,
  activeTab: PropTypes.number.isRequired,
  editorRef: PropTypes.object.isRequired,
  outputRef: PropTypes.object.isRequired,
  editorSeparator: PropTypes.number.isRequired,
  executeCode: PropTypes.func.isRequired
};
