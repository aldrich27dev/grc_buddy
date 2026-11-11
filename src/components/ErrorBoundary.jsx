import React from 'react';
import { AlertCircle } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('GRCBuddy crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-[var(--color-app-bg)] flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-[var(--color-card-bg)] rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 dark:border-slate-800 text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-grc-red mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h1 className="text-xl font-black text-[var(--color-main-text)] uppercase tracking-tight">
            Something went wrong
          </h1>
          <p className="text-xs text-slate-500 font-bold mt-2 mb-6">
            Please reload the page. Your profile is saved on this device.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-4 bg-grc-red text-white rounded-2xl font-black uppercase text-xs tracking-widest active:scale-95 transition-all"
          >
            Reload GRCBuddy
          </button>
        </div>
      </div>
    );
  }
}