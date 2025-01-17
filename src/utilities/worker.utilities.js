self.onmessage = e => {
  const code = e.data;
  let outputData = '';

  const customConsole = {
    log: (...args) => {
      const stack = new Error().stack || '';
      const linesOutput = outputData.split('\n').length;
      const line = stack.split('\n')[2].split(':').reverse()[1] - 2;

      const formattedArgs = args
        .map(arg => {
          if (typeof arg === 'object' && arg !== null) {
            return JSON.stringify(arg, null, 2);
          }
          if (typeof arg === 'number') return arg;
          return `"${arg}"`;
        })
        .join(' ');

      if (linesOutput < line) {
        for (let i = linesOutput; i < line; i++) {
          outputData += '\n';
        }
      }

      outputData += formattedArgs + '\n';
    }
  };

  ['debug', 'info', 'warn', 'error'].forEach(method => {
    customConsole[method] = (...args) => customConsole.log(...args);
  });

  [
    'assert',
    'table',
    'clear',
    'dir',
    'dirxml',
    'group',
    'groupCollapsed',
    'groupEnd',
    'time',
    'timeEnd',
    'timeLog',
    'trace',
    'profile',
    'profileEnd',
    'count',
    'countReset'
  ].forEach(method => {
    customConsole[method] = () => {};
  });

  try {
    const func = new Function('console', code);
    func(customConsole);
  } catch (error) {
    outputData += `Error: ${error.message}\n`;
  }

  self.postMessage(outputData);
};
