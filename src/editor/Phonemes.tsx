import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { usePopPos } from './usePopPos';
import { CHARTS, findSound, howMade, KIND_NAME, type Accent, type Phoneme } from '../lib/phonemes';
import { playSound } from '../lib/phonAudio';
import { auth } from '../lib/firebase';
import '../lib/extras.css';

// The phonemic chart and sound cards, inline in any text. Single vowels, diphthongs and
// consonants each have their own colour, the same on the chart and on every card, and a tap
// plays the sound.

export type ChartPart = 'all' | 'vowels' | 'diphs' | 'cons';
export type CardKind = 'sound' | 'how';

function usePlay(accent: Accent, by?: string) {
  const [on, setOn] = useState('');
  const [none, setNone] = useState('');
  const play = async (p: Phoneme) => {
    setOn(p.id);
    const ok = await playSound(accent, p.id, by);
    window.setTimeout(() => setOn((x) => (x === p.id ? '' : x)), 650);
    if (!ok) {
      setNone(p.id);
      window.setTimeout(() => setNone((x) => (x === p.id ? '' : x)), 1600);
    }
  };
  return { on, none, play };
}

// The example word with the letters for the sound in bold: "shEEp" → sh<b>ee</b>p.
export function Example({ ex }: { ex: string }) {
  const parts = ex.split(/([A-Z]+)/).filter(Boolean);
  return (
    <span className="ph-ex">
      {parts.map((s, i) => (/^[A-Z]+$/.test(s) ? <b key={i}>{s.toLowerCase()}</b> : <span key={i}>{s}</span>))}
    </span>
  );
}

function Tile({ p, onPlay, playing, none }: { p: Phoneme; onPlay: (p: Phoneme) => void; playing: boolean; none: boolean }) {
  return (
    <button type="button" className={`ph-tile k-${p.kind}` + (p.kind === 'cons' && !p.voiced ? ' unvoiced' : '') + (playing ? ' playing' : '')} onClick={(e) => (e.preventDefault(), e.stopPropagation(), onPlay(p))} title={none ? 'No recording yet' : `/${p.sym}/ as in ${p.ex.toLowerCase()}`} aria-label={`Sound /${p.sym}/, as in ${p.ex.toLowerCase()}`}>
      <span className="ph-sym">{p.sym}</span>
      <Example ex={p.ex} />
      {none && <span className="ph-none">no recording yet</span>}
    </button>
  );
}

