import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { GoPlus } from 'react-icons/go';
import { IoClose } from 'react-icons/io5';
import { githubDarkTheme } from './utilities/theme.utilities';

const App = () => {
  const [code, setCode] = useState(`// Constants
const PI = 3.14159;
const MAX_COUNT = 100;

// Variables
let counter = 0;
let isRunning = true;

// Function
function calculateArea(radius) {
  if (radius <= 0) {
    throw new Error("Radius must be greater than zero");
  }
  return PI * radius * radius;
}

// Object
const user = {
  name: "John Doe",
  age: 30,
  skills: ["JavaScript", "React", "Node.js"],
  greet() {
    console.log(\`Hello, my name is \${this.name}\`);
  },
};

// Array
const numbers = [1, 2, 3, 4, 5];

// Class
class Animal {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }
  speak() {
    console.log(\`\${this.name} makes a noise.\`);
  }
}

// Inheritance
class Dog extends Animal {
  constructor(name) {
    super(name, "dog");
  }
  speak() {
    console.log(\`\${this.name} barks.\`);
  }
}

// Conditionals
if (isRunning) {
  console.log("The program is running...");
} else {
  console.log("The program has stopped.");
}

// Loop
for (let i = 0; i < numbers.length; i++) {
  console.log(\`Number at index \${i}: \${numbers[i]}\`);
}

// Try-catch
try {
  console.log(calculateArea(-1));
} catch (error) {
  console.error(error.message);
}

// Using the Object
user.greet();

// Using the Class
const myDog = new Dog("Buddy");
myDog.speak();
`);
  const [output, setOutput] = useState('');
  const [worker, setWorker] = useState(null);
  const [timeoutId, setTimeoutId] = useState(null);

  const [tabs, setTabs] = useState([
    { id: 1, name: 'Tab 1', code: '' },
    { id: 2, name: 'Tab 2', code: '' },
    { id: 3, name: 'Tab 3', code: '' }
  ]);
  const [activeTab, setActiveTab] = useState(1);

  const editorRef = useRef(null);
  const outputRef = useRef(null);

  useEffect(() => {
    const newWorker = new Worker(
      new URL('./utilities/worker.utilities.js', import.meta.url)
    );
    setWorker(newWorker);

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

  const addTab = () => {
    const newTab = {
      id: tabs.length + 1,
      name: `Tab ${tabs.length + 1}`,
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
        <div className="flex flex-nowrap px-2 h-10 whitespace-nowrap overflow-x-auto scrollbar-hidden text-neutral-600">
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
                className="group flex items-center justify-center px-2 rounded-t-lg"
              >
                <div className="px-2 rounded-lg group-hover:text-neutral-500 group-hover:bg-[#1b212b] transition-colors">
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
        <div className="w-[60vw] h-screen">
          <Editor
            theme="github-dark-theme"
            defaultLanguage="javascript"
            value={code}
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
          className="py-5 px-4 w-[40vw] h-screen leading-[1.36] text-[14px] overflow-y-auto text-neutral-300"
          onScroll={handleScrollOutput}
        >
          <pre className="pb-[calc(100vh-42px)]">{output}</pre>
        </div>
      </div>
    </div>
  );
};

export default App;
