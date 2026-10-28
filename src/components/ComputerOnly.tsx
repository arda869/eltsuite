import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePhone } from '../lib/useMedia';
import { Mark } from './Wordmark';

// Some places need a bigger screen: on a phone they say so, with the way home, and let you open
// them anyway for a quick look. What works well on a phone (Home, teaching live, Messages and
// calls, marking, the learner side, reading files) is not wrapped in this.
export function ComputerOnly({ what, children }: { what: string; children: ReactNode }) {
  const phone = usePhone();
  const [anyway, setAnyway] = useState(() => {
    try {
      return sessionStorage.getItem('ll.anyway.' + what) === '1';
    } catch {
      return false;
    }
  });
  if (!phone || anyway) return <>{children}</>;
  return (
    <div className="co">
      <div className="co-card">
        <Mark size={34} />
        <svg width="120" height="78" viewBox="0 0 120 78" aria-hidden="true">
          <rect x="22" y="6" width="76" height="50" rx="5" fill="none" stroke="currentColor" strokeWidth="3" />
          <path d="M12 64h96l-6 8H18z" fill="currentColor" opacity=".55" />
          <rect x="4" y="34" width="22" height="40" rx="5" fill="var(--paper)" stroke="currentColor" strokeWidth="3" />
        </svg>
        <h1>{what} needs a bigger screen</h1>
        <p>Open it on a computer or a tablet. On your phone you can teach live, mark, send messages and calls, and read your files.</p>
        <span className="co-acts">
          <Link className="btn primary" to="/">
            Go home
          </Link>
          <button
            type="button"
            className="btn"
            onClick={() => {
              try {
                sessionStorage.setItem('ll.anyway.' + what, '1');
              } catch {
                /* fine */
              }
              setAnyway(true);
            }}
          >
            Open it anyway
          </button>
        </span>
      </div>
    </div>
  );
}
