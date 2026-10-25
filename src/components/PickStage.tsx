import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { PickState } from '../lib/questions';

// Learner view of a "draw a card" activity: a pile of cards, a wheel, or boxes to open.

type Mode = 'cards' | 'wheel' | 'boxes';
export type PickLook = 'graphite' | 'ivory' | 'theme' | 'midnight';
export const PICK_LOOKS: { key: PickLook; label: string; sw: [string, string] }[] = [
  { key: 'graphite', label: 'Graphite', sw: ['#2f2e2d', 'var(--accent)'] },
  { key: 'ivory', label: 'Ivory', sw: ['#f3f1ec', '#3a3936'] },
  { key: 'theme', label: 'Class colour', sw: ['var(--accent)', '#ffffff'] },
  { key: 'midnight', label: 'Midnight', sw: ['#1f2b44', '#c9a45c'] },
];
export const PICK_SYMBOLS = ['✦', '?', '!', '★', '♣', '♥', '✎', ''];

type Props = {
  look?: PickLook;
  symbol?: string;
  mode: Mode;
  repeat: boolean;
  titles: string[]; // one per card
  state: PickState;
  seq?: number; // changes on every shared draw, so every screen animates
  drawnBy?: string;
  canDraw: boolean;
  waitingText?: string; // shown when this person can't draw
  onDraw: (next: PickState) => void;
  onReset?: () => void;
  renderCard: (i: number) => ReactNode;
};

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const rnd = (n: number) => Math.floor(Math.random() * n);
const cardName = (titles: string[], i: number) => titles[i]?.trim() || `Card ${i + 1}`;

export function PickStage({ look = 'graphite', symbol = '✦', mode, repeat, titles, state, seq, drawnBy, canDraw, waitingText, onDraw, onReset, renderCard }: Props) {
  const n = titles.length;
  const drawn: number[] = [];
  for (const x of state.h) if (!drawn.includes(x) && x < n) drawn.push(x);
  const current = state.h.length ? state.h[state.h.length - 1] : undefined;
  const remaining = repeat ? n : n - drawn.length;
  const [view, setView] = useState<number | undefined>(current);
  const [busy, setBusy] = useState(false); // animation running
  const [revealed, setRevealed] = useState(true); // result card visible (hidden while the wheel spins)
  const shown = view ?? current;

  // Animate whenever a new draw arrives (own draw or someone else's in a shared pile).
  const prev = useRef({ len: state.h.length, seq });
  const [animKey, setAnimKey] = useState(0);
  useEffect(() => {
    const p = prev.current;
    const changed = state.h.length > p.len || (seq !== undefined && seq !== p.seq && state.h.length >= p.len && state.h.length > 0);
    prev.current = { len: state.h.length, seq };
    setView(current);
    if (changed && current !== undefined) setAnimKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.h.length, seq]);

  function pickCard(): number | null {
    if (!n) return null;
    const pool = repeat ? [...Array(n).keys()] : [...Array(n).keys()].filter((i) => !drawn.includes(i));
    if (!pool.length) return null;
    // Avoid the very same card twice in a row when repeats are allowed.
    const fair = repeat && pool.length > 1 && current !== undefined ? pool.filter((i) => i !== current) : pool;
    return fair[rnd(fair.length)];
  }

  function draw(box?: number) {
    if (!canDraw || busy) return;
    const c = pickCard();
    if (c === null) return;
    onDraw({ h: [...state.h, c], b: box === undefined ? state.b : [...state.b, box] });
  }

  const common = { busy, setBusy, revealed, setRevealed, animKey };
  const result =
    shown !== undefined ? (
      <ResultCard key={'r' + animKey + ':' + shown} title={cardName(titles, shown)} by={drawnBy && shown === current ? drawnBy : undefined} hidden={!revealed} pop={animKey > 0 && shown === current}>
        {renderCard(shown)}
      </ResultCard>
    ) : null;

  return (
    <div className={'pk pk-' + mode + ' look-' + look} style={{ ['--pk-symbol' as string]: JSON.stringify(symbol ?? '') }}>
      {mode === 'cards' && <Deck {...common} n={n} remaining={remaining} repeat={repeat} canDraw={canDraw} onDraw={() => draw()} current={current} result={result} />}
      {mode === 'wheel' && <Wheel {...common} titles={titles} drawn={repeat ? [] : drawn} current={current} canDraw={canDraw && remaining > 0} onSpin={() => draw()} result={result} />}
      {mode === 'boxes' && <Boxes {...common} n={n} repeat={repeat} opened={state.b} lastBox={state.b[state.b.length - 1]} canDraw={canDraw && remaining > 0} onOpen={(b) => draw(b)} result={result} />}

      <div className="pk-foot">
        {!canDraw && waitingText && remaining > 0 && <span className="pk-wait">{waitingText}</span>}
        {!repeat && n > 0 && remaining === 0 && mode !== 'cards' && <span className="pk-wait">All {n} cards have been drawn.</span>}
        {drawn.length > 1 && (
          <span className="pk-history" aria-label="Cards drawn so far">
            <span className="hint">Drawn</span>
            {drawn.map((i) => (
              <button key={i} type="button" className={'pk-chip' + (shown === i ? ' on' : '')} onClick={() => (setView(i), setRevealed(true))}>
                {cardName(titles, i)}
              </button>
            ))}
          </span>
        )}
        {onReset && state.h.length > 0 && (
          <button type="button" className="btn link small pk-reset" onClick={onReset}>
            Put all the cards back
          </button>
        )}
      </div>
    </div>
  );
}

