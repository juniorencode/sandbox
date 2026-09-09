/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ValueNode } from '../index.jsx';

const show = (node, props) => render(<ValueNode node={node} {...props} />);

describe('ValueNode', () => {
  it('prints a top-level string bare, the way a console does', () => {
    // The old formatter wrapped every string in quotes, so console.log('hi')
    // rendered as "hi".
    show({ t: 'string', v: 'hi' }, { top: true });
    expect(screen.getByText('hi')).toBeTruthy();
    expect(screen.queryByText('"hi"')).toBeNull();
  });

  it('quotes a string nested inside a container', () => {
    show({
      t: 'object',
      id: 1,
      ctor: null,
      entries: [['name', { t: 'string', v: 'ada' }]],
      truncated: false
    });
    expect(screen.getByText('"ada"')).toBeTruthy();
  });

  it.each([
    [{ t: 'number', special: 'NaN' }, 'NaN'],
    [{ t: 'number', special: 'Infinity' }, 'Infinity'],
    [{ t: 'number', special: '-0' }, '-0'],
    [{ t: 'bigint', v: '10' }, '10n'],
    [{ t: 'undefined' }, 'undefined'],
    [{ t: 'null' }, 'null'],
    [{ t: 'boolean', v: true }, 'true'],
    [{ t: 'symbol', v: 'Symbol(s)' }, 'Symbol(s)'],
    [{ t: 'regexp', v: '/ab/g' }, '/ab/g'],
    [{ t: 'date', invalid: true }, 'Invalid Date'],
    [{ t: 'promise', id: 1 }, 'Promise'],
    [{ t: 'opaque', ctor: 'WeakMap' }, 'WeakMap'],
    [{ t: 'getter' }, '(…)']
  ])('renders %o as its own type', (node, expected) => {
    show(node);
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('marks a circular reference instead of failing', () => {
    show({ t: 'ref', id: 3, label: 'Object' });
    expect(screen.getByText('[Circular → Object]')).toBeTruthy();
  });

  it('shows a small all-primitive object inline with no toggle', () => {
    show({
      t: 'object',
      id: 1,
      ctor: null,
      entries: [
        ['a', { t: 'number', v: 1 }],
        ['b', { t: 'number', v: 2 }]
      ],
      truncated: false
    });
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('a')).toBeTruthy();
  });

  it('previews a collapsed container instead of showing only braces', () => {
    show({
      t: 'object',
      id: 1,
      ctor: null,
      truncated: false,
      entries: [
        ['name', { t: 'string', v: 'ada' }],
        ['langs', { t: 'array', id: 2, items: [], length: 2, truncated: false }]
      ]
    });
    // Nested containers appear as their label, one level only.
    expect(screen.getByText('Array(2)')).toBeTruthy();
    expect(screen.getByText('"ada"')).toBeTruthy();
  });

  it('expands a container on click', async () => {
    const user = userEvent.setup();
    show({
      t: 'array',
      id: 1,
      length: 2,
      truncated: false,
      items: [
        { t: 'object', id: 2, ctor: null, entries: [], truncated: false },
        { t: 'object', id: 3, ctor: null, entries: [], truncated: false }
      ]
    });
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Array(2)')).toBeTruthy();
  });

  it('asks the runner for a node that hit the depth budget', async () => {
    const user = userEvent.setup();
    let requested = null;
    show(
      { t: 'deep', id: 9, label: 'Object' },
      {
        onExpand: async id => {
          requested = id;
          return {
            t: 'object',
            id: 9,
            ctor: null,
            truncated: false,
            entries: [['loaded', { t: 'boolean', v: true }]]
          };
        }
      }
    );

    expect(screen.getByText('Object {…}')).toBeTruthy();
    await user.click(screen.getByRole('button'));
    expect(requested).toBe(9);
  });

  it('renders an error node with its name and message', () => {
    show({ t: 'error', id: 1, name: 'TypeError', message: 'boom', entries: [] });
    expect(screen.getByText('TypeError: boom')).toBeTruthy();
  });

  it('shows how much of a long string was cut', () => {
    show({ t: 'string', v: 'abc', truncated: true, length: 10 }, { top: true });
    expect(screen.getByText(/7 more chars/)).toBeTruthy();
  });
});
