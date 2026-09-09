import PropTypes from 'prop-types';
import { useCallback, useState } from 'react';
import { VscChevronRight, VscChevronDown } from 'react-icons/vsc';

/**
 * Renders one serialized value node.
 *
 * The output pane used to be a single <pre> holding JSON.stringify text, so
 * every object was a wall of indented JSON and types that JSON cannot express
 * were simply lost. Nodes now carry their type, so each one can be rendered as
 * itself and containers can be collapsed.
 *
 * Colours follow the editor theme in src/utilities/theme.utilities.js so a
 * value reads the same on both sides of the pane.
 */

const TONE = {
  string: 'text-str',
  number: 'text-num',
  keyword: 'text-kw',
  muted: 'text-muted',
  fn: 'text-fn',
  ctor: 'text-ctor',
  key: 'text-key'
};

/** Containers small enough to read on one line are not worth collapsing. */
const INLINE_LIMIT = 6;

const isPrimitive = node =>
  node &&
  ['string', 'number', 'boolean', 'undefined', 'null', 'bigint', 'symbol'].includes(
    node.t
  );

const childNodes = node => {
  switch (node?.t) {
    case 'array':
    case 'set':
    case 'typedarray':
      return node.items || [];
    case 'object':
      return (node.entries || []).map(([, value]) => value);
    case 'map':
      return (node.entries || []).flat();
    default:
      return [];
  }
};

const isContainer = node =>
  ['array', 'object', 'map', 'set', 'typedarray', 'error'].includes(node?.t);

const fitsInline = node => {
  if (!isContainer(node) || node.t === 'error') return false;
  if (node.truncated) return false;
  const children = childNodes(node);
  return children.length <= INLINE_LIMIT && children.every(isPrimitive);
};

/** Type-and-size label for a container. */
const summary = node => {
  switch (node.t) {
    case 'array':
      return `Array(${node.length})`;
    case 'typedarray':
      return `${node.ctor}(${node.length})`;
    case 'map':
      return `Map(${node.size})`;
    case 'set':
      return `Set(${node.size})`;
    case 'object':
      return node.ctor ? `${node.ctor} {…}` : '{…}';
    default:
      return '…';
  }
};

/** How many entries a collapsed preview shows before trailing off. */
const PREVIEW_LIMIT = 5;

/**
 * A nested value as it appears inside a collapsed parent's preview: one level
 * only, so a container becomes its label rather than recursing.
 */
const Shallow = ({ node }) => {
  if (isPrimitive(node)) return <Primitive node={node} />;
  if (isContainer(node) && node.t !== 'error') {
    return <span className={TONE.ctor}>{summary(node)}</span>;
  }
  return <Leaf node={node} />;
};

Shallow.propTypes = { node: PropTypes.object.isRequired };

/**
 * One-line preview of a collapsed container.
 *
 * Showing only `{…}` hides the very thing the pane exists to show, so the
 * header previews the first few entries the way a devtools console does.
 */
const Preview = ({ node }) => {
  let items;
  if (node.t === 'object') {
    items = node.entries.slice(0, PREVIEW_LIMIT).map(([key, value]) => (
      <span key={key}>
        <Key label={key} />
        <span className={TONE.muted}>: </span>
        <Shallow node={value} />
      </span>
    ));
  } else if (node.t === 'map') {
    items = node.entries.slice(0, PREVIEW_LIMIT).map(([key, value], index) => (
      <span key={index}>
        <Shallow node={key} />
        <span className={TONE.muted}> {'=>'} </span>
        <Shallow node={value} />
      </span>
    ));
  } else {
    items = (node.items || [])
      .slice(0, PREVIEW_LIMIT)
      .map((value, index) => <Shallow key={index} node={value} />);
  }

  const total =
    node.t === 'object' || node.t === 'map'
      ? node.entries.length
      : (node.items || []).length;
  const open = node.t === 'array' || node.t === 'typedarray' ? '[' : '{';
  const close = node.t === 'array' || node.t === 'typedarray' ? ']' : '}';

  return (
    <span>
      {(node.t === 'map' || node.t === 'set' || node.ctor) && (
        <span className={TONE.ctor}>
          {node.t === 'object' ? node.ctor : summary(node)}{' '}
        </span>
      )}
      <span className={TONE.muted}>{open}</span>
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 && <span className={TONE.muted}>, </span>}
          {item}
        </span>
      ))}
      {total > PREVIEW_LIMIT && <span className={TONE.muted}>, …</span>}
      <span className={TONE.muted}>{close}</span>
    </span>
  );
};

