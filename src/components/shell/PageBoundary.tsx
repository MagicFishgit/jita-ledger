import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

/**
 * Catches a page that fails to render, so one broken page shows what went wrong inside the shell
 * instead of blanking the whole app. Keyed by route, so moving to another page starts it fresh.
 */
export class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Page failed to render', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="notice err" role="alert">
          <TriangleAlert aria-hidden="true" />
          <div>
            <b>This page hit an error and couldn’t be shown.</b> Your data is safe — nothing was changed.
            The rest of the app still works; export a backup from Settings if you want one before trying again.
            <pre style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'var(--f-mono)', fontSize: 11.5, color: 'var(--sec)' }}>{this.state.error.message}</pre>
            <button type="button" className="btn sm" style={{ marginTop: 10 }} onClick={() => this.setState({ error: null })}>Try again</button>
          </div>
        </div>
      </div>
    );
  }
}
