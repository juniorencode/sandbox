import { useState, useEffect } from 'react';

export const useWorker = (tabs, activeTab, setOutput) => {
  const [worker, setWorker] = useState(null);

  useEffect(() => {
    const newWorker = new Worker(
      new URL('../utilities/worker.utilities.js', import.meta.url)
    );
    setWorker(newWorker);

    const code = tabs.find(tab => tab.id === activeTab)?.code || '';
    if (code !== '') {
      if (newWorker) {
        newWorker.postMessage(code);
        newWorker.onmessage = e => {
          setOutput(e.data);
        };
      }
    }

    return () => newWorker.terminate();
    // eslint-disable-next-line
  }, [tabs, activeTab]);

  const executeCode = value => {
    if (worker && value !== '') {
      worker.postMessage(value);
      worker.onmessage = e => {
        setOutput(e.data);
      };
    } else {
      setOutput('');
    }
  };

  return executeCode;
};
