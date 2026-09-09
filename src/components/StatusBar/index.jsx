import PropTypes from 'prop-types';
import {
  VscSettingsGear,
  VscDebugStop,
  VscPlay,
  VscTrash,
  VscCircleFilled,
  VscSymbolEvent
} from 'react-icons/vsc';
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

/** Appends a keyboard hint only when the command actually has a binding. */
const withHint = (text, hint) => (hint ? `${text} (${hint})` : text);

export const StatusBar = ({
  status,
  duration,
  entryCount,
  autoRun,
  language,
  languages,
  runtime,
  runtimes,
  transpiler,
  onLanguageChange,
  onRuntimeChange,
  hints = {},
  onToggleAutoRun,
  onRun,
  onStop,
  onClear,
  onOpenPalette,
  onOpenSettings
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

    {/* The compiler is loaded on demand, so its state belongs next to the
        language it applies to rather than in a dialog. */}
    {language !== 'javascript' && transpiler?.status === 'loading' && (
      <span className="text-[#e3b341]">compiler loading…</span>
    )}
    {language !== 'javascript' && transpiler?.status === 'error' && (
      <span className="text-[#ff7b72]" title={transpiler.message}>
        compiler unavailable
      </span>
    )}

    <div className="ml-auto flex items-center gap-1">
      {/* Node mode is visually distinct because it is the one setting that
          changes what the code being run is allowed to do. */}
      <select
        className={`rounded bg-transparent px-1 py-0.5 text-[12px] outline-none hover:bg-[#2d3641] ${
          runtime === 'node' ? 'text-[#e3b341]' : 'text-[#9198A1]'
        }`}
        value={runtime}
        onChange={event => onRuntimeChange(event.target.value)}
        title={
          runtime === 'node'
            ? 'Node mode: real require, built-in modules and installed packages'
            : 'Browser mode: a sandboxed worker'
        }
        aria-label="Runtime for this tab"
      >
        {runtimes.map(option => (
          <option key={option} value={option} className="bg-[#1b212b]">
            {option}
          </option>
        ))}
      </select>

      <select
        className="rounded bg-transparent px-1 py-0.5 text-[12px] text-[#9198A1] outline-none hover:bg-[#2d3641]"
        value={language}
        onChange={event => onLanguageChange(event.target.value)}
        title="Language for this tab"
        aria-label="Language for this tab"
      >
        {languages.map(option => (
          <option key={option} value={option} className="bg-[#1b212b]">
            {option}
          </option>
        ))}
      </select>

      <button
        className={`flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641] ${
          autoRun ? 'text-[#3fb950]' : ''
        }`}
        onClick={onToggleAutoRun}
        title={
          autoRun
            ? 'Auto-run is on: code runs as you type'
            : withHint('Auto-run is off: run manually', hints.run)
        }
      >
        {autoRun ? 'auto' : 'manual'}
      </button>

      <button
        className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641]"
        onClick={onRun}
        title={withHint('Run now', hints.run)}
      >
        <VscPlay size={12} />
        Run
      </button>

      <button
        className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641] disabled:opacity-40"
        onClick={onStop}
        disabled={status !== STATUS.RUNNING}
        title={withHint(
          'Terminate the worker, the only way to stop a synchronous loop',
          hints.stop
        )}
      >
        <VscDebugStop size={12} />
        Stop
      </button>

      <button
        className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641]"
        onClick={onClear}
        title={withHint('Clear output', hints.clear)}
      >
        <VscTrash size={12} />
        Clear
      </button>

      <button
        className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641]"
        onClick={onOpenPalette}
        title={withHint('Command palette', hints.palette)}
      >
        <VscSymbolEvent size={12} />
        Commands
      </button>

      <button
        className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-[#2d3641]"
        onClick={onOpenSettings}
        title={withHint('Settings', hints.settings)}
        aria-label="Settings"
      >
        <VscSettingsGear size={12} />
      </button>
    </div>
  </div>
);

StatusBar.propTypes = {
  status: PropTypes.string.isRequired,
  duration: PropTypes.number,
  entryCount: PropTypes.number.isRequired,
  autoRun: PropTypes.bool.isRequired,
  language: PropTypes.string.isRequired,
  languages: PropTypes.arrayOf(PropTypes.string).isRequired,
  runtime: PropTypes.string.isRequired,
  runtimes: PropTypes.arrayOf(PropTypes.string).isRequired,
  transpiler: PropTypes.shape({
    status: PropTypes.string,
    message: PropTypes.string
  }),
  onLanguageChange: PropTypes.func.isRequired,
  onRuntimeChange: PropTypes.func.isRequired,
  hints: PropTypes.objectOf(PropTypes.string),
  onToggleAutoRun: PropTypes.func.isRequired,
  onRun: PropTypes.func.isRequired,
  onStop: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  onOpenPalette: PropTypes.func.isRequired,
  onOpenSettings: PropTypes.func.isRequired
};
