import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { VscClose, VscTrash } from 'react-icons/vsc';
import { modules } from '../../platform';

/**
 * Settings.
 *
 * Behaviour that was previously hardcoded is exposed here: the run debounce,
 * the execution timeout, how deep values are serialised, and whether packages
 * may be downloaded. The module cache is included because it is the one piece
 * of state a user might want to inspect or reclaim.
 */

const Row = ({ label, hint, children }) => (
  <label className="flex items-start justify-between gap-6 py-2.5">
    <span className="flex-1">
      <span className="block text-ink">{label}</span>
      {hint && <span className="block text-[12px] text-muted">{hint}</span>}
    </span>
    <span className="flex shrink-0 items-center gap-2">{children}</span>
  </label>
);

Row.propTypes = {
  label: PropTypes.string.isRequired,
  hint: PropTypes.string,
  children: PropTypes.node
};

const Number_ = ({ value, min, max, step, unit, onChange }) => (
  <>
    <input
      type="number"
      className="w-24 rounded border border-line-strong bg-chrome px-2 py-1 text-right text-ink outline-none focus:border-focus"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={event => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.min(Math.max(next, min), max));
      }}
    />
    {unit && <span className="w-8 text-[12px] text-muted">{unit}</span>}
  </>
);

Number_.propTypes = {
  value: PropTypes.number.isRequired,
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  step: PropTypes.number,
  unit: PropTypes.string,
  onChange: PropTypes.func.isRequired
};

const Toggle = ({ checked, onChange }) => (
  <button
    role="switch"
    aria-checked={checked}
    className={`h-5 w-9 rounded-full transition-colors ${
      checked ? 'bg-accent' : 'bg-raised-hover'
    }`}
    onClick={() => onChange(!checked)}
  >
    <span
      className={`block h-4 w-4 rounded-full bg-white transition-transform ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`}
    />
  </button>
);

Toggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired
};

const formatBytes = bytes => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const SettingsDialog = ({ open, settings, onChange, onClose, appInfo }) => {
  const [cache, setCache] = useState(null);

  useEffect(() => {
    if (!open) return;
    modules.stats().then(setCache);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const clearCache = async () => {
    await modules.clear();
    setCache(await modules.stats());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-full w-[min(620px,95vw)] flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink-strong">Settings</h2>
          <button
            className="text-muted hover:text-ink"
            onClick={onClose}
            aria-label="Close settings"
          >
            <VscClose size={16} />
          </button>
        </div>

        <div className="divide-y divide-line-soft overflow-y-auto px-4 text-[13px]">
          <div className="py-1">
            <h3 className="pt-3 text-[11px] uppercase tracking-wide text-faint">
              Running
            </h3>
            <Row
              label="Run as you type"
              hint="Turn off to run only on demand, which matters once the code makes requests."
            >
              <Toggle
                checked={settings.autoRun}
                onChange={value => onChange({ autoRun: value })}
              />
            </Row>
            <Row
              label="Debounce"
              hint="How long to wait after the last keystroke before running."
            >
              <Number_
                value={settings.runDebounceMs}
                min={0}
                max={5000}
                step={50}
                unit="ms"
                onChange={value => onChange({ runDebounceMs: value })}
              />
            </Row>
            <Row
              label="Timeout"
              hint="Synchronous code cannot be interrupted, so the worker is terminated after this."
            >
              <Number_
                value={settings.timeoutMs}
                min={100}
                max={120000}
                step={500}
                unit="ms"
                onChange={value => onChange({ timeoutMs: value })}
              />
            </Row>
          </div>

          <div className="py-1">
            <h3 className="pt-3 text-[11px] uppercase tracking-wide text-faint">
              Appearance
            </h3>
            <Row
              label="Theme"
              hint="System follows the operating system's setting."
            >
              <select
                className="rounded border border-line-strong bg-chrome px-2 py-1 text-ink outline-none focus:border-focus"
                value={settings.theme}
                onChange={event => onChange({ theme: event.target.value })}
                aria-label="Theme"
              >
                {['system', 'dark', 'light'].map(option => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Row>
          </div>

          <div className="py-1">
            <h3 className="pt-3 text-[11px] uppercase tracking-wide text-faint">
              Editor
            </h3>
            <Row label="Font size">
              <Number_
                value={settings.fontSize}
                min={9}
                max={32}
                step={1}
                unit="px"
                onChange={value => onChange({ fontSize: value })}
              />
            </Row>
            <Row label="Tab size">
              <Number_
                value={settings.tabSize}
                min={1}
                max={8}
                step={1}
                onChange={value => onChange({ tabSize: value })}
              />
            </Row>
            <Row label="Word wrap">
              <Toggle
                checked={settings.wordWrap}
                onChange={value => onChange({ wordWrap: value })}
              />
            </Row>
            <Row
              label="Split vertically"
              hint="Puts the output below the editor instead of beside it."
            >
              <Toggle
                checked={settings.layout === 'vertical'}
                onChange={value =>
                  onChange({ layout: value ? 'vertical' : 'horizontal' })
                }
              />
            </Row>
          </div>

          <div className="py-1">
            <h3 className="pt-3 text-[11px] uppercase tracking-wide text-faint">
              Output
            </h3>
            <Row
              label="Object depth"
              hint="How many levels are serialised before a value has to be expanded by hand."
            >
              <Number_
                value={settings.maxDepth}
                min={1}
                max={12}
                step={1}
                onChange={value => onChange({ maxDepth: value })}
              />
            </Row>
            <Row label="Items per collection">
              <Number_
                value={settings.maxItems}
                min={10}
                max={1000}
                step={10}
                onChange={value => onChange({ maxItems: value })}
              />
            </Row>
          </div>

          <div className="py-1">
            <h3 className="pt-3 text-[11px] uppercase tracking-wide text-faint">
              Packages
            </h3>
            <Row
              label="Download packages"
              hint="Cached packages always load, so turning this off does not break existing code."
            >
              <Toggle
                checked={settings.allowModuleDownloads}
                onChange={value => onChange({ allowModuleDownloads: value })}
              />
            </Row>
            <Row
              label="Cache"
              hint={cache?.path ?? 'Downloaded packages are stored on disk.'}
            >
              <span className="text-muted">
                {cache
                  ? `${cache.count} files, ${formatBytes(cache.bytes)}`
                  : '…'}
              </span>
              <button
                className="flex items-center gap-1 rounded bg-raised px-2 py-1 hover:bg-raised-hover"
                onClick={clearCache}
              >
                <VscTrash size={12} />
                Clear
              </button>
            </Row>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[11px] text-faint">
          <span>
            {appInfo
              ? `Sandbox ${appInfo.version} · Electron ${appInfo.electron ?? '—'} · Chromium ${appInfo.chrome ?? '—'}`
              : 'Sandbox'}
          </span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
};

SettingsDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  settings: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  appInfo: PropTypes.object
};