export function PhonChart({ accent = 'RP', part = 'all', by }: { accent?: Accent; part?: ChartPart; by?: string }) {
  const ch = CHARTS[accent] ?? CHARTS.RP;
  const { on, none, play } = usePlay(accent, by);
  const grid = (rows: Phoneme[][], cls: string) => (
    <span className={'ph-grid ' + cls}>
      {rows.map((r, i) => (
        <span key={i} className="ph-row">
          {r.map((p) => (
            <Tile key={p.id} p={p} onPlay={play} playing={on === p.id} none={none === p.id} />
          ))}
        </span>
      ))}
    </span>
  );
  return (
    <span className={'ph-chart part-' + part} role="group" aria-label={`Phonemic chart, ${ch.name}`}>
      <span className="ph-chart-head">
        <span className="ph-chart-title">The sounds of English</span>
        <span className="ph-chart-acc">{ch.name}</span>
      </span>
      {(part === 'all' || part === 'vowels' || part === 'diphs') && (
        <span className="ph-top">
          {(part === 'all' || part === 'vowels') && (
            <span className="ph-sec">
              <span className="ph-sec-h k-mono">Single vowels</span>
              {grid(ch.vowels, 'g-mono')}
            </span>
          )}
          {(part === 'all' || part === 'diphs') && (
            <span className="ph-sec">
              <span className="ph-sec-h k-diph">Diphthongs</span>
              {grid(ch.diphs, 'g-diph')}
            </span>
          )}
        </span>
      )}
      {(part === 'all' || part === 'cons') && (
        <span className="ph-sec">
          <span className="ph-sec-h k-cons">
            Consonants <span className="ph-key"><i className="unvoiced" /> voiceless <i /> voiced</span>
          </span>
          {grid(ch.cons, 'g-cons')}
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ diagrams

// Where the sound is made, on a side view of the head (facing left).
const PLACES: Record<string, [number, number][]> = {
  bilabial: [[37, 70]],
  labiodental: [[42, 71]],
  dental: [[46, 67]],
  alveolar: [[51, 61]],
  postalveolar: [[58, 58]],
  palatal: [[74, 55]],
  velar: [[93, 58]],
  'labial-velar': [[37, 70], [93, 58]],
  glottal: [[106, 127]],
};
// The tongue for each place: where it rises.
const TONGUE: Record<string, string> = {
  rest: 'M48 76 C 56 69, 72 64, 86 65 C 97 66, 103 74, 103 86 C 103 98, 101 110, 102 120',
  dental: 'M46 70 C 54 66, 72 64, 86 65 C 97 66, 103 74, 103 86 C 103 98, 101 110, 102 120',
  alveolar: 'M49 76 C 49 66, 53 62, 60 63 C 72 65, 92 66, 100 74 C 104 82, 102 100, 102 120',
  postalveolar: 'M49 77 C 51 68, 56 61, 64 61 C 76 62, 94 66, 100 74 C 104 82, 102 100, 102 120',
  palatal: 'M49 78 C 54 70, 64 59, 76 58 C 88 58, 98 66, 101 76 C 104 88, 102 104, 102 120',
  velar: 'M49 78 C 58 74, 72 70, 82 64 C 88 60, 95 60, 99 66 C 104 76, 102 100, 102 120',
};
const tongueFor = (p: Phoneme) => (p.kind === 'cons' ? TONGUE[p.place === 'labial-velar' ? 'velar' : p.place!] ?? TONGUE.rest : TONGUE.rest);

function MannerMark({ p }: { p: Phoneme }) {
  const m = p.manner ?? '';
  if (m === 'nasal') return <path className="ph-air" d="M70 49 C 56 48, 42 49, 22 46 M28 41.5 L21.5 46 L28 50.5" />;
  if (m === 'plosive' || m === 'affricate')
    return (
      <g className="ph-air">
        <path d="M28 64 L18 59 M27 70 L14 70 M28 76 L18 81" />
        {m === 'affricate' && <path d="M8 90 q 2.5 -3 5 0 t 5 0 t 5 0" />}
      </g>
    );
  if (m === 'fricative') return <path className="ph-air" d="M26 64 q 2.5 -3 5 0 t 5 0 M18 70 q 2.5 -3 5 0 t 5 0 t 5 0 M26 76 q 2.5 -3 5 0 t 5 0" />;
  if (m === 'lateral approximant') return <path className="ph-air" d="M64 74 C 58 82, 46 86, 26 86 M31 82 L25.5 86 L31 90" />;
  return <path className="ph-air" d="M30 70 C 24 70, 20 70, 13 70 M18.5 66 L13 70 L18.5 74" />;
}

export function MouthSvg({ p }: { p: Phoneme }) {
  const voiced = p.kind !== 'cons' || p.voiced;
  const places = p.kind === 'cons' ? PLACES[p.place!] ?? [] : [];
  return (
    <svg className={'ph-mouth k-' + p.kind} viewBox="0 0 150 150" role="img" aria-label={p.kind === 'cons' ? `${p.place}, ${p.manner}` : 'Tongue position'}>
      {/* the head, facing left */}
      <path className="ph-skin" d="M64 4 C 56 12, 52 20, 52 28 C 52 34, 49 38, 44 44 L 34 52 C 31 55, 33 58, 38 58 L 44 58 C 42 61, 38 63, 35 66 C 37 68, 39 69, 40 70 C 37 71, 35 73, 36 75 C 39 78, 42 79, 43 81 C 40 86, 39 91, 41 95 C 44 100, 52 102, 62 104 C 70 106, 74 112, 76 124 L 78 146 L 128 146 L 128 4 Z" />
      <path className="ph-face" d="M64 4 C 56 12, 52 20, 52 28 C 52 34, 49 38, 44 44 L 34 52 C 31 55, 33 58, 38 58 L 44 58 C 42 61, 38 63, 35 66 C 37 68, 39 69, 40 70 C 37 71, 35 73, 36 75 C 39 78, 42 79, 43 81 C 40 86, 39 91, 41 95 C 44 100, 52 102, 62 104 C 70 106, 74 112, 76 124 L 78 146" />
      {/* nose passage, roof of the mouth with the soft palate, back of the throat, floor of the mouth */}
      <path className="ph-in" d="M42 53 C 60 50, 84 47, 104 49 C 110 50, 112 54, 112 58" />
      <path className="ph-roof" d="M44 63 C 47 61, 49 59, 53 58 C 62 55, 78 53, 88 54 C 96 55, 102 60, 104 67 L 103 71" />
      <path className="ph-in" d="M112 58 C 114 80, 113 110, 110 142" />
      <path className="ph-in" d="M45 79 C 50 86, 58 92, 70 95 C 84 98, 94 104, 98 116" />
      {/* teeth */}
      <path className="ph-teeth" d="M43.5 62 L 45.5 68 L 48 62.5 Z M44.5 79 L 46.5 73 L 49 78.5 Z" />
      {/* tongue */}
      <path className="ph-tongue" d={tongueFor(p)} />
      {/* voice box */}
      {voiced ? <path className="ph-voice" d="M100 128 l 2.5 -4 l 2.5 4 l 2.5 -4 l 2.5 4 l 2.5 -4" /> : <path className="ph-voice off" d="M100 126 h 13" />}
      {places.map(([x, y], i) => (
        <g key={i}>
          <circle className="ph-place-glow" cx={x} cy={y} r="8" />
          <circle className="ph-place" cx={x} cy={y} r="3.6" />
        </g>
      ))}
      {p.kind === 'cons' && <MannerMark p={p} />}
    </svg>
  );
}

// Vowels: where the tongue is, on the vowel space (front on the left, close at the top).
export function VowelSpace({ p }: { p: Phoneme }) {
  const pt = (h: number, b: number): [number, number] => {
    const y = 14 + (h / 3) * 82;
    const left = 16 + (h / 3) * 40;
    return [left + (b / 2) * (138 - left), y];
  };
  const [x, y] = pt(p.height ?? 0, p.back ?? 0);
  const end = p.to ? pt(p.to[0], p.to[1]) : null;
  return (
    <svg className={'ph-vspace k-' + p.kind} viewBox="-24 0 174 108" role="img" aria-label="Where the tongue is">
      <path className="ph-quad" d="M16 14 H138 V96 H56 Z" />
      <path className="ph-quad-in" d="M29.7 41.3 H138 M43.3 68.7 H138 M77 14 L 97 96" />
      <text className="ph-ax" x="16" y="8">front</text>
      <text className="ph-ax" x="138" y="8" textAnchor="end">back</text>
      <text className="ph-ax" x="12" y="17" textAnchor="end">close</text>
      <text className="ph-ax" x="52" y="99" textAnchor="end">open</text>
      {end && (
        <>
          <defs>
            <marker id={'ph-ah-' + p.id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M1 1 L9 5 L1 9 z" className="ph-ah" />
            </marker>
          </defs>
          <path className="ph-glide" d={`M${x} ${y} L${end[0]} ${end[1]}`} markerEnd={`url(#ph-ah-${p.id})`} />
        </>
      )}
      <circle className="ph-dot-glow" cx={x} cy={y} r="10" />
      <circle className="ph-dot" cx={x} cy={y} r="5" />
    </svg>
  );
}

function Lips({ round }: { round?: boolean }) {
  return (
    <svg className="ph-lips" viewBox="0 0 40 24" aria-hidden="true">
      {round ? <ellipse cx="20" cy="12" rx="9" ry="8" /> : <path d="M3 12 C 12 5, 28 5, 37 12 C 28 19, 12 19, 3 12 Z" />}
    </svg>
  );
}

export function SoundCard({ p, accent, by, kind = 'sound' }: { p: Phoneme; accent: Accent; by?: string; kind?: CardKind }) {
  const { on, none, play } = usePlay(accent, by);
  return (
    <span className={`ph-card k-${p.kind}` + (kind === 'how' ? ' how' : '') + (p.kind === 'cons' && !p.voiced ? ' unvoiced' : '')}>
      <button type="button" className={'ph-card-main' + (on ? ' playing' : '')} onClick={(e) => (e.preventDefault(), e.stopPropagation(), play(p))} aria-label={`Play /${p.sym}/`}>
        <span className="ph-card-kind">{KIND_NAME[p.kind]}{p.kind === 'cons' ? (p.voiced ? ' · voiced' : ' · voiceless') : p.long ? ' · long' : ''}</span>
        <span className="ph-card-sym">/{p.sym}/</span>
        <Example ex={p.ex} />
        <span className="ph-card-play" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
          {none ? 'No recording yet' : 'Listen'}
        </span>
      </button>
      {kind === 'how' && (
        <span className="ph-how">
          {p.kind === 'cons' ? <MouthSvg p={p} /> : (
            <span className="ph-vbox">
              <VowelSpace p={p} />
              <span className="ph-lipset">
                <Lips round={p.round} />
                {p.kind === 'diph' && (
                  <>
                    <span className="ph-to">→</span>
                    <Lips round={p.toRound} />
                  </>
                )}
              </span>
            </span>
          )}
          {p.kind === 'cons' && (
            <span className="ph-tags">
              <span>{p.place}</span>
              <span>{p.manner}</span>
            </span>
          )}
          <span className="ph-steps">
            {howMade(p).map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </span>
        </span>
      )}
    </span>
  );
}

// ------------------------------------------------------------------ in the editor

function Picker({ accent, value, onPick }: { accent: Accent; value?: string; onPick: (p: Phoneme) => void }) {
  const ch = CHARTS[accent];
  const rows = [...ch.vowels, ...ch.diphs, ...ch.cons];
  return (
    <span className="ph-picker">
      {rows.map((r, i) => (
        <span key={i} className="ph-pick-row">
          {r.map((p) => (
            <button key={p.id} type="button" className={`ph-pick k-${p.kind}` + (value === p.id ? ' on' : '')} onClick={() => onPick(p)} title={p.ex.toLowerCase()}>
              {p.sym}
            </button>
          ))}
        </span>
      ))}
    </span>
  );
}

function AccentSeg({ v, set }: { v: Accent; set: (a: Accent) => void }) {
  return (
    <span className="seg small-seg" role="radiogroup" aria-label="Accent">
      {(['RP', 'GA'] as const).map((a) => (
        <button key={a} type="button" role="radio" aria-checked={v === a} className={v === a ? 'on' : ''} onClick={() => set(a)}>
          {CHARTS[a].name}
        </button>
      ))}
    </span>
  );
}

function usePop(initial: boolean) {
  const [open, setOpen] = useState(initial);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return { open, setOpen, ref };
}

function ChartView({ node, updateAttributes, selected }: NodeViewProps) {
  const { open, setOpen, ref } = usePop(false);
  const style = usePopPos(ref, open, 320);
  const a = node.attrs as { accent: Accent; part: ChartPart; by: string };
  return (
    <NodeViewWrapper as="span" className={'ph-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <span contentEditable={false} onDoubleClick={() => setOpen(true)}>
        <PhonChart accent={a.accent} part={a.part} by={a.by} />
        <button type="button" className="ph-edit" onClick={() => setOpen((o) => !o)} aria-label="Chart settings">
          Edit
        </button>
      </span>
      {open && (
        <span className="gap-pop ph-pop" contentEditable={false} style={style}>
          <span className="pop-type">Phonemic chart</span>
          <AccentSeg v={a.accent} set={(v) => updateAttributes({ accent: v })} />
          <span className="seg small-seg" role="radiogroup" aria-label="Which sounds">
            {([
              ['all', 'All'],
              ['vowels', 'Single vowels'],
              ['diphs', 'Diphthongs'],
              ['cons', 'Consonants'],
            ] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={a.part === k} className={a.part === k ? 'on' : ''} onClick={() => updateAttributes({ part: k })}>
                {l}
              </button>
            ))}
          </span>
          <span className="hint">Learners tap a sound to hear it.</span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

function CardView({ node, updateAttributes, selected }: NodeViewProps) {
  const a = node.attrs as { sound: string; accent: Accent; kind: CardKind; by: string };
  const { open, setOpen, ref } = usePop(!a.sound);
  const style = usePopPos(ref, open, 330);
  const p = a.sound ? findSound(a.accent, a.sound) : undefined;
  return (
    <NodeViewWrapper as="span" className={'ph-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <span contentEditable={false}>
        {p ? <SoundCard p={p} accent={a.accent} by={a.by} kind={a.kind} /> : <span className="ph-card ph-empty">Choose a sound</span>}
        <button type="button" className="ph-edit" onClick={() => setOpen((o) => !o)} aria-label="Card settings">
          Edit
        </button>
      </span>
      {open && (
        <span className="gap-pop ph-pop" contentEditable={false} style={style}>
          <span className="pop-type">Sound card</span>
          <AccentSeg v={a.accent} set={(v) => updateAttributes({ accent: v })} />
          <span className="seg small-seg" role="radiogroup" aria-label="Card">
            {([
              ['sound', 'The sound'],
              ['how', 'How it is made'],
            ] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={a.kind === k} className={a.kind === k ? 'on' : ''} onClick={() => updateAttributes({ kind: k })}>
                {l}
              </button>
            ))}
          </span>
          <Picker accent={a.accent} value={a.sound} onPick={(s) => updateAttributes({ sound: s.id })} />
        </span>
      )}
    </NodeViewWrapper>
  );
}

const attrs = (o: Record<string, string>) => () => Object.fromEntries(Object.entries(o).map(([k, d]) => [k, { default: d }]));
export const PhonChartNode = Node.create({
  name: 'phonChart',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: attrs({ accent: 'RP', part: 'all', by: '' }),
  parseHTML: () => [{ tag: 'span[data-phon-chart]', getAttrs: (el) => ({ accent: (el as HTMLElement).getAttribute('data-accent') || 'RP', part: (el as HTMLElement).getAttribute('data-part') || 'all', by: (el as HTMLElement).getAttribute('data-by') || '' }) }],
  renderHTML: ({ node }) => ['span', mergeAttributes({ 'data-phon-chart': '', 'data-accent': node.attrs.accent, 'data-part': node.attrs.part, 'data-by': node.attrs.by })],
  addNodeView: () => ReactNodeViewRenderer(ChartView),
});
export const PhonCardNode = Node.create({
  name: 'phonCard',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: attrs({ sound: '', accent: 'RP', kind: 'sound', by: '' }),
  parseHTML: () => [{ tag: 'span[data-phon-card]', getAttrs: (el) => ({ sound: (el as HTMLElement).getAttribute('data-sound') || '', accent: (el as HTMLElement).getAttribute('data-accent') || 'RP', kind: (el as HTMLElement).getAttribute('data-kind') || 'sound', by: (el as HTMLElement).getAttribute('data-by') || '' }) }],
  renderHTML: ({ node }) => ['span', mergeAttributes({ 'data-phon-card': '', 'data-sound': node.attrs.sound, 'data-accent': node.attrs.accent, 'data-kind': node.attrs.kind, 'data-by': node.attrs.by })],
  addNodeView: () => ReactNodeViewRenderer(CardView),
});

const lastAccent = (): Accent => {
  try {
    return localStorage.getItem('ll.phAccent') === 'GA' ? 'GA' : 'RP';
  } catch {
    return 'RP';
  }
};
export const newPhonChart = () => ({ type: 'phonChart', attrs: { accent: lastAccent(), part: 'all', by: auth.currentUser?.uid ?? '' } });
export const newPhonCard = (kind: CardKind = 'sound') => ({ type: 'phonCard', attrs: { sound: '', accent: lastAccent(), kind, by: auth.currentUser?.uid ?? '' } });

// Outside the editor: what learners see.
export function PhonView({ type, a }: { type: string; a: Record<string, unknown> }) {
  const accent = (a.accent === 'GA' ? 'GA' : 'RP') as Accent;
  if (type === 'phonChart') return <PhonChart accent={accent} part={(a.part as ChartPart) ?? 'all'} by={String(a.by ?? '')} />;
  const p = a.sound ? findSound(accent, String(a.sound)) : undefined;
  return p ? <SoundCard p={p} accent={accent} by={String(a.by ?? '')} kind={(a.kind as CardKind) ?? 'sound'} /> : null;
}
