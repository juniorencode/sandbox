import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { GoPlus } from 'react-icons/go';
import { IoClose } from 'react-icons/io5';
import { githubDarkTheme } from './utilities/theme.utilities';

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
  const [activeTab, setActiveTab] = useState(1);

  const [output, setOutput] = useState('');
  const [worker, setWorker] = useState(null);
  const [timeoutId, setTimeoutId] = useState(null);

  const editorRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    const newWorker = new Worker(
      new URL('./utilities/worker.utilities.js', import.meta.url)
    );
    setWorker(newWorker);

    const code = tabs.find(tab => tab.id === activeTab)?.code || '';
    if (code !== '') {
      newWorker.postMessage(code);
      newWorker.onmessage = e => {
        setOutput(e.data);
      };
    }

    return () => {
      newWorker.terminate();
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    localStorage.setItem('data', JSON.stringify(tabs));
  }, [tabs]);

  const addTab = () => {
    const usedIds = tabs.map(tab => tab.id);
    let newId = 1;

    while (usedIds.includes(newId)) newId++;

    const newTab = {
      id: newId,
      name: `Tab ${newId}`,
      code: ''
    };
    setTabs([...tabs, newTab]);
    setActiveTab(newTab.id);
  };

  const removeTab = id => {
    if (tabs.length <= 1) return;
    const newTabs = tabs.filter(tab => tab.id !== id);
    setTabs(newTabs);
    if (activeTab === id) {
      setActiveTab(newTabs[0].id);
    }
  };

  const handleTabClick = id => {
    setActiveTab(id);
  };

  const handleEditorChange = value => {
    if (timeoutId) clearInterval(timeoutId);

    setTimeoutId(
      setTimeout(() => {
        const updateCode = tabs.map(tab => {
          if (tab.id === activeTab) {
            return { ...tab, code: value };
          }
          return tab;
        });

        setTabs(updateCode);

        if (worker) {
          worker.postMessage(value);
          worker.onmessage = e => {
            setOutput(e.data);
          };
        }
      }, 200)
    );
  };

  const handleBeforeMount = monaco => {
    monaco.editor.defineTheme('github-dark-theme', githubDarkTheme);
  };

  const handleEditorDidMount = editor => {
    editorRef.current = editor;
    editor.onDidScrollChange(e => {
      handleScrollEditor(e);
    });
  };

  const handleScrollEditor = e => {
    if (editorRef.current && outputRef.current) {
      outputRef.current.scrollTop = e.scrollTop;
    }
  };

  const handleScrollOutput = () => {
    editorRef.current.setScrollPosition({
      scrollTop: outputRef.current.scrollTop
    });
  };

  return (
    <div className="flex flex-col bg-[#212830]">
      <div className="flex gap-1 px-2 select-none bg-[#14181f]">
        <div className="flex gap-2 items-center justify-center px-1">
          <button className="w-3 h-3 rounded-full bg-red-500"></button>
          <button className="w-3 h-3 rounded-full bg-yellow-500"></button>
          <button className="w-3 h-3 rounded-full bg-green-500"></button>
        </div>
        <div className="flex flex-nowrap px-2 h-[40px] whitespace-nowrap overflow-x-auto scrollbar-hidden text-neutral-600">
          {tabs.map(tab =>
            activeTab === tab.id ? (
              <div
                key={tab.id}
                className="group flex items-center justify-center gap-2 pl-4 pr-3 rounded-t-lg text-neutral-300 bg-[#212830]"
              >
                <div>{tab.name}</div>
                <button
                  className="flex items-center justify-center mt-0.5 w-4 h-4 rounded-full hover:bg-[#464d5a]"
                  onClick={() => removeTab(tab.id)}
                >
                  <IoClose size={16} />
                </button>
              </div>
            ) : (
              <button
                key={tab.id}
                className="flex items-center justify-center px-2 rounded-t-lg"
                onClick={() => handleTabClick(tab.id)}
              >
                <div className="px-2 pr-7 rounded-lg hover:text-neutral-500 hover:bg-[#1b212b] transition-colors">
                  {tab.name}
                </div>
              </button>
            )
          )}
          <div className="flex items-center justify-center ml-2">
            <button
              className="p-0.5 rounded-full hover:bg-neutral-300 transition-colors"
              onClick={addTab}
            >
              <GoPlus size={20} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex">
        <div className="w-[60vw] h-[calc(100vh-40px)]">
          {console.log(tabs)}
          <Editor
            theme="github-dark-theme"
            defaultLanguage="javascript"
            value={tabs.find(tab => tab.id === activeTab)?.code || ''}
            options={{
              minimap: { enabled: false },
              padding: { top: 20, bottom: 20 }
            }}
            onChange={handleEditorChange}
            beforeMount={handleBeforeMount}
            onMount={handleEditorDidMount}
            onDidScrollChange={handleScrollEditor}
          />
        </div>
        <div
          ref={outputRef}
          className="py-5 px-4 w-[40vw] h-[calc(100vh-40px)] leading-[1.36] text-[14px] overflow-y-auto text-neutral-300"
          onScroll={handleScrollOutput}
        >
          <pre className="pb-[calc(100vh-42px)]">{output}</pre>
        </div>
      </div>
    </div>
  );
};

export default App;
