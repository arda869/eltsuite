import { Component, type ReactNode } from 'react';

// When a part of the app fails to load (often: a new version was published while the tab was
// open), the page reloads itself once; anything else shows a short note with a reload button,
// never a blank page or an endless loading screen.
const KEY = 'll.reloadedAt';
export const isChunkError = (e: unknown) => /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch dynamically|ChunkLoadError|Unable to preload/i.test(String((e as Error)?.message ?? e));
export function reloadOnce() {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 30000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* fine */
  }
  window.location.reload();
  return true;
}
export function watchChunkErrors() {
  window.addEventListener('vite:preloadError', (e) => {
    e.preventDefault();
    reloadOnce();
  });
  window.addEventListener('unhandledrejection', (e) => isChunkError(e.reason) && reloadOnce());
}

export class AppError extends Component<{ children: ReactNode }, { err: unknown }> {
  state = { err: null as unknown };
  static getDerivedStateFromError(err: unknown) {
    return { err };
  }
  componentDidCatch(err: unknown) {
    console.error(err);
    if (isChunkError(err)) reloadOnce();
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="app-err" role="alert">
        <strong>Something didn’t load</strong>
        <span className="hint">{isChunkError(this.state.err) ? 'A new version of ELT Suite is out. Reload to get it.' : 'Reload the page to try again. Your work is saved.'}</span>
        <a className="btn" href="https://eltsuite.com/">Teacher sign-in</a>
        <button type="button" className="btn primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