Preview.propTypes = { node: PropTypes.object.isRequired };

const Primitive = ({ node, top }) => {
  switch (node.t) {
    case 'string':
      // A top-level string prints bare, the way a console does. The old
      // formatter wrapped every string in quotes, so console.log('hi')
      // rendered as "hi".
      return (
        <span className={TONE.string}>
          {top ? node.v : JSON.stringify(node.v)}
          {node.truncated && (
            <span className={TONE.muted}>
              {` … ${node.length - node.v.length} more chars`}
            </span>
          )}
        </span>
      );
    case 'number':
      return <span className={TONE.number}>{node.special ?? String(node.v)}</span>;
    case 'bigint':
      return <span className={TONE.number}>{`${node.v}n`}</span>;
    case 'boolean':
      return <span className={TONE.keyword}>{String(node.v)}</span>;
    case 'undefined':
      return <span className={TONE.muted}>undefined</span>;
    case 'null':
      return <span className={TONE.keyword}>null</span>;
    case 'symbol':
      return <span className={TONE.keyword}>{node.v}</span>;
    default:
      return null;
  }
};

Primitive.propTypes = {
  node: PropTypes.object.isRequired,
  top: PropTypes.bool
};

const Leaf = ({ node, top }) => {
  if (isPrimitive(node)) return <Primitive node={node} top={top} />;

  switch (node.t) {
    case 'function':
      return (
        <span className={TONE.fn}>
          {node.kind === 'class' ? 'class ' : 'ƒ '}
          {node.name || '(anonymous)'}
        </span>
      );
    case 'date':
      return (
        <span className={TONE.ctor}>
          {node.invalid ? 'Invalid Date' : node.v}
        </span>
      );
    case 'regexp':
      return <span className={TONE.keyword}>{node.v}</span>;
    case 'promise':
      return <span className={TONE.ctor}>Promise</span>;
    case 'opaque':
      return <span className={TONE.ctor}>{node.ctor}</span>;
    case 'ref':
      return <span className={TONE.muted}>{`[Circular → ${node.label}]`}</span>;
    case 'getter':
      return <span className={TONE.muted}>(…)</span>;
    case 'unknown':
      return <span className={TONE.muted}>(unserializable)</span>;
    default:
      return null;
  }
};

Leaf.propTypes = {
  node: PropTypes.object.isRequired,
  top: PropTypes.bool
};

const Key = ({ label }) => {
  const symbolKey = label.startsWith('Symbol(');
  return (
    <span className={`${TONE.key} ${symbolKey ? 'italic' : ''}`}>{label}</span>
  );
};

Key.propTypes = { label: PropTypes.string.isRequired };

const Rows = ({ node, onExpand }) => {
  if (node.t === 'array' || node.t === 'typedarray') {
    return (
      <>
        {node.items.map((item, index) => (
          <div key={index} className="pl-4">
            <Key label={String(index)} />
            <span className={TONE.muted}>: </span>
            <ValueNode node={item} onExpand={onExpand} />
          </div>
        ))}
        {(node.extra || []).map(([key, value]) => (
          <div key={`x-${key}`} className="pl-4">
            <Key label={key} />
            <span className={TONE.muted}>: </span>
            <ValueNode node={value} onExpand={onExpand} />
          </div>
        ))}
      </>
    );
  }

  if (node.t === 'set') {
    return node.items.map((item, index) => (
      <div key={index} className="pl-4">
        <ValueNode node={item} onExpand={onExpand} />
      </div>
    ));
  }

  if (node.t === 'map') {
    return node.entries.map(([key, value], index) => (
      <div key={index} className="pl-4">
        <ValueNode node={key} onExpand={onExpand} />
        <span className={TONE.muted}> {'=>'} </span>
        <ValueNode node={value} onExpand={onExpand} />
      </div>
    ));
  }

  return (node.entries || []).map(([key, value]) => (
    <div key={key} className="pl-4">
      <Key label={key} />
      <span className={TONE.muted}>: </span>
      <ValueNode node={value} onExpand={onExpand} />
    </div>
  ));
};

