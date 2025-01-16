import { useState } from 'react';
import Editor from '@monaco-editor/react';

const App = () => {
  const [code, setCode] = useState('');

  const handleEditorChange = value => {
    setCode(value);
  };

  return (
    <div className="w-[50vw] h-screen">
      <Editor
        defaultLanguage="javascript"
        theme="vs-dark"
        value={code}
        onChange={handleEditorChange}
      />
    </div>
  );
};

export default App;
