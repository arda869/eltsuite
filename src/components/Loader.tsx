import { Mark } from './Wordmark';

// The ELT Suite mark, its lines filling in one by one, while something loads.
export function Loader({ label = 'Loading', full = false }: { label?: string; full?: boolean }) {
  return (
    <div className={'loader' + (full ? ' full' : '')} role="status" aria-live="polite">
      <span className="ld-mark ld-suite" aria-hidden="true">
        <Mark size={44} />
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