Rows.propTypes = {
  node: PropTypes.object.isRequired,
  onExpand: PropTypes.func
};

const Inline = ({ node, onExpand }) => {
  const open = node.t === 'array' || node.t === 'typedarray' ? '[' : '{';
  const close = node.t === 'array' || node.t === 'typedarray' ? ']' : '}';

  if (node.t === 'set' || node.t === 'map') {
    return (
      <span>
        <span className={TONE.ctor}>{summary(node)}</span>
        <span className={TONE.muted}> {'{'}</span>
        {node.t === 'set'
          ? node.items.map((item, index) => (
              <span key={index}>
                {index > 0 && <span className={TONE.muted}>, </span>}
                <ValueNode node={item} onExpand={onExpand} />
              </span>
            ))
          : node.entries.map(([key, value], index) => (
              <span key={index}>
                {index > 0 && <span className={TONE.muted}>, </span>}
                <ValueNode node={key} onExpand={onExpand} />
                <span className={TONE.muted}> {'=>'} </span>
                <ValueNode node={value} onExpand={onExpand} />
              </span>
            ))}
        <span className={TONE.muted}>{'}'}</span>
      </span>
    );
  }

  const items =
    node.t === 'object'
      ? node.entries
      : node.items.map((value, index) => [String(index), value]);

  return (
    <span>
      {node.ctor && <span className={TONE.ctor}>{node.ctor} </span>}
      <span className={TONE.muted}>{open}</span>
      {items.map(([key, value], index) => (
        <span key={key}>
          {index > 0 && <span className={TONE.muted}>, </span>}
          {node.t === 'object' && (
            <>
              <Key label={key} />
              <span className={TONE.muted}>: </span>
            </>
          )}
          <ValueNode node={value} onExpand={onExpand} />
        </span>
      ))}
      <span className={TONE.muted}>{close}</span>
    </span>
  );
};

Inline.propTypes = {
  node: PropTypes.object.isRequired,
  onExpand: PropTypes.func
};

export const ValueNode = ({ node, onExpand, top = false, forceOpen = false }) => {
  const [open, setOpen] = useState(forceOpen);
  const [loaded, setLoaded] = useState(null);
  const [loading, setLoading] = useState(false);

  const resolved = loaded || node;

  /**
   * A node cut off by the depth or item budget only holds a label. Opening it
   * asks the worker to serialize one more level from its own registry.
   */
  const request = useCallback(async () => {
    if (loaded || loading || !onExpand || node.id === undefined) return;
    setLoading(true);
    const deeper = await onExpand(node.id);
    setLoading(false);
    if (deeper) setLoaded(deeper);
  }, [loaded, loading, onExpand, node.id]);

  if (!node) return null;

  if (node.t === 'deep') {
    return (
      <button
        className={`${TONE.ctor} hover:underline`}
        onClick={request}
        title="Load this value"
      >
        {loading ? 'loading…' : `${node.label} {…}`}
      </button>
    );
  }

  if (node.t === 'error') {
    return (
      <span>
        <span className="text-danger">{`${node.name}: ${node.message}`}</span>
      </span>
    );
  }

  if (!isContainer(resolved)) return <Leaf node={resolved} top={top} />;

  if (fitsInline(resolved) && !forceOpen) {
    return <Inline node={resolved} onExpand={onExpand} />;
  }

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && resolved.truncated) request();
  };

  return (
    <span className="inline-block align-top">
      <button
        className="inline-flex items-start gap-0.5 text-left hover:text-ink-strong"
        onClick={toggle}
        aria-expanded={open}
      >
        <span className={`mt-0.5 shrink-0 ${TONE.muted}`}>
          {open ? <VscChevronDown size={12} /> : <VscChevronRight size={12} />}
        </span>
        {open ? (
          <span className={TONE.ctor}>{summary(resolved)}</span>
        ) : (
          <Preview node={resolved} />
        )}
      </button>
      {open && (
        <span className="block">
          <Rows node={resolved} onExpand={onExpand} />
          {resolved.truncated && (
            <div className={`pl-4 ${TONE.muted}`}>
              {loading ? 'loading…' : '… truncated'}
            </div>
          )}
        </span>
      )}
    </span>
  );
};

ValueNode.propTypes = {
  node: PropTypes.object,
  onExpand: PropTypes.func,
  top: PropTypes.bool,
  forceOpen: PropTypes.bool
};
