import { Component, ReactNode } from 'react';

// Catches renderer crashes (shader explosions, driver resets, bad custom
// formulas that slip past validation) so the whole app doesn't white-screen.

export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Renderer crashed:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#0b0e17] p-8 text-center">
          <div className="text-sm font-bold uppercase tracking-[0.2em] text-rose-400">Renderer crashed</div>
          <div className="max-w-md font-mono text-[11px] leading-relaxed text-white/50">
            {this.state.error.message}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-lg border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-indigo-200 transition-colors hover:bg-indigo-500/35"
            >
              Try again
            </button>
            <button
              onClick={() => {
                // A broken custom formula/shader may be persisted; clear state
                // (not favorites) before reloading.
                try { localStorage.removeItem('harmonics.state.v1'); } catch { /* ignore */ }
                location.href = location.pathname;
              }}
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white/60 transition-colors hover:bg-white/15"
            >
              Reset & reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
