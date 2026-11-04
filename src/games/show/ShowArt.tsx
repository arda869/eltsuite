// Original vector artwork for the show: a marquee of stage lamps, spotlight cones, the lozenge
// badge on each answer card, the clock ring and the lifeline marks. All of it takes its colours
// from the stage palette (CSS variables), so one drawing suits every look and prints in colour.
import { useId, type ReactNode } from 'react';

/** A row of stage lamps along the top of the stage. */
export function Marquee({ count = 11, lit = true }: { count?: number; lit?: boolean }) {
  const w = 24;
  return <svg className={'show-marquee' + (lit ? ' lit' : '')} viewBox={`0 0 ${count * w} 22`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="0" y="2" width={count * w} height="5" rx="2.5" className="show-marquee-rail" />
    {Array.from({ length: count }, (_, i) => <g key={i} className="show-lamp" style={{ ['--i' as string]: i }}>
      <rect x={i * w + w / 2 - 4} y="6" width="8" height="5" rx="1.5" className="show-lamp-stem" />
      <circle cx={i * w + w / 2} cy="15" r="5.2" className="show-lamp-bulb" />
      <circle cx={i * w + w / 2 - 1.6} cy="13.4" r="1.4" className="show-lamp-glint" />
    </g>)}
  </svg>;
}

/** Two soft cones of light from above and a floor line. Sits behind everything else. */
export function Spotlights() {
  const id = useId().replace(/:/g, '');
  return <svg className="show-spots" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id={`cone-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--sh-light)" stopOpacity=".3" />
        <stop offset="1" stopColor="var(--sh-light)" stopOpacity="0" />
      </linearGradient>
      <radialGradient id={`pool-${id}`} cx=".5" cy="1" r=".7">
        <stop offset="0" stopColor="var(--sh-light)" stopOpacity=".22" />
        <stop offset="1" stopColor="var(--sh-light)" stopOpacity="0" />
      </radialGradient>
    </defs>
    <polygon className="show-cone show-cone-a" points="280,-40 380,-40 800,640 120,640" fill={`url(#cone-${id})`} />
    <polygon className="show-cone show-cone-b" points="620,-40 720,-40 880,640 200,640" fill={`url(#cone-${id})`} />
    <rect x="0" y="380" width="1000" height="220" fill={`url(#pool-${id})`} />
    <line x1="0" y1="542" x2="1000" y2="542" className="show-floor" />
  </svg>;
}

/** The classic game-show lozenge, used for answer letters and the show's mark. */
export function Lozenge({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <span className={'show-lozenge ' + className} aria-hidden="true">
    <svg viewBox="0 0 64 44" preserveAspectRatio="none"><path d="M12 2h40l10 20-10 20H12L2 22z" /></svg>
    <b>{children}</b>
  </span>;
}

/** The show's emblem: a lozenge frame around a four-point star. */
export function Emblem() {
  return <svg className="show-emblem" viewBox="0 0 120 84" aria-hidden="true">
    <path d="M22 4h76l18 38-18 38H22L4 42z" className="show-emblem-frame" />
    <path d="M30 12h60l14 30-14 30H30L16 42z" className="show-emblem-inner" />
    <path d="M60 22c2 12 8 18 20 20-12 2-18 8-20 20-2-12-8-18-20-20 12-2 18-8 20-20z" className="show-emblem-star" />
  </svg>;
}

/** A ring that empties as the seconds pass. */
export function TimerRing({ remaining, total, urgent }: { remaining: number; total: number; urgent: boolean }) {
  const r = 17, c = 2 * Math.PI * r, part = total ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return <span className={'show-timer' + (urgent ? ' urgent' : '')} role="timer" aria-live={urgent ? 'assertive' : 'off'} aria-label={`${Math.ceil(remaining)} seconds left`}>
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} className="show-timer-track" />
      <circle cx="20" cy="20" r={r} className="show-timer-arc" strokeDasharray={c} strokeDashoffset={c * (1 - part)} />
    </svg>
    <b>{Math.ceil(remaining)}</b>
  </span>;
}

export function MarkRight() {
  return <svg viewBox="0 0 24 24" className="show-mark" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
export function MarkWrong() {
  return <svg viewBox="0 0 24 24" className="show-mark" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>;
}
export function IconFifty() {
  return <svg viewBox="0 0 24 24" className="show-icon" aria-hidden="true"><rect x="3" y="5" width="8" height="14" rx="2" /><rect x="13" y="5" width="8" height="14" rx="2" /><path d="M5.5 9.5l3 3M8.5 9.5l-3 3M15.5 9.5l3 3M18.5 9.5l-3 3" /></svg>;
}
export function IconExtraTime() {
  return <svg viewBox="0 0 24 24" className="show-icon" aria-hidden="true"><circle cx="11" cy="13" r="7" /><path d="M11 9v4l2.5 2M9 3h4M17 4l1.5 1.5M18 9h4M20 7v4" /></svg>;
}
export function IconSound({ on }: { on: boolean }) {
  return <svg viewBox="0 0 24 24" className="show-icon" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" />{on ? <path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" /> : <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />}</svg>;
}
