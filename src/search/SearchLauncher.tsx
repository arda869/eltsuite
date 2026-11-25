import { comboOf, keyFor, label, useKeys } from '../lib/shortcuts';
import { markStep } from '../start/steps';
import { lazy, Suspense, useEffect, useState } from 'react';
import { UiIcon } from '../components/UiIcon';
import './search.css';

const SearchPalette = lazy(() => import('./SearchPalette').then((m) => ({ default: m.SearchPalette })));
export const OPEN_SEARCH = 'elt-open-search';
// Anywhere in the app: open search, with words already typed if given.
export const openSearch = (q = '') => window.dispatchEvent(new CustomEvent(OPEN_SEARCH, { detail: q }));

// The search button in the top bar, and Ctrl+K (⌘K) everywhere.
export function SearchLauncher() {
  const [open, setOpen] = useState<string | null>(null);
  const keys = useKeys();
  useEffect(() => { if (open !== null) markStep('search'); }, [open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (comboOf(e) === keyFor('search')) { e.preventDefault(); setOpen((o) => (o === null ? '' : null)); }
    };
    const ask = (e: Event) => setOpen(String((e as CustomEvent<string>).detail ?? ''));
    window.addEventListener('keydown', key);
    window.addEventListener(OPEN_SEARCH, ask);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener(OPEN_SEARCH, ask); };
  }, []);
  return (
    <>
      <button type="button" className="sp-launch" onClick={() => setOpen('')} aria-label="Search everything" data-tip={`Search everything (${label(keys.search || 'Mod+K')})`}>
        <UiIcon name="search" size={16} />
        <span className="sp-launch-label">Search</span>
        <kbd>{label(keys.search || 'Mod+K')}</kbd>
      </button>
      {open !== null && <Suspense fallback={null}><SearchPalette initial={open} onClose={() => setOpen(null)} /></Suspense>}
    </>
  );
}
