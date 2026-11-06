// How a multiple-choice question is answered. Cards: tap one. Whack a mole: answers ride on moles that
// pop up and hide again, so you have to catch the right one. Pop a balloon: answers float up on
// balloons that drift in the wind. On the big screen the moles and balloons play on their own for show.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Shape, answerStyle } from './Stage';

export type Skin = 'cards' | 'moles' | 'balloons';
export const SKIN_NAMES: Record<Skin, string> = { cards: 'Tap a card', moles: 'Whack a mole', balloons: 'Pop a balloon' };
export const SKIN_ABOUT: Record<Skin, string> = {
  cards: 'Answers on cards. Learners tap one.',
  moles: 'Answers ride on moles that pop up and hide again. Learners catch the right one.',
  balloons: 'Answers float up on balloons that drift in the wind. Learners pop the right one.',
};

type Props = { skin: Skin; options: string[]; onPick?: (i: number) => void; disabled?: boolean; picked?: number[]; display?: boolean; big?: boolean };
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AnswerPad(props: Props) {
  const still = reduced();
  if (props.skin === 'moles' && !still) return <Moles {...props} />;
  if (props.skin === 'balloons' && !still) return <Balloons {...props} />;
  return <Cards {...props} />;
}

export function Cards({ options, onPick, disabled, picked = [], display, big }: Props) {
  return (
    <div className={'qz-cards n' + options.length + (big ? ' big' : '')} role={display ? undefined : 'group'} aria-label={display ? undefined : 'Answers'}>
      {options.map((o, i) =>
        display ? (
          <div key={i} className="qz-card" style={answerStyle(i)}>
            <Shape i={i} size={big ? 46 : 34} />
            <span className="qz-card-text">{o}</span>
          </div>
        ) : (
          <button key={i} type="button" className={'qz-card' + (picked.includes(i) ? ' picked' : '')} style={answerStyle(i)} disabled={disabled} aria-pressed={picked.includes(i) || undefined} onClick={() => onPick?.(i)}>
            <Shape i={i} size={big ? 46 : 34} />
            <span className="qz-card-text">{o}</span>
          </button>
        ),
      )}
    </div>
  );
}

// ---- Whack a mole -------------------------------------------------------------------------------------
type MoleState = { hole: number; up: boolean; until: number };
function Moles({ options, onPick, disabled, display }: Props) {
  const holes = options.length > 4 ? 9 : 6;
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const [moles, setMoles] = useState<MoleState[]>(() => options.map((_, i) => ({ hole: i, up: false, until: performance.now() + rand(150, 900) + i * 120 })));
  const [bonk, setBonk] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      setMoles((cur) => {
        let changed = false;
        const next = cur.map((m) => ({ ...m }));
        next.forEach((m, i) => {
          if (now < m.until) return;
          changed = true;
          if (m.up) {
            // Duck down for a moment.
            m.up = false;
            m.until = now + rand(500, 1300);
          } else {
            // Pop up in a free hole, for a short while.
            const taken = new Set(next.filter((x, k) => k !== i && x.up).map((x) => x.hole));
            const free = Array.from({ length: holes }, (_, h) => h).filter((h) => !taken.has(h) && h !== m.hole);
            m.hole = free[Math.floor(Math.random() * free.length)] ?? m.hole;
            m.up = true;
            m.until = now + rand(1200, 2100);
          }
        });
        return changed ? next : cur;
      });
    }, 90);
    return () => clearInterval(id);
  }, [holes]); // eslint-disable-line react-hooks/exhaustive-deps
  const byHole = new Map<number, number>(moles.map((m, i) => [m.hole, i] as [number, number]));
  return (
    <div className={'qz-moles h' + holes} role={display ? undefined : 'group'} aria-label={display ? undefined : 'Answers: catch the mole with the right answer'}>
      {Array.from({ length: holes }, (_, h) => {
        const i = byHole.get(h);
        const m = i === undefined ? null : moles[i];
        const up = !!m?.up;
        return (
          <div key={h} className="qz-hole">
            {i !== undefined && (
              <button
                type="button"
                className={'qz-mole' + (up ? ' up' : '') + (bonk === i ? ' bonk' : '')}
                style={answerStyle(i)}
                tabIndex={up && !display ? 0 : -1}
                disabled={disabled || display || !up}
                aria-hidden={!up}
                aria-label={options[i]}
                onClick={() => {
                  if (!up || disabled || display) return;
                  setBonk(i);
                  setTimeout(() => onPick?.(i), 220);
                }}
              >
                <span className="qz-mole-sign">
                  <Shape i={i} size={22} />
                  <span>{options[i]}</span>
                </span>
                <span className="qz-mole-body" aria-hidden="true">
                  <i className="e1" />
                  <i className="e2" />
                  <i className="n" />
                </span>
              </button>
            )}
            <span className="qz-hole-rim" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

// ---- Pop a balloon --------------------------------------------------------------------------------------
function Balloons({ options, onPick, disabled, display }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [popped, setPopped] = useState<number | null>(null);
  // Each balloon rises at its own speed and sways; a shared wind pushes them all now and then.
  const motion = useMemo(() => options.map((_, i) => ({ rise: 8.5 + ((i * 1.7) % 3.5), phase: (i / options.length + Math.random() * 0.15) % 1, sway: 0.6 + Math.random() * 0.6, swayPhase: Math.random() * 6.28 })), [options.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const el = box.current;
      if (el) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        const wind = Math.sin(t * 0.21) * 0.09 + Math.sin(t * 0.67 + 1.3) * 0.04;
        motion.forEach((m, i) => {
          const b = refs.current[i];
          if (!b) return;
          const p = (t / m.rise + m.phase) % 1;
          const base = (i + 0.5) / options.length;
          let x = base + Math.sin(t * m.sway + m.swayPhase) * 0.07 + wind;
          x = ((x % 1) + 1) % 1; // blown off one side, back in on the other
          const y = h + 40 - p * (h + 260);
          b.style.transform = `translate(${x * w - b.offsetWidth / 2}px, ${y}px) rotate(${Math.sin(t * 1.3 + i) * 6}deg)`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [motion, options.length]);
  return (
    <div ref={box} className="qz-balloons" role={display ? undefined : 'group'} aria-label={display ? undefined : 'Answers: pop the balloon with the right answer'}>
      {options.map((o, i) => (
        <button
          key={i}
          ref={(el) => (refs.current[i] = el)}
          type="button"
          className={'qz-balloon' + (popped === i ? ' popped' : '')}
          style={answerStyle(i)}
          disabled={disabled || display || popped !== null}
          aria-label={o}
          onClick={() => {
            if (disabled || display || popped !== null) return;
            setPopped(i);
            setTimeout(() => onPick?.(i), 260);
          }}
        >
          <span className="qz-balloon-body" aria-hidden="true">
            <b>{'ABCDEF'[i]}</b>
          </span>
          <span className="qz-balloon-string" aria-hidden="true" />
          <span className="qz-balloon-tag">{o}</span>
        </button>
      ))}
    </div>
  );
}