function ResultCard({ title, by, children, hidden, pop }: { title: string; by?: string; children: ReactNode; hidden?: boolean; pop?: boolean }) {
  return (
    <div className={'pk-card' + (pop ? ' pop' : '') + (hidden ? ' is-hidden' : '')} aria-live="polite">
      <div className="pk-card-head">
        <span className="pk-card-title">{title}</span>
        {by && <span className="pk-by">Drawn by {by}</span>}
      </div>
      <div className="pk-card-body">{children}</div>
    </div>
  );
}

type Common = { busy: boolean; setBusy: (b: boolean) => void; revealed: boolean; setRevealed: (b: boolean) => void; animKey: number; result: ReactNode };

// Cards ---------------------------------------------------------------------------

function Deck({ n, remaining, repeat, canDraw, onDraw, current, result, animKey, setBusy, busy }: Common & { n: number; remaining: number; repeat: boolean; canDraw: boolean; onDraw: () => void; current?: number }) {
  const deckRef = useRef<HTMLButtonElement>(null);
  const flipRef = useRef<HTMLDivElement>(null);
  const empty = !repeat && remaining === 0;
  const layers = Math.min(5, Math.max(1, repeat ? 5 : remaining));

  useLayoutEffect(() => {
    if (!animKey || !flipRef.current || !deckRef.current || reduceMotion()) return;
    const d = deckRef.current.getBoundingClientRect();
    const f = flipRef.current.getBoundingClientRect();
    const dx = d.left + d.width / 2 - (f.left + f.width / 2);
    const dy = d.top + d.height / 2 - (f.top + Math.min(f.height, 260) / 2);
    const s = Math.min(1, d.width / f.width);
    setBusy(true);
    const a = flipRef.current.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) rotateY(180deg) rotateZ(-5deg) scale(${s})`, offset: 0 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 70}px) rotateY(95deg) rotateZ(3deg) scale(${(s + 1) / 2 + 0.05})`, offset: 0.5 },
        { transform: 'translate(0, 0) rotateY(0deg) rotateZ(0deg) scale(1)', offset: 1 },
      ],
      { duration: 1000, easing: 'cubic-bezier(.2,.85,.25,1)' },
    );
    a.onfinish = () => setBusy(false);
    a.oncancel = () => setBusy(false);
    deckRef.current.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px) rotate(-1deg)' }, { transform: 'translateY(0)' }], { duration: 400, easing: 'ease-out' });
    return () => a.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey]);

  return (
    <div className="pk-table">
      <div className="pk-deck-col">
        <button ref={deckRef} type="button" className={'pk-deck' + (empty ? ' empty' : '') + (canDraw && !empty ? ' can' : '')} disabled={!canDraw || empty || busy} onClick={onDraw} aria-label={empty ? 'No cards left' : 'Draw a card'}>
          {empty ? (
            <span className="pk-empty">
              <span className="pk-empty-mark" aria-hidden="true">✦</span>
              All drawn
            </span>
          ) : (
            [...Array(layers)].map((_, i) => <span key={i} className="pk-back" style={{ ['--i' as string]: layers - 1 - i }} aria-hidden="true" />)
          )}
        </button>
        <span className="pk-deck-label">{empty ? '' : canDraw ? (current === undefined ? 'Tap the pile to draw' : 'Draw another') : repeat ? `${n} cards` : `${remaining} left`}</span>
      </div>
      <div className="pk-slot">
        {result ? (
          <div ref={flipRef} className="pk-flip" key={animKey}>
            <div className="pk-face-front">{result}</div>
            <span className="pk-face-back" aria-hidden="true" />
          </div>
        ) : (
          <div className="pk-placeholder">The card you draw appears here</div>
        )}
      </div>
    </div>
  );
}

