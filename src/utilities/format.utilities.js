/**
 * Code formatting, via Prettier's browser build.
 *
 * Loaded on demand: it is only needed when the user actually asks to format,
 * so it stays out of the startup bundle. Parsers are chosen per language,
 * since the babel parser cannot read type annotations.
 */

const PARSER = {
  javascript: 'babel',
  jsx: 'babel',
  typescript: 'typescript',
  tsx: 'typescript'
};

let loaded = null;

const load = async () => {
  if (loaded) return loaded;
  loaded = (async () => {
    const [prettier, babel, estree, typescript] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
      import('prettier/plugins/typescript')
    ]);
    return {
      format: prettier.format,
      plugins: [babel.default ?? babel, estree.default ?? estree, typescript.default ?? typescript]
    };
  })();
  return loaded;
};

/**
 * @returns {{ ok: true, code: string } | { ok: false, error: string }}
 */
export const formatCode = async (code, language, options = {}) => {
  if (!code.trim()) return { ok: true, code };

  try {
    const prettier = await load();
    const formatted = await prettier.format(code, {
      parser: PARSER[language] ?? 'babel',
      plugins: prettier.plugins,
      singleQuote: true,
      arrowParens: 'avoid',
      trailingComma: 'none',
      tabWidth: options.tabSize ?? 2,
      printWidth: options.printWidth ?? 80
    });
    return { ok: true, code: formatted };
  } catch (error) {
    // Formatting half-written code is normal in a scratchpad, so a parse
    // failure is reported rather than treated as a fault.
    return {
      ok: false,
      error: String(error?.message || error).split('\n')[0]
    };
  }
};
