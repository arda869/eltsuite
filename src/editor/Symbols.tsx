import { Mark, mergeAttributes, Node } from '@tiptap/core';
import '../lib/extras.css';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps, type Editor } from '@tiptap/react';
import { usePopPos } from './usePopPos';
import { useEffect, useRef, useState } from 'react';

// Small marks used in language teaching: + − ? in a box, parts of speech in a circle, etc.

export type SymShape = 'box' | 'circle' | 'pill' | 'plain' | 'mont';
export type SymAttrs = { text: string; shape: SymShape; tone: string };

const SIGNS = ['+', '−', '?', '!', '✓', '✗', '→', '↔', '≈', '≠', '*', '…'];

export const POS_SYSTEMS: { key: string; label: string; hint: string; shape: SymShape; items: { text: string; label: string }[] }[] = [
  {
    key: 'letters',
    label: 'Letters in circles',
    hint: 'Short and clear: N for noun, V for verb',
    shape: 'circle',
    items: [
      { text: 'N', label: 'noun' },
      { text: 'V', label: 'verb' },
      { text: 'Adj', label: 'adjective' },
      { text: 'Adv', label: 'adverb' },
      { text: 'Prep', label: 'preposition' },
      { text: 'Pron', label: 'pronoun' },
      { text: 'Conj', label: 'conjunction' },
      { text: 'Det', label: 'determiner' },
      { text: 'PV', label: 'phrasal verb' },
    ],
  },
  {
    key: 'dictionary',
    label: 'Dictionary style',
    hint: 'Like a learner’s dictionary: n. v. adj.',
    shape: 'pill',
    items: [
      { text: 'n.', label: 'noun' },
      { text: 'v.', label: 'verb' },
      { text: 'adj.', label: 'adjective' },
      { text: 'adv.', label: 'adverb' },
      { text: 'prep.', label: 'preposition' },
      { text: 'pron.', label: 'pronoun' },
      { text: 'conj.', label: 'conjunction' },
      { text: 'det.', label: 'determiner' },
      { text: 'phr v.', label: 'phrasal verb' },
    ],
  },
  {
    key: 'mont',
    label: 'Grammar shapes',
    hint: 'Montessori shapes: a triangle for a noun, a circle for a verb',
    shape: 'mont',
    items: [
      { text: 'noun', label: 'noun' },
      { text: 'verb', label: 'verb' },
      { text: 'adjective', label: 'adjective' },
      { text: 'adverb', label: 'adverb' },
      { text: 'article', label: 'article' },
      { text: 'pronoun', label: 'pronoun' },
      { text: 'preposition', label: 'preposition' },
      { text: 'conjunction', label: 'conjunction' },
    ],
  },
];

// Verb forms, numbered or named. V2 is the past simple, V3 the past participle.
export const VERB_FORMS: { key: string; label: string; hint: string; shape: SymShape; items: { text: string; label: string }[] }[] = [
  {
    key: 'numbered',
    label: 'Numbered',
    hint: 'V1 base form, V2 past simple, V3 past participle',
    shape: 'circle',
    items: [
      { text: 'V1', label: 'base form' },
      { text: 'V2', label: 'past simple' },
      { text: 'V3', label: 'past participle' },
      { text: 'V-ing', label: '-ing form' },
      { text: 'to V', label: 'to + infinitive' },
      { text: 'V-s', label: 'third person -s' },
    ],
  },
  {
    key: 'named',
    label: 'Named',
    hint: 'The full names, for learners who know the terms',
    shape: 'pill',
    items: [
      { text: 'base form', label: 'V1' },
      { text: 'past simple', label: 'V2' },
      { text: 'past participle', label: 'V3' },
      { text: '-ing form', label: 'present participle or gerund' },
      { text: 'to + infinitive', label: 'to V' },
      { text: 'bare infinitive', label: 'infinitive without to' },
    ],
  },
];

// Montessori grammar symbols, drawn in the app's quiet palette.
const MONT: Record<string, JSX.Element> = {
  noun: <path d="M12 3.5L21 20H3z" fill="#2f2e2d" />,
  verb: <circle cx="12" cy="12" r="8.5" fill="#b4483c" />,
  adjective: <path d="M12 7l6.5 11h-13z" fill="#2f4e7a" />,
  adverb: <circle cx="12" cy="12" r="5.5" fill="#d7863e" />,
  article: <path d="M12 9l4.5 8h-9z" fill="#7aa5c8" />,
  pronoun: <path d="M12 5l7.5 13h-15z" fill="#6f4b8b" />,
  preposition: <path d="M3.5 17Q12 1 20.5 17Q12 9.5 3.5 17z" fill="#4f7a55" />,
  conjunction: <rect x="5" y="10.5" width="14" height="3.2" rx="0.6" fill="#c97a95" />,
};

