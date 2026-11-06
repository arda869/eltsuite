// Pieces the game's big screen and the players' phones share: answer colours and letters, the stage
// backdrop, confetti and the timer. Every answer has a colour and a letter, so nobody relies on colour.
import type { CSSProperties, ReactNode } from 'react';

export const ANSWER_LOOKS = [
  { name: 'terracotta', colour: '#c8643c' },
  { name: 'teal', colour: '#1f8a80' },
  { name: 'mustard', colour: '#c99a1e' },
  { name: 'plum', colour: '#7a4f9a' },
  { name: 'blue', colour: '#3b6db3' },
  { name: 'moss', colour: '#5f8a3a' },
] as const;
export const LETTERS = 'ABCDEF';

/** The answer's letter on a chip in its colour. */
export function Shape({ i, size = 28 }: { i: number; size?: number }) {
  return (
    <span className="qz-letter" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.58, background: ANSWER_LOOKS[i % ANSWER_LOOKS.length].colour }}>
      {LETTERS[i] || i + 1}
    </span>
  );
}

export const answerStyle = (i: number) => ({ ['--qz-c' as string]: ANSWER_LOOKS[i % ANSWER_LOOKS.length].colour }) as CSSProperties;

const FLOATERS = ['a', '?', 'Ee', '…', 'b', '“ ”', 'th', '!', 'ing', 'Aa', 'ed', ';', 'ou', 'Zz'];

/** The stage: deep ink green with a faint grid, and letters drifting slowly up. Still for less motion. */
export function Backdrop({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={'qz-stage ' + className}>
      <div className="qz-floaters" aria-hidden="true">
        {FLOATERS.map((t, i) => (
          <span key={i} style={{ ['--i' as string]: i, ['--x' as string]: `${(i * 37) % 100}%`, ['--d' as string]: `${18 + ((i * 7) % 13)}s`, ['--s' as string]: `${26 + ((i * 13) % 46)}px` }}>
            {t}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Paper confetti in the answer colours. */
export function Confetti({ n = 80 }: { n?: number }) {
  return (
    <div className="qz-confetti" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ ['--i' as string]: i, ['--x' as string]: `${(i * 61) % 100}%`, ['--c' as string]: i % 5 === 0 ? '#f6efe2' : ANSWER_LOOKS[i % 6].colour, ['--r' as string]: `${(i * 47) % 360}deg`, ['--t' as string]: `${2.4 + ((i * 13) % 20) / 10}s` }} />
      ))}
    </div>
  );
}

/** Seconds left, as a ring that empties and turns red at the end. */
export function TimerRing({ left, total, size = 120 }: { left: number; total: number; size?: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const urgent = left <= 5;
  return (
    <div className={'qz-timer' + (urgent ? ' urgent' : '')} style={{ width: size, height: size }} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="qz-timer-track" />
        <circle cx="50" cy="50" r={r} className="qz-timer-fill" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 50 50)" />
      </svg>
      <b style={{ fontSize: size * 0.36 }}>{Math.max(0, Math.ceil(left))}</b>
    </div>
  );
}

/** A thin bar of time left, for phones. */
export function TimeBar({ left, total }: { left: number; total: number }) {
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  return (
    <div className={'qz-timebar' + (left <= 5 ? ' urgent' : '')} role="timer" aria-label={`${Math.ceil(left)} seconds left`}>
      <i style={{ width: `${frac * 100}%` }} />
      <b>{Math.max(0, Math.ceil(left))}</b>
    </div>
  );
}

/** A small flame for a streak of right answers. */
export function Flame({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="qz-flame">
      <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 3 2 4 3 4-1-3-1-6 0-9Z" fill="#f2b04a" />
      <path d="M12 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 1-2 1-3 1 1 2 1 2 0Z" fill="#d9622b" />
    </svg>
  );
}

/** A medal for the top three. */
export function Medal({ place, size = 120 }: { place: 1 | 2 | 3; size?: number }) {
  const face = place === 1 ? ['#f7d774', '#d9a62a'] : place === 2 ? ['#eef0f3', '#b9bec7'] : ['#efc19a', '#c27a45'];
  const ribbon = place === 1 ? '#c8643c' : place === 2 ? '#1f8a80' : '#7a4f9a';
  return (
    <svg className="qz-medal" width={size} height={size * 1.25} viewBox="0 0 100 125" aria-hidden="true">
      <path d="M30 0h16l10 40H40Z" fill={ribbon} />
      <path d="M70 0H54L44 40h16Z" fill={ribbon} opacity=".85" />
      <defs>
        <linearGradient id={'medal' + place} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={face[0]} />
          <stop offset="1" stopColor={face[1]} />
        </linearGradient>
      </defs>
      <circle cx="50" cy="80" r="40" fill={`url(#medal${place})`} stroke="rgba(0,0,0,.15)" strokeWidth="2" />
      <circle cx="50" cy="80" r="31" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2" />
      <text x="50" y="93" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontWeight="700" fontSize="38" fill="#2a2116">
        {place}
      </text>
    </svg>
  );
}

export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + (s || 'th');
};
export const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
