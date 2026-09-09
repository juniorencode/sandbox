import { Parser } from 'acorn';
import * as walk from 'acorn-walk';
// Named rather than default: bundling this module to CJS for the Node-mode
// runtime makes the interop resolve the default to the namespace object, and
// `new MagicString(...)` then fails with "not a constructor".
import { MagicString } from 'magic-string';

/**
 * Source-to-source transform applied before the code is evaluated.
 *
 * It replaces the old approach of recovering the source line by parsing
 * `new Error().stack` inside console.log. That parse was engine specific (it
 * filtered stack frames by the literal string 'anonymous'), carried a magic
 * `- 2` offset for the Function wrapper, and had no guards: a stack shape it
 * did not expect made it throw *inside* the logger, where the surrounding
 * try/catch reported it as the user's own error. User code could also disable
 * it outright with `Error.stackTraceLimit = 0`.
 *
 * Baking the location into the call site at parse time is deterministic,
 * survives async callbacks and loops, and cannot be broken by the code being
 * run. When parsing fails we hand back the syntax error with acorn's precise
 * line and column, which the stack-based version never had.
 */

const PARSE_OPTIONS = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  allowAwaitOutsideFunction: true,
  allowReturnOutsideFunction: true,
  allowHashBang: true,
  locations: true,
  ranges: true
};

/** Every binding name introduced by a destructuring or simple pattern. */
const patternNames = (node, out = []) => {
  if (!node) return out;
  switch (node.type) {
    case 'Identifier':
      out.push(node.name);
      break;
    case 'ObjectPattern':
      node.properties.forEach(prop =>
        patternNames(prop.type === 'RestElement' ? prop.argument : prop.value, out)
      );
      break;
    case 'ArrayPattern':
      node.elements.forEach(el => patternNames(el, out));
      break;
    case 'AssignmentPattern':
      patternNames(node.left, out);
      break;
    case 'RestElement':
      patternNames(node.argument, out);
      break;
    default:
      break;
  }
  return out;
};

/**
 * True when the program declares its own `console` anywhere.
 *
 * Proper scope analysis would let us rewrite the call sites that still refer
 * to the global, but a scratchpad that shadows console is vanishingly rare and
 * silently rewriting the wrong binding would be much worse than falling back
 * to an unlocated console. So this is deliberately conservative: one shadowing
 * declaration anywhere disables the rewrite for the whole program.
 */
const shadowsConsole = ast => {
  let shadowed = false;
  walk.full(ast, node => {
    if (shadowed) return;
    switch (node.type) {
      case 'VariableDeclarator':
        if (patternNames(node.id).includes('console')) shadowed = true;
        break;
      case 'ClassDeclaration':
        if (node.id?.name === 'console') shadowed = true;
        break;
      // All three carry `params`; class and object methods reach us as the
      // FunctionExpression in their `value`, so this covers every parameter
      // list in the program.
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (
          node.id?.name === 'console' ||
          node.params.some(param => patternNames(param).includes('console'))
        ) {
          shadowed = true;
        }
        break;
      case 'ImportSpecifier':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
        if (node.local?.name === 'console') shadowed = true;
        break;
      case 'CatchClause':
        if (node.param && patternNames(node.param).includes('console')) {
          shadowed = true;
        }
        break;
      default:
        break;
    }
  });
  return shadowed;
};

/** `console` identifier acting as the receiver of a called member. */
const consoleReceiver = node => {
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression') return null;
  const object = callee.object;
  if (object?.type !== 'Identifier' || object.name !== 'console') return null;
  return object;
};

/**
 * Rewrites a static import into an awaited dynamic import.
 *
 * The body is evaluated through AsyncFunction, which rejects `import`
 * statements outright, so the previous runner could not load a module at all
 * despite the README claiming ES module support. Specifiers are handed to
 * `__sbx.resolve` at runtime rather than resolved here, which keeps the
 * transform independent of where modules actually come from.
 *
 * Static imports are hoisted by the real module system and these declarations
 * are not, so code that uses a binding above its own import statement will
 * now fail where a real module would have worked. Imports at the top, which is
 * what a scratchpad writes, behave identically.
 */
