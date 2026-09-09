import PropTypes from 'prop-types';
import { useEffect } from 'react';

/**
 * A blocking confirmation for actions that change what the app is allowed to
 * do. Used for Node mode, which runs user code with the app's own privileges
 * rather than inside a browser sandbox.
 */
export const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  tone = 'default',
  onConfirm,
  onCancel
}) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
      onMouseDown={onCancel}
      role="presentation"
    >
      <div
        className="w-[min(460px,92vw)] rounded-lg border border-line bg-panel p-4 shadow-2xl"
        onMouseDown={event => event.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <h2
          className={`text-[14px] font-semibold ${
            tone === 'warning' ? 'text-warn' : 'text-ink-strong'
          }`}
        >
          {title}
        </h2>
        <div className="mt-2 text-[13px] leading-relaxed text-muted">
          {body}
        </div>
        <div className="mt-4 flex justify-end gap-2 text-[13px]">
          <button
            className="rounded px-3 py-1.5 text-muted hover:bg-raised hover:text-ink"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`rounded px-3 py-1.5 text-white ${
              tone === 'warning'
                ? 'bg-warn-strong hover:bg-warn-strong-hover'
                : 'bg-accent hover:bg-accent-hover'
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  body: PropTypes.node,
  confirmLabel: PropTypes.string,
  cancelLabel: PropTypes.string,
  tone: PropTypes.string,
  onConfirm: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired
};
