// One small picture for each game, drawn in code in a shared flat style, so the Games home reads
// as one family while every game is recognisable at a glance. Colours come from each game's
// palette (--ga-bg, --ga-a, --ga-b, --ga-ink) set on the tile.
import type { GameType } from '../model';

export const GAME_LOOK: Record<GameType, { bg: string; a: string; b: string; ink: string }> = {
  shark: { bg: '#2d8fa6', a: '#f1dcb0', b: '#5d6f82', ink: '#0f4252' },
  taxi: { bg: '#f1a66b', a: '#f2b63a', b: '#4a4745', ink: '#2b2320' },
  drive: { bg: '#6a9a5e', a: '#fff7e6', b: '#2b2622', ink: '#243c1f' },
  blocks: { bg: '#273449', a: '#6bd4d3', b: '#f2b751', ink: '#101a2b' },
  show: { bg: '#4a2a4f', a: '#ffd166', b: '#ff6b8b', ink: '#2a1230' },
  targets: { bg: '#e5d4bf', a: '#d2694a', b: '#fffaf2', ink: '#5a3a2a' },
  pinball: { bg: '#1e2246', a: '#38c6ff', b: '#ff4f8b', ink: '#0e1030' },
  maze: { bg: '#cfe7f2', a: '#2f6f9f', b: '#fff', ink: '#1a3b57' },
  hangman: { bg: '#f3e9d6', a: '#d2694a', b: '#3b3732', ink: '#4a3a2c' },
  search: { bg: '#dbe8b5', a: '#3f8f5a', b: '#fffbe4', ink: '#23432c' },
  slice: { bg: '#f7d6c0', a: '#e8715a', b: '#5aa36a', ink: '#5a2a1c' },
  moles: { bg: '#a9c48a', a: '#8a5a34', b: '#5c7f2e', ink: '#2e3f1a' },
  wager: { bg: '#2f3b2f', a: '#f2c14e', b: '#e9e2cf', ink: '#17201a' },
  auction: { bg: '#e9dcc7', a: '#8f6b47', b: '#d2694a', ink: '#4a3a2c' },
  pairs: { bg: '#5a6ca8', a: '#fff7e6', b: '#ff8c69', ink: '#26305a' },
  cloud: { bg: '#bfe3f2', a: '#fff', b: '#2f6f9f', ink: '#1f4a66' },
};

export function GameMark({ type }: { type: GameType }) {
  const Mark = MARKS[type];
  return <svg className="ga-mark" viewBox="0 0 160 120" aria-hidden="true"><Mark /></svg>;
}