const importReplacement = node => {
  const source = JSON.stringify(node.source.value);
  const request = `await import(__sbx.resolve(${source}))`;

  if (!node.specifiers.length) return `${request};`;

  const namespace = node.specifiers.find(
    spec => spec.type === 'ImportNamespaceSpecifier'
  );
  const named = node.specifiers.filter(spec => spec.type === 'ImportSpecifier');
  const fallback = node.specifiers.find(
    spec => spec.type === 'ImportDefaultSpecifier'
  );

  // `import d, * as ns from 'x'` needs the namespace bound separately.
  if (namespace) {
    const statements = [`const ${namespace.local.name} = ${request};`];
    if (fallback) {
      statements.push(
        `const ${fallback.local.name} = ${namespace.local.name}.default;`
      );
    }
    return statements.join(' ');
  }

  const bindings = [];
  if (fallback) bindings.push(`default: ${fallback.local.name}`);
  named.forEach(spec => {
    const imported =
      spec.imported.type === 'Identifier'
        ? spec.imported.name
        : JSON.stringify(spec.imported.value);
    bindings.push(
      imported === spec.local.name ? imported : `${imported}: ${spec.local.name}`
    );
  });

  return `const { ${bindings.join(', ')} } = ${request};`;
};

/**
 * @param source the code to transform
 * @param options.mapper maps a position in `source` back to the position the
 *   user wrote, for sources that have already been through a transpiler. JSX
 *   in particular does not preserve line positions, so without this a console
 *   call in a .tsx tab would be reported against the generated text.
 * @returns {{ code: string, located: boolean, error: null |
 *   { message: string, line: number, column: number } }}
 */
export const instrument = (source, { mapper } = {}) => {
  if (!source.trim()) return { code: source, located: false, error: null };

  const locateOriginal = (line, column) => {
    if (!mapper) return { line, column };
    return mapper.lookup(line, column) ?? { line, column };
  };

  let ast;
  try {
    ast = Parser.parse(source, PARSE_OPTIONS);
  } catch (error) {
    const at = locateOriginal(error.loc?.line ?? 1, (error.loc?.column ?? 0) + 1);
    return {
      code: source,
      located: false,
      error: {
        message: error.message?.replace(/\s*\(\d+:\d+\)\s*$/, '') || 'Syntax error',
        line: at.line,
        column: at.column
      }
    };
  }

  const out = new MagicString(source);
  const locate = !shadowsConsole(ast);
  let located = false;

  walk.full(ast, node => {
    switch (node.type) {
      case 'CallExpression': {
        if (!locate) break;
        const receiver = consoleReceiver(node);
        if (!receiver) break;
        const original = locateOriginal(
          node.loc.start.line,
          node.loc.start.column + 1
        );
        out.overwrite(
          receiver.start,
          receiver.end,
          `__sbx.at(${original.line},${original.column})`
        );
        located = true;
        break;
      }

      // `export` is meaningless inside a function body and is a syntax error
      // there, so the keyword is removed while the declaration is kept.
      case 'ExportNamedDeclaration':
        if (node.declaration) {
          out.remove(node.start, node.declaration.start);
        } else {
          out.remove(node.start, node.end);
        }
        break;

      case 'ExportDefaultDeclaration': {
        const declaration = node.declaration;
        const named =
          (declaration.type === 'FunctionDeclaration' ||
            declaration.type === 'ClassDeclaration') &&
          declaration.id;
        out.overwrite(
          node.start,
          declaration.start,
          named ? '' : 'const __sbxDefault = '
        );
        break;
      }

      case 'ExportAllDeclaration':
        out.remove(node.start, node.end);
        break;

      case 'ImportDeclaration':
        out.overwrite(node.start, node.end, importReplacement(node));
        break;

      default:
        break;
    }
  });

  return { code: out.toString(), located, error: null };
};
