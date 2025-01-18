import { useEffect, useRef, useState } from 'react';
import { EditorPanel } from './components/EditorPanel';
import { OutputPanel } from './components/OutputPanel';
import { TabBar } from './components/TabBar';
import { useWorker } from './hooks/useWorker.hook';

const App = () => {
  const [tabs, setTabs] = useState(() => {
    const savedTabs = localStorage.getItem('data');
    return savedTabs
      ? JSON.parse(savedTabs)
      : [
          {
            id: 1,
            name: 'Tab 1',
            code: ''
          }
        ];
  });
  const [activeTab, setActiveTab] = useState(() => {
    const savedActiveTab = localStorage.getItem('activeTab');
    return savedActiveTab ? parseInt(savedActiveTab) : tabs[0].id;
  });

  const [output, setOutput] = useState('');
  const executeCode = useWorker(tabs, activeTab, setOutput);

  const editorRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('data', JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  return (
    <div className="flex flex-col bg-[#212830]">
      <TabBar
        tabs={tabs}
        activeTab={activeTab}
        setTabs={setTabs}
        setActiveTab={setActiveTab}
        setOutput={setOutput}
        executeCode={executeCode}
      />
      <div className="flex">
        <EditorPanel
          tabs={tabs}
          setTabs={setTabs}
          activeTab={activeTab}
          editorRef={editorRef}
          outputRef={outputRef}
          executeCode={executeCode}
        />
        <OutputPanel
          output={output}
          editorRef={editorRef}
          outputRef={outputRef}
        />
      </div>
    </div>
  );
};

export default App;
