// Pieces the quiz show's big screen and the players' phones share: answer colours and shapes, the
// stage backdrop, confetti and the timer. Every answer has a colour, a shape and a letter, so nobody
// relies on colour alone.
import type { CSSProperties, ReactNode } from 'react';

export const ANSWER_LOOKS = [
  { name: 'red', colour: '#e0533d', shape: 'triangle' },
  { name: 'blue', colour: '#2d6be0', shape: 'diamond' },
  { name: 'yellow', colour: '#e5a118', shape: 'circle' },
  { name: 'green', colour: '#2e9b5c', shape: 'square' },
  { name: 'purple', colour: '#8a4fd3', shape: 'star' },
  { name: 'teal', colour: '#1b9aaa', shape: 'hexagon' },
] as const;
export const LETTERS = 'ABCDEF';

export function Shape({ i, size = 28 }: { i: number; size?: number }) {
  const s = ANSWER_LOOKS[i % ANSWER_LOOKS.length].shape;
  const p = { fill: '#fff' };
  return (
    <svg className="qz-shape" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {s === 'triangle' && <path d="M20 4 37 34H3Z" {...p} />}
      {s === 'diamond' && <path d="M20 2 37 20 20 38 3 20Z" {...p} />}
      {s === 'circle' && <circle cx="20" cy="20" r="16" {...p} />}
      {s === 'square' && <rect x="5" y="5" width="30" height="30" rx="3" {...p} />}
      {s === 'star' && <path d="m20 3 5 11 12 1.5-9 8.5 2.5 12L20 30l-10.5 6 2.5-12-9-8.5L15 14Z" {...p} />}
      {s === 'hexagon' && <path d="M11 4h18l9 16-9 16H11L2 20Z" {...p} />}
    </svg>
  );
}

export const answerStyle = (i: number) => ({ ['--qz-c' as string]: ANSWER_LOOKS[i % ANSWER_LOOKS.length].colour }) as CSSProperties;

/** The stage: a deep backdrop with slow floating shapes. Still for people who ask for less motion. */
export function Backdrop({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={'qz-stage ' + className}>
      <div className="qz-floaters" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} style={{ ['--i' as string]: i, ['--x' as string]: `${(i * 37) % 100}%`, ['--d' as string]: `${14 + ((i * 7) % 11)}s`, ['--s' as string]: `${28 + ((i * 13) % 50)}px` }}>
            <Shape i={i} size={64} />
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

/** Confetti in the answer colours. */
export function Confetti({ n = 80 }: { n?: number }) {
  return (
    <div className="qz-confetti" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ ['--i' as string]: i, ['--x' as string]: `${(i * 61) % 100}%`, ['--c' as string]: ANSWER_LOOKS[i % 6].colour, ['--r' as string]: `${(i * 47) % 360}deg`, ['--t' as string]: `${2.2 + ((i * 13) % 20) / 10}s`, ['--w' as string]: `${(i * 17) % 10}s` }} />
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
      <b>{Math.max(0, Math.ceil(left))}</b>
    </div>
  );
}

/** A small flame for a streak of right answers. */
export function Flame({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="qz-flame">
      <path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 3 2 4 3 4-1-3-1-6 0-9Z" fill="#ffb23e" />
      <path d="M12 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 1-2 1-3 1 1 2 1 2 0Z" fill="#ff6a2b" />
    </svg>
  );
}

export const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + (s || 'th');
};
export const fmt = (n: number) => Math.round(n).toLocaleString('en-GB');
