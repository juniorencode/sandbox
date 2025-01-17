import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';

const App = () => {
  const [code, setCode] = useState('');
  const [output, setOutput] = useState('');
  const [worker, setWorker] = useState(null);
  const [timeoutId, setTimeoutId] = useState(null);

  useEffect(() => {
    const newWorker = new Worker(
      new URL('./utilities/codeWorker.js', import.meta.url)
    );
    setWorker(newWorker);

    return () => {
      newWorker.terminate();
    };
  }, []);

  const handleEditorChange = value => {
    setCode(value);

    if (timeoutId) clearInterval(timeoutId);

    setTimeoutId(
      setTimeout(() => {
        if (worker) {
          worker.postMessage(value);
          worker.onmessage = e => {
            setOutput(e.data);
          };
        }
      }, 200)
    );
  };

  return (
    <div className="flex">
      <div className="w-[50vw] h-screen">
        <Editor
          defaultLanguage="javascript"
          theme="vs-dark"
          value={code}
          onChange={handleEditorChange}
          options={{
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
