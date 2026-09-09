import PropTypes from 'prop-types';
import { Component } from 'react';
import { revealWorkspace, workspace } from '../../platform';

/**
 * Last line of defence for the renderer.
 *
 * A throw during render used to leave a blank window with no way out: the
 * packaged app has no menu and no devtools, so a corrupt workspace or a quota
 * error from an effect was unrecoverable without clearing app data by hand.
 * This at least shows what happened and offers the two actions that fix it.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, resetting: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
  }

  handleReload = () => window.location.reload();

  handleReset = async () => {
    this.setState({ resetting: true });
    // A single empty tab is a valid workspace, so this always produces a
    // state the app can start from.
    await workspace.write({
      tabs: [{ id: 1, name: 'Tab 1', code: '', path: null }],
      activeTab: 1,
      settings: {}
    });
    workspace.clearLegacy();
    window.location.reload();
  };

  render() {
    const { error, info, resetting } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#212830] p-8 text-neutral-300">
        <h1 className="text-lg font-semibold text-[#ff7b72]">
          Sandbox hit an error it could not recover from
        </h1>

        <pre className="max-h-48 max-w-2xl overflow-auto rounded border border-[#2d3641] bg-[#14181f] p-3 text-[12px] whitespace-pre-wrap">
          {String(error?.stack || error?.message || error)}
          {info?.componentStack ? `\n${info.componentStack}` : ''}
        </pre>

        <div className="flex gap-2">
          <button
            className="rounded bg-[#2d3641] px-3 py-1.5 text-[13px] hover:bg-[#3a4552]"
            onClick={this.handleReload}
          >
            Reload
          </button>
          <button
            className="rounded bg-[#2d3641] px-3 py-1.5 text-[13px] hover:bg-[#3a4552] disabled:opacity-50"
            onClick={this.handleReset}
            disabled={resetting}
            title="Replaces the stored workspace with a single empty tab"
          >
            {resetting ? 'Resetting…' : 'Reset workspace and reload'}
          </button>
          <button
            className="rounded px-3 py-1.5 text-[13px] text-[#9198A1] hover:text-neutral-200"
            onClick={revealWorkspace}
            title="Open the folder holding workspace.json and its backup"
          >
            Show workspace folder
          </button>
        </div>

        <p className="max-w-xl text-center text-[12px] text-[#9198A1]">
          The previous workspace is kept alongside the current one as
          <span className="font-mono"> workspace.json.bak</span>, so resetting
          does not discard it.
        </p>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node
};
