import PropTypes from 'prop-types';
import { VscDebugStop, VscPlay, VscTrash, VscCircleFilled } from 'react-icons/vsc';
import { STATUS } from '../../hooks/useRunner.hook';

/**
 * Run state and controls.
 *
 * There was previously no way to tell whether code was running, how long it
 * took, or to stop it. A `while (true)` in the editor pinned a core
 * indefinitely while the pane kept displaying the previous run's output, with
 * nothing on screen to suggest anything was wrong.
 */

const LABEL = {
  [STATUS.STARTING]: 'Starting…',
  [STATUS.IDLE]: 'Ready',
  [STATUS.RUNNING]: 'Running…',
  [STATUS.SETTLED]: 'Done',
  [STATUS.TIMEOUT]: 'Stopped'
};

const TONE = {
  [STATUS.STARTING]: 'text-[#9198A1]',
  [STATUS.IDLE]: 'text-[#9198A1]',
  [STATUS.RUNNING]: 'text-[#e3b341]',
  [STATUS.SETTLED]: 'text-[#3fb950]',
  [STATUS.TIMEOUT]: 'text-[#ff7b72]'
};

export const StatusBar = ({
  status,
  duration,
  entryCount,
  autoRun,
  onToggleAutoRun,
  onRun,
  onStop,
  onClear
}) => (
  <div className="flex h-6 shrink-0 items-center gap-3 border-t border-[#2d3641] bg-[#14181f] px-3 text-[12px] text-[#9198A1] select-none">
    <span className={`flex items-center gap-1 ${TONE[status] ?? ''}`}>
      <VscCircleFilled size={8} />
      {LABEL[status] ?? status}
    </span>

    {duration !== null && status !== STATUS.RUNNING && (
      <span title="Time spent evaluating the top-level body">
        {duration < 1
          ? '<1 ms'
          : `${duration < 1000 ? Math.round(duration) + ' ms' : (duration / 1000).toFixed(2) + ' s'}`}
      </span>
    )}

    <span>{`${entryCount} ${entryCount === 1 ? 'entry' : 'entries'}`}</span>

    <div className="ml-auto flex items-center gap-1">
      <button
        className={`flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641] ${
          autoRun ? 'text-[#3fb950]' : ''
        }`}
        onClick={onToggleAutoRun}
        title={
          autoRun
            ? 'Auto-run is on: code runs as you type'
            : 'Auto-run is off: run manually with Ctrl+Enter'
        }
      >
        {autoRun ? 'auto' : 'manual'}
      </button>

      <button
        className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641]"
        onClick={onRun}
        title="Run now (Ctrl+Enter)"
      >
        <VscPlay size={12} />
        Run
      </button>

      <button
        className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641] disabled:opacity-40"
        onClick={onStop}
        disabled={status !== STATUS.RUNNING}
        title="Terminate the worker (the only way to stop a synchronous loop)"
      >
        <VscDebugStop size={12} />
        Stop
      </button>

      <button
        className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641]"
        onClick={onClear}
        title="Clear output (Ctrl+K)"
      >
        <VscTrash size={12} />
        Clear
      </button>
    </div>
  </div>
);

StatusBar.propTypes = {
  status: PropTypes.string.isRequired,
  duration: PropTypes.number,
  entryCount: PropTypes.number.isRequired,
  autoRun: PropTypes.bool.isRequired,
  onToggleAutoRun: PropTypes.func.isRequired,
  onRun: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired
};
