import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
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

  useEffect(() => {
    const newWorker = new Worker(
      new URL('./utilities/codeWorker.js', import.meta.url)
    );
    setWorker(newWorker);

    return () => {
      newWorker.terminate();
    };
  }, []);

  useEffect(() => {
    console.log(output);
  }, [output]);

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
    console.log('x');
    monaco.editor.defineTheme('github-dark-theme', githubDarkTheme);
  };

  return (
    <div className="flex">
      <div className="w-[100vw] h-screen">
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
        />
      </div>
      {/* <div className="w-[40vw] h-screen">
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
      </div> */}
    </div>
  );
};

export default App;
