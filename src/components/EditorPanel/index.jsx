import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { monaco } from '../../editor/monaco.setup.js';
import { githubDarkTheme } from '../../utilities/theme.utilities';

/**
 * The editor pane.
 *
 * Scroll synchronisation used to live here: the editor wrote the output pane's
 * scrollTop and the output pane wrote back through setScrollPosition, with no
 * guard between them. It also passed `onDidScrollChange` as a prop to
 * <Editor>, which is not part of the @monaco-editor/react API and was silently
 * ignored, so the handler registered in onMount was doing all the work.
 *
 * Monaco now owns scrolling for both panes and the output derives its
 * positions from it, so there is nothing to synchronise here.
 */

const MARKER_OWNER = 'sandbox-runner';

/**
 * Monaco only has `javascript` and `typescript`; the JSX variants are the same
 * language with JSX parsing enabled, which is configured below.
 */
const MONACO_LANGUAGE = {
  javascript: 'javascript',
  jsx: 'javascript',
  typescript: 'typescript',
  tsx: 'typescript'
};

export const EditorPanel = ({
  value,
  language,
  onChange,
  onEditorReady,
  markers,
  extraBottomPadding,
  width
}) => {
  const editorRef = useRef(null);

  const handleMount = editor => {
    editorRef.current = editor;
    onEditorReady(editor);
  };

  const handleBeforeMount = instance => {
    instance.editor.defineTheme('github-dark-theme', githubDarkTheme);

    // The editor is a scratchpad, not a project: unresolved imports and
    // implicit globals are normal here and should not be underlined.
    const diagnostics = {
      noSemanticValidation: true,
      noSyntaxValidation: false
    };
    const compiler = {
      target: instance.languages.typescript.ScriptTarget.ESNext,
      module: instance.languages.typescript.ModuleKind.ESNext,
      jsx: instance.languages.typescript.JsxEmit.ReactJSX,
      allowNonTsExtensions: true,
      allowJs: true
    };

    const { javascriptDefaults, typescriptDefaults } =
      instance.languages.typescript;
    javascriptDefaults.setDiagnosticsOptions(diagnostics);
    javascriptDefaults.setCompilerOptions(compiler);
    typescriptDefaults.setDiagnosticsOptions(diagnostics);
    typescriptDefaults.setCompilerOptions(compiler);
  };

  /**
   * Underlines the failing line in the gutter and the text.
   *
   * Errors used to be plain text appended to the end of the output with no
   * location at all, so nothing connected them to the code that produced them.
   */
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      markers.map(marker => ({
        startLineNumber: marker.line,
        endLineNumber: marker.line,
        startColumn: marker.column ?? 1,
        endColumn: model.getLineMaxColumn(
          Math.min(marker.line, model.getLineCount())
        ),
        message: marker.message,
        severity: monaco.MarkerSeverity.Error
      }))
    );
  }, [markers]);

  /**
   * Output taller than the code it came from needs somewhere to scroll to.
   * Extending the editor's bottom padding grows Monaco's own scroll range,
   * which keeps it the single scroll authority for both panes.
   */
  useEffect(() => {
    editorRef.current?.updateOptions({
      padding: { top: 20, bottom: 20 + extraBottomPadding }
    });
  }, [extraBottomPadding]);

  return (
    <div className="h-full min-w-0" style={{ width }}>
      <Editor
        theme="github-dark-theme"
        language={MONACO_LANGUAGE[language] ?? 'javascript'}
        value={value}
        options={{
          minimap: { enabled: false },
          padding: { top: 20, bottom: 20 },
          scrollBeyondLastLine: true,
          smoothScrolling: true,
          fixedOverflowWidgets: true,
          renderLineHighlight: 'line',
          scrollbar: { verticalScrollbarSize: 12, useShadows: false }
        }}
        onChange={onChange}
        onMount={handleMount}
        beforeMount={handleBeforeMount}
      />
    </div>
  );
};

EditorPanel.propTypes = {
  value: PropTypes.string.isRequired,
  language: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  onEditorReady: PropTypes.func.isRequired,
  markers: PropTypes.arrayOf(
    PropTypes.shape({
      line: PropTypes.number.isRequired,
      column: PropTypes.number,
      message: PropTypes.string.isRequired
    })
  ).isRequired,
  extraBottomPadding: PropTypes.number.isRequired,
  width: PropTypes.string.isRequired
};
