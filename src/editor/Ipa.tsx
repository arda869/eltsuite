import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Grip } from './nodes';

// IPA transcription shown like a dictionary entry: grey, between slashes.
// The symbol picker follows the layout of Adrian Underhill's phonemic chart.

export type Accent = 'RP' | 'GA';
type Sym = [string, string]; // symbol, example word

const RP = {
  vowels: [
    [['iː', 'sheep'], ['ɪ', 'ship'], ['ʊ', 'good'], ['uː', 'shoot']],
    [['e', 'bed'], ['ə', 'teacher'], ['ɜː', 'bird'], ['ɔː', 'door']],
    [['æ', 'cat'], ['ʌ', 'up'], ['ɑː', 'far'], ['ɒ', 'on']],
  ] as Sym[][],
  diphthongs: [
    [['ɪə', 'here'], ['eɪ', 'wait']],
    [['ʊə', 'tourist'], ['ɔɪ', 'boy'], ['əʊ', 'show']],
    [['eə', 'hair'], ['aɪ', 'my'], ['aʊ', 'cow']],
  ] as Sym[][],
};
const GA = {
  vowels: [
    [['i', 'sheep'], ['ɪ', 'ship'], ['ʊ', 'good'], ['u', 'shoot']],
    [['ɛ', 'bed'], ['ə', 'about'], ['ɚ', 'teacher'], ['ɝ', 'bird']],
    [['æ', 'cat'], ['ʌ', 'up'], ['ɑ', 'father, hot'], ['ɔ', 'thought']],
  ] as Sym[][],
  diphthongs: [
    [['eɪ', 'wait'], ['aɪ', 'my'], ['ɔɪ', 'boy']],
    [['oʊ', 'show'], ['aʊ', 'cow']],
  ] as Sym[][],
};
const CONSONANTS: Sym[][] = [
  [['p', 'pea'], ['b', 'boat'], ['t', 'tea'], ['d', 'dog'], ['tʃ', 'cheese'], ['dʒ', 'June'], ['k', 'car'], ['ɡ', 'go']],
  [['f', 'fly'], ['v', 'video'], ['θ', 'think'], ['ð', 'this'], ['s', 'see'], ['z', 'zoo'], ['ʃ', 'shall'], ['ʒ', 'television']],
  [['m', 'man'], ['n', 'now'], ['ŋ', 'sing'], ['h', 'hat'], ['l', 'love'], ['r', 'red'], ['w', 'wet'], ['j', 'yes']],
];
const GA_EXTRA: Sym[] = [['ɾ', 'water (flap t)'], ['ʔ', 'button (glottal stop)']];
const MARKS: Sym[] = [['ˈ', 'main stress, before the syllable'], ['ˌ', 'secondary stress'], ['ː', 'long sound'], ['.', 'syllable break'], ['‿', 'linking']];

export const accentLabel = (a: Accent) => (a === 'GA' ? 'US' : 'UK');

export function IpaText({ text, accent, showAccent }: { text: string; accent: Accent; showAccent?: boolean }) {
  return (
    <span className="ipa" lang="en-fonipa" title={accent === 'GA' ? 'Standard American' : 'British (RP)'}>
      {showAccent && <span className="ipa-acc">{accentLabel(accent)}</span>}/{text}/
    </span>
  );
}

function Chart({ accent, onPick }: { accent: Accent; onPick: (s: string) => void }) {
  const set = accent === 'GA' ? GA : RP;
  const btn = ([s, ex]: Sym, cls = '') => (
    <button key={s} type="button" className={'ipa-key ' + cls} title={`${s} as in “${ex}”`} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(s)}>
      <span className="ipa-sym">{s}</span>
      <span className="ipa-ex">{ex.split(/[ ,(]/)[0]}</span>
    </button>
  );
  return (
    <div className="ipa-chart">
      <div className="ipa-top">
        <div className="ipa-block vowels">
          <span className="ipa-cap">Monophthongs</span>
          {set.vowels.map((row, i) => (
            <div key={i} className="ipa-row">
              {row.map((s) => btn(s, 'v'))}
            </div>
          ))}
        </div>
        <div className="ipa-block diph">
          <span className="ipa-cap">Diphthongs</span>
          {set.diphthongs.map((row, i) => (
            <div key={i} className="ipa-row">
              {row.map((s) => btn(s, 'd'))}
            </div>
          ))}
        </div>
      </div>
      <div className="ipa-block cons">
        <span className="ipa-cap">Consonants</span>
        {CONSONANTS.map((row, i) => (
          <div key={i} className="ipa-row">
            {row.map((s) => btn(s, 'c'))}
          </div>
        ))}
        {accent === 'GA' && <div className="ipa-row">{GA_EXTRA.map((s) => btn(s, 'c'))}</div>}
      </div>
      <div className="ipa-row ipa-marks">
        {MARKS.map((s) => btn(s, 'm'))}
      </div>
    </div>
  );
}

function IpaView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const text: string = node.attrs.text ?? '';
  const accent = (node.attrs.accent ?? 'RP') as Accent;
  const showAccent = !!node.attrs.showAccent;
  const [open, setOpen] = useState(!text);
  const ref = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  });

  // Insert a symbol where the cursor is in the input.
  const insert = (s: string) => {
    const el = inputRef.current;
    const a = el?.selectionStart ?? text.length;
    const b = el?.selectionEnd ?? text.length;
    const next = text.slice(0, a) + s + text.slice(b);
    updateAttributes({ text: next });
    window.setTimeout(() => {
      el?.focus();
      el?.setSelectionRange(a + s.length, a + s.length);
    }, 0);
  };

  return (
    <NodeViewWrapper as="span" className={'ipa-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <Grip editor={editor} getPos={getPos} />
      <span className="ipa-chip" contentEditable={false} onClick={() => setOpen(true)} title="Edit IPA">
        {text ? <IpaText text={text} accent={accent} showAccent={showAccent} /> : <span className="stress-empty">IPA</span>}
      </span>
      {open && (
        <span className="gap-pop ipa-pop" contentEditable={false}>
          <span className="ipa-pop-head">
            <span className="pop-type">IPA</span>
            <span className="seg small-seg" role="radiogroup" aria-label="Accent">
              {(['RP', 'GA'] as const).map((a) => (
                <button key={a} type="button" role="radio" aria-checked={accent === a} className={accent === a ? 'on' : ''} onClick={() => updateAttributes({ accent: a })}>
                  {a === 'RP' ? 'British (RP)' : 'Standard American'}
                </button>
              ))}
            </span>
          </span>
          <span className="ipa-input">
            <span className="ipa-slash">/</span>
            <input ref={inputRef} value={text} placeholder="tap the symbols below" onChange={(e) => updateAttributes({ text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setOpen(false))} spellCheck={false} />
            <span className="ipa-slash">/</span>
          </span>
          <Chart accent={accent} onPick={insert} />
          <label className="ipa-show">
            <input type="checkbox" checked={showAccent} onChange={() => updateAttributes({ showAccent: !showAccent })} />
            Show {accentLabel(accent)} before the transcription
          </label>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Ipa = Node.create({
  name: 'ipa',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({
    text: { default: '' },
    accent: { default: 'RP' },
    showAccent: { default: false },
  }),
  parseHTML: () => [{ tag: 'span[data-ipa]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-ipa': '' })],
  addNodeView: () => ReactNodeViewRenderer(IpaView),
});

export const newIpa = (accent: Accent = 'RP') => ({ type: 'ipa', attrs: { text: '', accent, showAccent: false } });
