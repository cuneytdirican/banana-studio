import React from 'react';

type LazyBoundaryState = { error: Error | null };

/** Keeps a failed lazy chunk from unmounting the whole studio. */
export class LazyBoundary extends React.Component<{ children: React.ReactNode; label?: string }, LazyBoundaryState> {
  state: LazyBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): LazyBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('A lazy studio panel failed to load.', error);
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="fixed inset-0 z-[95] grid place-items-center bg-black/75 p-6 text-white">
        <div className="max-w-sm rounded-2xl border border-red-500/30 bg-[#161b22] p-6 text-center shadow-2xl">
          <h2 className="text-base font-semibold">{this.props.label || 'This panel'} could not load</h2>
          <p className="mt-2 text-xs leading-5 text-gray-400">
            The application is still running. Reload to fetch the latest files.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
