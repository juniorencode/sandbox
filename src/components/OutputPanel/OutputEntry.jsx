import PropTypes from 'prop-types';
import { VscChevronRight, VscChevronDown, VscHistory } from 'react-icons/vsc';
import { LOG, GROUP, TABLE, ERROR, PHASE_COMPILE, PHASE_TIMEOUT } from '../../runtime/protocol.js';
import { ValueNode } from '../ValueInspector';

/**
 * One streamed console entry.
 *
 * Levels are styled distinctly: the old runner aliased debug, info, warn and
 * error straight to log, so a warning and a plain message were indistinguishable
 * in the pane.
 */

const LEVEL_STYLE = {
  log: '',
  info: 'text-info',
  debug: 'text-muted',
  warn: 'bg-warn-soft text-warn -mx-4 px-4 border-l-2 border-warn',
  error: 'bg-danger-soft text-danger -mx-4 px-4 border-l-2 border-danger',
  trace: 'text-muted'
};

const PHASE_LABEL = {
  [PHASE_COMPILE]: 'Syntax error',
  [PHASE_TIMEOUT]: 'Timed out'
};

const Table = ({ entry }) => (
  <div className="my-1 overflow-x-auto">
    <table className="border-collapse text-[13px]">
      <thead>
        <tr>
          <th className="border border-line px-2 py-0.5 text-left text-muted font-normal">
            (index)
          </th>
          {entry.columns.map(column => (
            <th
              key={column}
              className="border border-line px-2 py-0.5 text-left text-muted font-normal"
            >
              {column}
            </th>
          ))}
          {entry.hasValueColumn && (
            <th className="border border-line px-2 py-0.5 text-left text-muted font-normal">
              Value
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {entry.rows.map(row => (
          <tr key={row.key}>
            <td className="border border-line px-2 py-0.5 text-muted">
              {row.key}
            </td>
            {entry.columns.map(column => (
              <td key={column} className="border border-line px-2 py-0.5">
                {row.cells[column] ? <ValueNode node={row.cells[column]} /> : ''}
              </td>
            ))}
            {entry.hasValueColumn && (
              <td className="border border-line px-2 py-0.5">
                {row.value ? <ValueNode node={row.value} /> : ''}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

Table.propTypes = { entry: PropTypes.object.isRequired };

/**
 * A failure, with its location.
 *
 * Errors used to be appended to the end of the output as
 * `Error: <message>` with no line, no column and no stack, so a throw on line
 * 2 of a 40-line file was reported at the bottom of the pane.
 */
const Failure = ({ entry, onReveal }) => (
  <div className="my-0.5 -mx-4 px-4 py-1 bg-danger-soft border-l-2 border-danger">
    <div className="text-danger">
      {PHASE_LABEL[entry.phase] && (
        <span className="text-muted">{`${PHASE_LABEL[entry.phase]}: `}</span>
      )}
      {`${entry.name}: ${entry.message}`}
    </div>
    {!!entry.frames?.length && (
      <div className="mt-0.5 text-[12px] text-muted">
        {entry.frames.map((frame, index) => (
          <button
            key={index}
            className="block hover:underline"
            onClick={() => onReveal?.(frame.line)}
            title="Go to line"
          >
            {`at ${frame.name} (line ${frame.line}:${frame.column})`}
          </button>
        ))}
      </div>
    )}
  </div>
);

Failure.propTypes = {
  entry: PropTypes.object.isRequired,
  onReveal: PropTypes.func
};

export const OutputEntry = ({ entry, collapsed, onToggleGroup, onExpand, onReveal }) => {
  const indent = { paddingLeft: `${(entry.group ?? 0) * 12}px` };

  if (entry.t === ERROR) {
    return (
      <div style={indent}>
        <Failure entry={entry} onReveal={onReveal} />
      </div>
    );
  }

  if (entry.t === TABLE) {
    return (
      <div style={indent}>
        <Table entry={entry} />
      </div>
    );
  }

  if (entry.t === GROUP) {
    return (
      <button
        className="flex items-center gap-1 font-semibold text-ink hover:text-white"
        style={indent}
        onClick={() => onToggleGroup(entry.entryId)}
        aria-expanded={!collapsed}
      >
        {collapsed ? (
          <VscChevronRight size={12} />
        ) : (
          <VscChevronDown size={12} />
        )}
        {entry.values.map((value, index) => (
          <ValueNode key={index} node={value} top />
        ))}
      </button>
    );
  }

  if (entry.t !== LOG) return null;

  return (
    <div
      className={`flex flex-wrap items-start gap-x-2 ${LEVEL_STYLE[entry.level] ?? ''}`}
      style={indent}
    >
      {/* Output produced after the body settled came from a timer or a promise
          callback, so its position relative to synchronous output is not
          chronological. The marker makes that explicit. */}
      {entry.late && (
        <span
          className="mt-0.5 text-muted shrink-0"
          title="Logged asynchronously, after the run settled"
        >
          <VscHistory size={12} />
        </span>
      )}
      {entry.values.map((value, index) => (
        <ValueNode
          key={index}
          node={value}
          onExpand={onExpand}
          top={!entry.dir}
          forceOpen={!!entry.dir}
        />
      ))}
      {entry.assertion && !entry.values.length && (
        <span className="text-danger">Assertion failed</span>
      )}
    </div>
  );
};

OutputEntry.propTypes = {
  entry: PropTypes.object.isRequired,
  collapsed: PropTypes.bool,
  onToggleGroup: PropTypes.func.isRequired,
  onExpand: PropTypes.func,
  onReveal: PropTypes.func
};