export function Sym({ text, shape, tone = 'ink' }: SymAttrs) {
  if (shape === 'mont') {
    return (
      <svg className="sym sym-mont" width="1.05em" height="1.05em" viewBox="0 0 24 24" role="img" aria-label={text}>
        <title>{text}</title>
        {MONT[text] ?? <circle cx="12" cy="12" r="6" fill="#999" />}
      </svg>
    );
  }
  return (
    <span className={`sym sym-${shape} tone-${tone}` + (text.length > 2 ? ' wide' : '')} title={text}>
      {text}
    </span>
  );
}

export function SymbolPicker({ onPick, onClose }: { onPick: (a: SymAttrs) => void; onClose?: () => void }) {
  const [tab, setTab] = useState<'signs' | 'pos' | 'verbs' | 'own'>('signs');
  const [system, setSystem] = useState(POS_SYSTEMS[0].key);
  const [vsys, setVsys] = useState(VERB_FORMS[0].key);
  const vs = VERB_FORMS.find((s) => s.key === vsys)!;
  const [own, setOwn] = useState('');
  const [shape, setShape] = useState<SymShape>('box');
  const [tone, setTone] = useState('ink');
  const sys = POS_SYSTEMS.find((s) => s.key === system)!;
  const pick = (a: SymAttrs) => (onPick(a), onClose?.());
  return (
    <span className="sym-picker">
      <span className="seg small-seg" role="tablist">
        {([
          ['signs', 'Signs'],
          ['pos', 'Parts of speech'],
          ['verbs', 'Verb forms'],
          ['own', 'Your own'],
        ] as const).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </span>
      {tab === 'signs' && (
        <>
          <span className="sym-row">
            {SIGNS.map((t) => (
              <button key={t} type="button" className="sym-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => pick({ text: t, shape: 'box', tone })}>
                <Sym text={t} shape="box" tone={tone} />
              </button>
            ))}
          </span>
          <span className="hint">For example: + positive, − negative, ? question.</span>
        </>
      )}
      {tab === 'pos' && (
        <>
          <span className="sym-systems">
            {POS_SYSTEMS.map((s) => (
              <button key={s.key} type="button" className={'sym-system' + (system === s.key ? ' on' : '')} onClick={() => setSystem(s.key)}>
                <span className="sym-sys-demo">
                  {s.items.slice(0, 3).map((i) => (
                    <Sym key={i.text} text={i.text} shape={s.shape} tone={tone} />
                  ))}
                </span>
                <span className="sym-sys-label">{s.label}</span>
              </button>
            ))}
          </span>
          <span className="hint">{sys.hint}. Use one system in a lesson so learners always read it the same way.</span>
          <span className="sym-row">
            {sys.items.map((i) => (
              <button key={i.text} type="button" className="sym-btn labelled" title={i.label} onMouseDown={(e) => e.preventDefault()} onClick={() => pick({ text: i.text, shape: sys.shape, tone })}>
                <Sym text={i.text} shape={sys.shape} tone={tone} />
                <span className="sym-lab">{i.label}</span>
              </button>
            ))}
          </span>
        </>
      )}
      {tab === 'verbs' && (
        <>
          <span className="seg small-seg" role="radiogroup" aria-label="How to show verb forms">
            {VERB_FORMS.map((s) => (
              <button key={s.key} type="button" role="radio" aria-checked={vsys === s.key} className={vsys === s.key ? 'on' : ''} onClick={() => setVsys(s.key)}>
                {s.label}
              </button>
            ))}
          </span>
          <span className="hint">{vs.hint}.</span>
          <span className="sym-row">
            {vs.items.map((i) => (
              <button key={i.text} type="button" className="sym-btn labelled" title={i.label} onMouseDown={(e) => e.preventDefault()} onClick={() => pick({ text: i.text, shape: vs.shape, tone })}>
                <Sym text={i.text} shape={vs.shape} tone={tone} />
                <span className="sym-lab">{i.label}</span>
              </button>
            ))}
          </span>
        </>
      )}
      {tab === 'own' && (
        <span className="sym-own">
          <input aria-label="Up to 5 letters, e.g. S, O, Q" value={own} maxLength={5} placeholder="Up to 5 letters, e.g. S, O, Q" onChange={(e) => setOwn(e.target.value)} />
          <span className="seg small-seg" role="radiogroup" aria-label="Shape">
            {(['box', 'circle', 'pill', 'plain'] as const).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={shape === k} className={shape === k ? 'on' : ''} onClick={() => setShape(k)}>
                {k === 'box' ? 'Box' : k === 'circle' ? 'Circle' : k === 'pill' ? 'Rounded' : 'No border'}
              </button>
            ))}
          </span>
          <span className="sym-own-prev">{own.trim() && <Sym text={own.trim()} shape={shape} tone={tone} />}</span>
          <button type="button" className="btn small-btn primary" disabled={!own.trim()} onClick={() => pick({ text: own.trim(), shape, tone })}>
            Add
          </button>
        </span>
      )}
      {tab !== 'pos' || sys.shape !== 'mont' ? (
        <span className="seg small-seg" role="radiogroup" aria-label="Colour">
          {[
            ['ink', 'Text colour'],
            ['accent', 'Class colour'],
            ['soft', 'Grey'],
          ].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={tone === k} className={tone === k ? 'on' : ''} onClick={() => setTone(k)}>
              {l}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function SymView({ node, updateAttributes, selected }: NodeViewProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const popStyle = usePopPos(ref, open, 370);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <NodeViewWrapper as="span" className={'emo-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <span contentEditable={false} className="emo-chip" onClick={() => setOpen(true)}>
        <Sym {...(node.attrs as SymAttrs)} />
      </span>
      {open && (
        <span className="gap-pop sym-pop" contentEditable={false} style={popStyle}>
          <SymbolPicker onPick={(a) => updateAttributes(a)} onClose={() => setOpen(false)} />
        </span>
      )}
    </NodeViewWrapper>
  );
}

export function SymbolTool({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<'above' | 'below' | 'inline'>(() => {
    try {
      const v = localStorage.getItem('ll.labelAt');
      return v === 'below' || v === 'inline' ? v : 'above';
    } catch {
      return 'above';
    }
  });
  const [, tick] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const popStyle = usePopPos(ref, open, 370);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    const sel = () => tick((x) => x + 1);
    document.addEventListener('mousedown', close);
    editor.on('selectionUpdate', sel);
    return () => {
      document.removeEventListener('mousedown', close);
      editor.off('selectionUpdate', sel);
    };
  }, [open, editor]);
  // With words selected, the symbol labels them (above or below); otherwise it goes in the text.
  const labelling = !editor.state.selection.empty || editor.isActive('glabel');
  const pickAt = (v: 'above' | 'below' | 'inline') => {
    setAt(v);
    try {
      localStorage.setItem('ll.labelAt', v);
    } catch {
      /* fine */
    }
    if (editor.isActive('glabel')) editor.chain().focus().extendMarkRange('glabel').updateAttributes('glabel', { at: v }).run();
  };
  return (
    <span className="hl-tool" ref={ref}>
      <button type="button" className={'tool' + (editor.isActive('glabel') ? ' on' : '')} title="Symbols and grammar labels" aria-label="Symbols and grammar labels" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true">
          <rect x="2" y="2" width="12" height="12" rx="2.5" />
          <path d="M8 5.2v5.6M5.2 8h5.6" />
        </svg>
      </button>
      {open && (
        <span className="hl-pop sym-pop" style={popStyle}>
          {labelling ? (
            <span className="sym-label-head">
              <span>
                <b>Label the selected words</b>
                <span className="hint">The label sits on the words, and they are softly marked</span>
              </span>
              <span className="seg small-seg" role="radiogroup" aria-label="Where the label goes">
                {(['above', 'below', 'inline'] as const).map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={at === k} className={at === k ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => pickAt(k)}>
                    {k === 'above' ? 'Above' : k === 'below' ? 'Below' : 'In the line'}
                  </button>
                ))}
              </span>
              {editor.isActive('glabel') && (
                <button type="button" className="btn link small" onMouseDown={(e) => e.preventDefault()} onClick={() => (editor.chain().focus().extendMarkRange('glabel').unsetMark('glabel').run(), setOpen(false))}>
                  Remove the label
                </button>
              )}
            </span>
          ) : null}
          <SymbolPicker
            onPick={(a) =>
              labelling
                ? editor.chain().focus().extendMarkRange('glabel').setMark('glabel', { ...a, at }).run()
                : editor.chain().focus().insertContent({ type: 'sym', attrs: a }).run()
            }
            onClose={() => setOpen(false)}
          />
        </span>
      )}
    </span>
  );
}

// A grammar label on words: the symbol sits above or below them, and the words get a soft
// bracket in the class colour.
export const GrammarLabel = Mark.create({
  name: 'glabel',
  inclusive: false,
  excludes: 'glabel',
  addAttributes: () => ({
    text: { default: 'V', parseHTML: (el) => el.getAttribute('data-text') || '', renderHTML: (a) => ({ 'data-text': a.text }) },
    shape: { default: 'circle', parseHTML: (el) => el.getAttribute('data-shape') || 'circle', renderHTML: (a) => ({ 'data-shape': a.shape }) },
    tone: { default: 'accent', parseHTML: (el) => el.getAttribute('data-tone') || 'accent', renderHTML: (a) => ({ 'data-tone': a.tone }) },
    at: { default: 'above', parseHTML: (el) => el.getAttribute('data-at') || 'above', renderHTML: (a) => ({ 'data-at': a.at }) },
  }),
  parseHTML: () => [{ tag: 'span.pr-gl' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class: 'pr-gl' }), 0],
});
export const glabelAttrs = (a: Record<string, unknown> = {}) => ({ className: 'pr-gl', 'data-text': String(a.text ?? ''), 'data-shape': String(a.shape ?? 'circle'), 'data-tone': String(a.tone ?? 'accent'), 'data-at': String(a.at ?? 'above') });

export const SymNode = Node.create({
  name: 'sym',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ text: { default: '+' }, shape: { default: 'box' }, tone: { default: 'ink' } }),
  parseHTML: () => [{ tag: 'span[data-sym]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-sym': '' })],
  addNodeView: () => ReactNodeViewRenderer(SymView),
});
