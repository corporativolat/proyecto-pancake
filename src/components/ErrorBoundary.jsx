import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { logger } from '../lib/logger';
import { tStatic } from '../lib/i18n.jsx';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    logger.error('ErrorBoundary', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-ink-50">
        <div className="max-w-lg w-full bg-white border border-red-100 rounded-3xl p-8 shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-ink-900">{tStatic('error.title')}</h2>
              <p className="text-xs font-bold text-ink-400 uppercase tracking-widest">{tStatic('error.subtitle')}</p>
            </div>
          </div>
          <pre className="text-xs bg-ink-50 p-4 rounded-xl text-ink-700 overflow-auto max-h-48 mb-5 whitespace-pre-wrap break-words">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <div className="flex gap-3">
            <button onClick={this.reset} className="btn-primary flex-1 justify-center">
              <RefreshCw className="w-4 h-4" /> {tStatic('error.retry')}
            </button>
            <button onClick={() => window.location.reload()} className="btn-ghost">
              {tStatic('error.reload')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
