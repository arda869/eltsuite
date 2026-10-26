// The Lesson Lit flame, flickering above the stem of the "i", while something loads.
const FLAME = 'M17 2 C25 14 30 22 30 30 C30 39 24 46 17 46 C10 46 4 39 4 30 C4 22 9 14 17 2 Z';
const CORE = 'M17 20 C21 26 23 30 23 34 C23 39 20 42 17 42 C14 42 11 39 11 34 C11 30 13 26 17 20 Z';

export function Loader({ label = 'Loading', full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={'loader' + (full ? ' full' : '')} role="status" aria-live="polite">
      <span className="ld-mark" aria-hidden="true">
        <span className="ld-glow" />
        <svg className="ld-flame" viewBox="0 0 34 48">
          <path d={FLAME} className="ld-outer" />
          <path d={CORE} className="ld-core" />
        </svg>
        <span className="ld-stem" />
      </span>
      {label && (
        <span className="ld-label">
          {label}
          <span className="ld-dots" aria-hidden="true">
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </span>
      )}
    </div>
  );
}