// Wheel ---------------------------------------------------------------------------

const SPIN_MS = 4600;

function Wheel({ titles, drawn, current, canDraw, onSpin, result, animKey, setBusy, busy, setRevealed }: Common & { titles: string[]; drawn: number[]; current?: number; canDraw: boolean; onSpin: () => void }) {
  const n = Math.max(1, titles.length);
  const seg = 360 / n;
  const restFor = (c: number) => -((c + 0.5) * seg);
  const [rot, setRot] = useState(() => (current === undefined ? 0 : restFor(current)));
  const [spinning, setSpinning] = useState(false);
  const [win, setWin] = useState<number | undefined>(current);

  useEffect(() => {
    if (!animKey || current === undefined) return;
    if (reduceMotion()) {
      setRot(restFor(current));
      setWin(current);
      return;
    }
    const jitter = (Math.random() - 0.5) * seg * 0.6;
    const target = restFor(current) - jitter;
    setRot((r) => {
      const delta = (((target - r) % 360) + 360) % 360;
      return r + 360 * 6 + delta;
    });
    setSpinning(true);
    setBusy(true);
    setRevealed(false);
    setWin(undefined);
    const t = window.setTimeout(() => {
      setSpinning(false);
      setBusy(false);
      setWin(current);
      setRevealed(true);
    }, SPIN_MS + 80);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey]);

  const R = 100;
  const pt = (deg: number, r = R) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const fills = ['var(--pk-f1)', 'var(--pk-f2)', 'var(--pk-f3)'];

  return (
    <div className="pk-wheel-layout">
      <div className={'pk-wheel-wrap' + (spinning ? ' spinning' : '')}>
        <span className="pk-pointer" aria-hidden="true" />
        <svg className="pk-wheel-svg" viewBox="-104 -104 208 208" style={{ transform: `rotate(${rot}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.72,.08,1)` : 'none' }} aria-hidden="true">
          <circle r="103" fill="var(--pk-f1)" stroke="var(--pk-rim)" strokeWidth="3" />
          {titles.map((t, i) => {
            const a0 = i * seg;
            const a1 = (i + 1) * seg;
            const [x0, y0] = pt(a0);
            const [x1, y1] = pt(a1);
            const large = seg > 180 ? 1 : 0;
            const d = n === 1 ? undefined : `M0 0 L${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
            const used = drawn.includes(i) && i !== current;
            const mid = a0 + seg / 2;
            const label = (t.trim() || String(i + 1)).slice(0, 16);
            const fill = n % 3 === 1 && i === n - 1 && n > 1 ? fills[1] : fills[i % 3];
            return (
              <g key={i} className={'pk-seg' + (used ? ' used' : '') + (win === i ? ' win' : '')}>
                {d ? <path d={d} fill={fill} stroke="var(--pk-line)" strokeWidth="0.6" /> : <circle r={R} fill={fills[0]} />}
                <text transform={`rotate(${mid}) translate(0 ${-R * 0.64})`} textAnchor="middle" dominantBaseline="middle" className="pk-seg-label" style={{ fontSize: n > 10 ? 7 : n > 6 ? 8.5 : 10 }}>
                  {label}
                </text>
              </g>
            );
          })}
          {titles.map((_, i) => {
            const [x, y] = pt(i * seg, 97);
            return <circle key={'p' + i} cx={x} cy={y} r="1.8" fill="var(--pk-peg)" />;
          })}
        </svg>
        <button type="button" className="pk-hub" disabled={!canDraw || busy} onClick={onSpin}>
          {busy ? '' : 'Spin'}
        </button>
      </div>
      <div className="pk-wheel-result">{result ?? <div className="pk-placeholder">{canDraw ? 'Press Spin' : 'Waiting for the wheel'}</div>}</div>
    </div>
  );
}

// Boxes ---------------------------------------------------------------------------

function Boxes({ n, repeat, opened, lastBox, canDraw, onOpen, result, animKey, setBusy, busy, setRevealed }: Common & { n: number; repeat: boolean; opened: number[]; lastBox?: number; canDraw: boolean; onOpen: (b: number) => void }) {
  const [opening, setOpening] = useState<number | null>(null);
  useEffect(() => {
    if (!animKey || lastBox === undefined) return;
    if (reduceMotion()) return;
    setOpening(lastBox);
    setBusy(true);
    setRevealed(false);
    const t1 = window.setTimeout(() => setRevealed(true), 900);
    const t2 = window.setTimeout(() => {
      setOpening(null);
      setBusy(false);
    }, 1300);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey]);

  const isOpen = (b: number) => (repeat ? b === lastBox : opened.includes(b));
  return (
    <div className="pk-boxes-layout">
      <div className="pk-boxes" style={{ ['--cols' as string]: Math.min(n, n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5) }}>
        {[...Array(n)].map((_, b) => {
          const open = isOpen(b) && opening !== b;
          const anim = opening === b;
          const usable = canDraw && !busy && (repeat || !opened.includes(b));
          return (
            <button key={b} type="button" className={'pk-box' + (open ? ' open' : '') + (anim ? ' opening' : '') + (usable ? ' can' : '')} disabled={!usable} onClick={() => onOpen(b)} aria-label={open ? `Box ${b + 1}, opened` : `Open box ${b + 1}`}>
              <span className="pk-box-lid" aria-hidden="true">
                <span className="pk-bow" />
              </span>
              <span className="pk-box-body" aria-hidden="true">
                <span className="pk-box-n">{b + 1}</span>
              </span>
              {anim && (
                <span className="pk-burst" aria-hidden="true">
                  {[...Array(16)].map((_, k) => {
                    const ang = (k / 16) * Math.PI * 2 + Math.random() * 0.3;
                    const dist = 50 + Math.random() * 40;
                    return <i key={k} style={{ ['--dx' as string]: `${Math.cos(ang) * dist}px`, ['--dy' as string]: `${Math.sin(ang) * dist - 30}px`, ['--r' as string]: `${rnd(360)}deg`, ['--d' as string]: `${rnd(120)}ms` }} />;
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="pk-boxes-result">{result ?? <div className="pk-placeholder">{canDraw ? 'Choose a box to open' : 'Waiting for a box to be opened'}</div>}</div>
    </div>
  );
}
