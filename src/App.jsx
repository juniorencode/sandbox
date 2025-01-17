import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';

const App = () => {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [debouncedCode, setDebouncedCode] = useState(code);
  const [timeout, setTimeoutState] = useState(null);

  const handleEditorChange = value => {
    setCode(value);
    if (timeout) clearTimeout(timeout);
    setTimeoutState(
      setTimeout(() => {
        setDebouncedCode(value);
      }, 1000)
    );
  };

  useEffect(() => {
    const oldConsoleLog = console.log;
    let outputData = '';

    console.log = (...args) => {
      const stack = new Error().stack || '';
      const linesOutput = outputData.split('\n').length;
      const line = stack.split('\n')[2].split(':').reverse()[1] - 2;

      const formattedArgs = args
        .map(arg => {
          if (typeof arg === 'object' && arg !== null) {
            return JSON.stringify(arg, null, 2);
          }
          return String(arg);
        })
        .join(' ');

      if (linesOutput < line) {
        for (let i = linesOutput; i < line; i++) {
          outputData += '\n';
        }
      }

      outputData += formattedArgs + '\n';
    };

    try {
      new Function(debouncedCode)();
    } catch (error) {
      outputData += `Error: ${error.message}\n`;
    }

    console.log = oldConsoleLog;

    setOutput(outputData);
  }, [debouncedCode]);

  return (
    <div className="flex">
      <div className="w-[50vw] h-screen">
        <Editor
          defaultLanguage="javascript"
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          options={{
            lineNumbers: 'off',
            minimap: { enabled: false },
            padding: { top: 20, bottom: 20 }
          }}
        />
      </div>
      <div className="w-[50vw] h-screen">
        <Editor
          defaultLanguage="json"
          theme="vs-dark"
          value={output}
          options={{
            lineNumbers: 'off',
            minimap: { enabled: false },
            padding: { top: 20, bottom: 20 },
            readOnly: true
          }}
        />
      </div>
    </div>
  );
};

export default App;
