import { lazy, Suspense, useEffect, useState } from 'react';
import { UiIcon } from '../components/UiIcon';
import './search.css';

const SearchPalette = lazy(() => import('./SearchPalette').then((m) => ({ default: m.SearchPalette })));
export const OPEN_SEARCH = 'elt-open-search';
// Anywhere in the app: open search, with words already typed if given.
export const openSearch = (q = '') => window.dispatchEvent(new CustomEvent(OPEN_SEARCH, { detail: q }));
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// The search button in the top bar, and Ctrl+K (⌘K) everywhere.
export function SearchLauncher() {
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => (o === null ? '' : null)); }
    };
    const ask = (e: Event) => setOpen(String((e as CustomEvent<string>).detail ?? ''));
    window.addEventListener('keydown', key);
    window.addEventListener(OPEN_SEARCH, ask);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener(OPEN_SEARCH, ask); };
  }, []);
  return (
    <>
      <button type="button" className="sp-launch" onClick={() => setOpen('')} aria-label="Search everything" aria-keyshortcuts={mac ? 'Meta+K' : 'Control+K'} data-tip={`Search everything (${mac ? '⌘K' : 'Ctrl+K'})`}>
        <UiIcon name="search" size={16} />
        <span className="sp-launch-label">Search</span>
        <kbd>{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      {open !== null && <Suspense fallback={null}><SearchPalette initial={open} onClose={() => setOpen(null)} /></Suspense>}
    </>
  );
}
