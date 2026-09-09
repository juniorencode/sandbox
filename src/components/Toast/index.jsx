import PropTypes from 'prop-types';
import { useEffect } from 'react';
import { VscClose } from 'react-icons/vsc';

/**
 * Transient confirmation for actions with no visible result.
 *
 * Saving a file, exporting a workspace or hitting a dialog error all produce
 * nothing on screen otherwise, which is how the app used to behave for every
 * operation that touched the outside world: it either worked silently or
 * failed silently.
 */

const DISMISS_AFTER_MS = 4000;

const TONE = {
  info: 'border-[#2d3641] bg-[#1b212b] text-neutral-200',
  error: 'border-[#ff7b72] bg-[#3a1d1d] text-[#ff7b72]'
};

export const Toast = ({ notice, onDismiss }) => {
  useEffect(() => {
    if (!notice) return undefined;
    // Keyed on `at` so a second notice restarts the timer instead of being
    // cut short by the first one's.
    const timer = setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;

  return (
    <div
      className={`fixed bottom-9 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md border px-3 py-2 text-[13px] shadow-lg ${
        TONE[notice.tone] ?? TONE.info
      }`}
      role="status"
    >
      <span>{notice.message}</span>
      <button
        className="opacity-60 hover:opacity-100"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <VscClose size={14} />
      </button>
    </div>
  );
};

Toast.propTypes = {
  notice: PropTypes.shape({
    tone: PropTypes.string,
    message: PropTypes.string.isRequired,
    at: PropTypes.number
  }),
  onDismiss: PropTypes.func.isRequired
};
