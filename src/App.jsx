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

  const [editorSeparator, setEditorSeparator] = useState(() => {
    const savedSeparator = localStorage.getItem('editorSeparator');
    return savedSeparator ? parseFloat(savedSeparator) : 60;
  });

  useEffect(() => {
    localStorage.setItem('data', JSON.stringify(tabs));
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem('editorSeparator', editorSeparator);
  }, [editorSeparator]);

  const handleMouseDown = e => {
    e.preventDefault();
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', handleResize);
    });
  };

  const handleResize = e => {
    const newWidth = (e.clientX / window.innerWidth) * 100;
    const limitedWidth = Math.min(Math.max(newWidth, 20), 80);
    setEditorSeparator(limitedWidth);
  };

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
          editorSeparator={editorSeparator}
          executeCode={executeCode}
        />
        <div
          className="w-1 cursor-ew-resize bg-neutral-600"
          onMouseDown={handleMouseDown}
        />
        <OutputPanel
          output={output}
          editorRef={editorRef}
          outputRef={outputRef}
          editorSeparator={editorSeparator}
        />
      </div>
    </div>
  );
};

export default App;
