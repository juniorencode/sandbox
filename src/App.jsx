import { useState } from 'react';
import Editor from '@monaco-editor/react';

const App = () => {
  const [code, setCode] = useState('');
  const [output] = useState('');

  const handleEditorChange = value => {
    setCode(value);
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