const MARKS: Record<GameType, () => JSX.Element> = {
  shark: () => <>
    <path d="M0 78c20-10 40-10 60 0s40 10 60 0 30-8 40 0v42H0z" fill="var(--ga-ink)" opacity=".35" />
    <path d="M120 66c6-14 14-22 24-26-4 10-5 18-4 26z" fill="var(--ga-b)" />
    <path d="M0 84c20-10 40-10 60 0s40 10 60 0 30-8 40 0v36H0z" fill="var(--ga-ink)" opacity=".5" />
    <path d="M18 78c8-18 24-28 44-28s36 10 44 28z" fill="var(--ga-a)" />
    <path d="M60 54c2-16 6-26 14-36" stroke="#8a5a34" strokeWidth="5" strokeLinecap="round" />
    <path d="M74 20c-12-4-22 0-28 10 10-2 20 0 28-10zM74 20c0-12 8-20 20-22-6 8-8 14-20 22zM74 20c12-6 24-2 30 8-10-2-20-2-30-8z" fill="#3f9a5a" />
    <path d="M0 96c20-8 40-8 60 0s40 8 60 0 30-6 40 0v24H0z" fill="var(--ga-ink)" opacity=".6" />
  </>,
  taxi: () => <>
    <path d="M0 96h160v24H0z" fill="var(--ga-b)" />
    <path d="M10 108h20M40 108h20M70 108h20M100 108h20M130 108h20" stroke="#f5e9c8" strokeWidth="3" strokeDasharray="12 10" />
    <path d="M26 92c0-6 4-12 10-13l8-22c2-6 6-9 12-9h50c6 0 10 3 12 9l8 22c6 1 10 7 10 13v6H26z" fill="var(--ga-a)" />
    <path d="M50 70l6-16h50l6 16z" fill="#9fd3e8" />
    <path d="M70 48h22v-6H70z" fill="#fff4c2" />
    <g fill="#2b2622"><rect x="30" y="84" width="8" height="5" /><rect x="46" y="84" width="8" height="5" /><rect x="62" y="84" width="8" height="5" /><rect x="78" y="84" width="8" height="5" /><rect x="94" y="84" width="8" height="5" /><rect x="110" y="84" width="8" height="5" /><rect x="126" y="84" width="8" height="5" /></g>
    <circle cx="48" cy="98" r="9" fill="#1f1d1b" /><circle cx="114" cy="98" r="9" fill="#1f1d1b" /><circle cx="48" cy="98" r="4" fill="#c9c4bb" /><circle cx="114" cy="98" r="4" fill="#c9c4bb" />
    <path d="M28 82h8v6h-8zM126 82h8v6h-8z" fill="#e8453c" />
  </>,
  drive: () => <>
    <path d="M30 120c10-40 20-70 50-110 30 40 40 70 50 110z" fill="var(--ga-b)" opacity=".85" />
    <path d="M80 30v80" stroke="var(--ga-a)" strokeWidth="4" strokeDasharray="12 12" />
    <rect x="98" y="14" width="4" height="56" fill="var(--ga-b)" />
    <g><rect x="102" y="14" width="40" height="28" fill="var(--ga-a)" /><g fill="var(--ga-b)"><rect x="102" y="14" width="10" height="7" /><rect x="122" y="14" width="10" height="7" /><rect x="112" y="21" width="10" height="7" /><rect x="132" y="21" width="10" height="7" /><rect x="102" y="28" width="10" height="7" /><rect x="122" y="28" width="10" height="7" /><rect x="112" y="35" width="10" height="7" /><rect x="132" y="35" width="10" height="7" /></g></g>
    <path d="M60 110c0-6 4-10 10-10h20c6 0 10 4 10 10v6H60z" fill="#d45e51" />
  </>,
  blocks: () => <>
    <g fill="var(--ga-b)"><rect x="24" y="96" width="22" height="22" /><rect x="48" y="96" width="22" height="22" /><rect x="72" y="96" width="22" height="22" /><rect x="120" y="96" width="22" height="22" /><rect x="24" y="72" width="22" height="22" /><rect x="120" y="72" width="22" height="22" /></g>
    <g fill="var(--ga-a)"><rect x="72" y="30" width="22" height="22" /><rect x="96" y="30" width="22" height="22" /><rect x="72" y="54" width="22" height="22" /><rect x="72" y="6" width="22" height="22" /></g>
    <path d="M94 24h2v40h-2zM72 24h2v40h-2z" fill="#fff" opacity=".2" />
  </>,
  show: () => <>
    <rect x="16" y="18" width="128" height="84" rx="12" fill="var(--ga-ink)" />
    <g fill="var(--ga-a)">{[28, 48, 68, 88, 108, 128].map(x => <circle key={x} cx={x} cy="18" r="4" />)}{[28, 48, 68, 88, 108, 128].map(x => <circle key={'b' + x} cx={x} cy="102" r="4" />)}</g>
    <rect x="34" y="40" width="92" height="20" rx="6" fill="#fff8f0" /><rect x="40" y="45" width="10" height="10" rx="3" fill="var(--ga-b)" /><path d="M56 50h50" stroke="var(--ga-ink)" strokeWidth="4" strokeLinecap="round" opacity=".4" />
    <rect x="34" y="66" width="92" height="20" rx="6" fill="#fff8f0" opacity=".7" /><rect x="40" y="71" width="10" height="10" rx="3" fill="var(--ga-a)" /><path d="M56 76h36" stroke="var(--ga-ink)" strokeWidth="4" strokeLinecap="round" opacity=".3" />
  </>,
  targets: () => <>
    <circle cx="80" cy="62" r="46" fill="var(--ga-b)" /><circle cx="80" cy="62" r="34" fill="var(--ga-a)" /><circle cx="80" cy="62" r="22" fill="var(--ga-b)" /><circle cx="80" cy="62" r="10" fill="var(--ga-a)" />
    <path d="M80 62L136 16" stroke="var(--ga-ink)" strokeWidth="4" strokeLinecap="round" /><path d="M126 8l14 2-4 14z" fill="var(--ga-ink)" />
  </>,
  pinball: () => <>
    <rect x="30" y="6" width="100" height="112" rx="34" fill="var(--ga-ink)" />
    <circle cx="60" cy="40" r="12" fill="var(--ga-b)" /><circle cx="100" cy="40" r="12" fill="var(--ga-a)" /><circle cx="80" cy="66" r="12" fill="var(--ga-b)" />
    <path d="M52 112l20-14M108 112L88 98" stroke="var(--ga-a)" strokeWidth="7" strokeLinecap="round" />
    <circle cx="80" cy="92" r="6" fill="#fff" />
  </>,
  maze: () => <>
    <rect x="20" y="12" width="120" height="96" rx="8" fill="var(--ga-b)" />
    <path d="M36 28h88M36 28v64M60 44v48M60 44h40M124 44v48h-20M84 60v32M84 60h20" fill="none" stroke="var(--ga-a)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="48" cy="80" r="7" fill="#d2694a" /><path d="M104 76l10 0-5-8z" fill="#3f8f5a" />
  </>,
  hangman: () => <>
    <g fill="var(--ga-b)"><rect x="18" y="86" width="18" height="4" rx="2" /><rect x="44" y="86" width="18" height="4" rx="2" /><rect x="70" y="86" width="18" height="4" rx="2" /><rect x="96" y="86" width="18" height="4" rx="2" /><rect x="122" y="86" width="18" height="4" rx="2" /></g>
    <g fontFamily="Karla, system-ui, sans-serif" fontWeight="800" fontSize="24" fill="var(--ga-ink)"><text x="27" y="80" textAnchor="middle">W</text><text x="79" y="80" textAnchor="middle">R</text><text x="131" y="80" textAnchor="middle">D</text></g>
    <circle cx="80" cy="34" r="18" fill="none" stroke="var(--ga-a)" strokeWidth="9" strokeDasharray="14 10" />
  </>,
  search: () => <>
    <rect x="22" y="14" width="116" height="92" rx="10" fill="var(--ga-b)" />
    <path d="M38 34l84 50" stroke="var(--ga-a)" strokeWidth="18" strokeLinecap="round" opacity=".35" />
    <g fontFamily="Karla, system-ui, sans-serif" fontWeight="700" fontSize="16" fill="var(--ga-ink)" textAnchor="middle">{['K', 'C', 'A', 'T', 'L', 'B', 'O', 'O', 'K', 'E', 'N', 'U', 'S', 'P', 'R'].map((c, i) => <text key={i} x={44 + (i % 5) * 18} y={40 + Math.floor(i / 5) * 26}>{c}</text>)}</g>
  </>,
  slice: () => <>
    <path d="M44 70a30 30 0 0 1 56-18L44 70z" fill="var(--ga-b)" /><path d="M46 78l56-18a30 30 0 0 1-56 18z" fill="var(--ga-a)" />
    <path d="M28 96L132 36" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    <path d="M100 20c6-8 14-10 22-6-6 2-10 6-14 12z" fill="#5aa36a" />
  </>,
  moles: () => <>
    <ellipse cx="80" cy="96" rx="52" ry="14" fill="var(--ga-ink)" opacity=".55" />
    <path d="M52 96c0-26 12-44 28-44s28 18 28 44z" fill="var(--ga-a)" />
    <circle cx="70" cy="70" r="4" fill="#1f1d1b" /><circle cx="90" cy="70" r="4" fill="#1f1d1b" /><ellipse cx="80" cy="82" rx="7" ry="5" fill="#f1b7a3" />
    <path d="M60 50c-4-8-2-14 4-16M100 50c4-8 2-14-4-16" stroke="var(--ga-a)" strokeWidth="6" strokeLinecap="round" />
    <path d="M20 100c10-6 20-6 30 0M110 100c10-6 20-6 30 0" stroke="var(--ga-b)" strokeWidth="6" strokeLinecap="round" />
  </>,
  wager: () => <>
    <g fill="var(--ga-a)"><ellipse cx="62" cy="92" rx="30" ry="10" /><rect x="32" y="74" width="60" height="18" /><ellipse cx="62" cy="74" rx="30" ry="10" /><ellipse cx="62" cy="60" rx="30" ry="10" fill="#f7d77e" /></g>
    <path d="M114 86V36" stroke="var(--ga-b)" strokeWidth="6" strokeLinecap="round" /><path d="M100 50l14-16 14 16" fill="none" stroke="var(--ga-b)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M136 60v30" stroke="var(--ga-b)" strokeWidth="6" strokeLinecap="round" opacity=".6" /><path d="M126 80l10 12 10-12" fill="none" stroke="var(--ga-b)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
  </>,
  auction: () => <>
    <path d="M34 96h54" stroke="var(--ga-a)" strokeWidth="8" strokeLinecap="round" />
    <path d="M54 80l36-36" stroke="var(--ga-a)" strokeWidth="10" strokeLinecap="round" />
    <rect x="74" y="24" width="40" height="22" rx="4" transform="rotate(45 94 35)" fill="var(--ga-a)" />
    <path d="M104 92l26-26c2-2 4-2 6 0l10 10c2 2 2 4 0 6l-26 26z" fill="var(--ga-b)" /><circle cx="134" cy="76" r="4" fill="#fff" />
  </>,
  pairs: () => <>
    <rect x="22" y="22" width="52" height="72" rx="8" fill="var(--ga-a)" transform="rotate(-8 48 58)" />
    <rect x="86" y="22" width="52" height="72" rx="8" fill="var(--ga-a)" transform="rotate(8 112 58)" />
    <text x="46" y="68" textAnchor="middle" fontFamily="Fraunces, Georgia, serif" fontWeight="600" fontSize="30" fill="var(--ga-ink)" transform="rotate(-8 48 58)">A</text>
    <circle cx="112" cy="58" r="12" fill="var(--ga-b)" transform="rotate(8 112 58)" />
  </>,
  cloud: () => <>
    <path d="M44 92c-14 0-24-10-24-22s10-22 22-22c4-14 16-24 32-24 18 0 32 12 34 28 2-1 6-2 10-2 12 0 22 10 22 22s-10 20-22 20z" fill="var(--ga-a)" />
    <g fontFamily="Karla, system-ui, sans-serif" fontWeight="800" fill="var(--ga-b)"><text x="40" y="60" fontSize="14">park</text><text x="78" y="52" fontSize="20">zoo</text><text x="62" y="82" fontSize="16">bank</text><text x="106" y="80" fontSize="13">shop</text></g>
  </>,
};
