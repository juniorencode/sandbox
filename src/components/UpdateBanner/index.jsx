import PropTypes from 'prop-types';
import { VscClose, VscCloudDownload, VscSync } from 'react-icons/vsc';

/**
 * Update prompt.
 *
 * Downloading is a button rather than something that happens on its own: this
 * is a tool people leave open, and swapping it out underneath them is not a
 * courtesy. Nothing renders unless there is something to act on.
 */
export const UpdateBanner = ({ state, onDownload, onInstall, onDismiss }) => {
  const { status } = state;
  if (!['available', 'downloading', 'ready', 'error'].includes(status)) {
    return null;
  }

  const content = {
    available: {
      text: `Version ${state.version} is available`,
      action: { label: 'Download', icon: VscCloudDownload, run: onDownload }
    },
    downloading: {
      text: `Downloading update… ${state.percent ?? 0}%`,
      action: null
    },
    ready: {
      text: `Version ${state.version} is ready to install`,
      action: { label: 'Restart and install', icon: VscSync, run: onInstall }
    },
    error: { text: state.message, action: null }
  }[status];

  const Icon = content.action?.icon;

  return (
    <div
      className={`flex shrink-0 items-center gap-3 px-3 py-1 text-[12px] ${
        status === 'error'
          ? 'bg-danger-soft text-danger'
          : 'bg-info-soft text-info'
      }`}
      role="status"
    >
      <span>{content.text}</span>
      {content.action && (
        <button
          className="flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 hover:bg-white/20"
          onClick={content.action.run}
        >
          {Icon && <Icon size={12} />}
          {content.action.label}
        </button>
      )}
      <button
        className="ml-auto opacity-60 hover:opacity-100"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <VscClose size={14} />
      </button>
    </div>
  );
};

UpdateBanner.propTypes = {
  state: PropTypes.shape({
    status: PropTypes.string.isRequired,
    version: PropTypes.string,
    percent: PropTypes.number,
    message: PropTypes.string
  }).isRequired,
  onDownload: PropTypes.func.isRequired,
  onInstall: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired
};
