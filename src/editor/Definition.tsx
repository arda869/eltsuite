import { Mark, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IpaField } from './Ipa';

// An inline definition: a word or phrase in the text that learners tap or hover to see its meaning.
// Fields follow the vocabulary entry in the brief (core first, the rest under "More details").

export type DefData = {
  pos?: string;
  meaning?: string;
  example?: string;
  family?: string;
  forms?: string;
  countable?: string;
  patterns?: string;
  ipa?: string;
  stress?: string;
  register?: string;
  connotation?: string;
  collocations?: string;
  synonyms?: string;
  antonyms?: string;
  mistakes?: string;
  image?: string;
  cefr?: string;
  tags?: string;
  translation?: string;
  lang?: string;
};

export const POS = ['noun', 'verb', 'adjective', 'adverb', 'phrasal verb', 'idiom', 'phrase', 'preposition', 'conjunction', 'pronoun', 'determiner', 'exclamation'];
export const REGISTERS = ['formal', 'neutral', 'informal', 'slang'];
export const CONNOTATIONS = ['positive', 'neutral', 'negative'];
export const COUNTABLE = ['countable', 'uncountable', 'both'];
export const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export const Definition = Mark.create({
  name: 'definition',
  inclusive: false,
  addAttributes: () => ({
    data: {
      default: {},
      parseHTML: (el: HTMLElement) => {
        try {
          return JSON.parse(el.getAttribute('data-def') || '{}');
        } catch {
          return {};
        }
      },
      renderHTML: (a: { data: DefData }) => ({ 'data-def': JSON.stringify(a.data ?? {}) }),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-def]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { class: 'def-word' }), 0],
});

export type FieldDef = { k: keyof DefData; label: string; ph?: string; options?: string[]; long?: boolean };
export const CORE: FieldDef[] = [
  { k: 'pos', label: 'Part of speech', options: POS },
  { k: 'meaning', label: 'Meaning', ph: 'A simple explanation in English', long: true },
  { k: 'example', label: 'Example sentence', ph: 'She was reluctant to leave.', long: true },
];
export const TRANSLATION: FieldDef[] = [
  { k: 'translation', label: 'Translation', ph: 'isteksiz' },
  { k: 'lang', label: 'Language', ph: 'Turkish' },
];
export const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: 'Form',
    fields: [
      { k: 'family', label: 'Word family', ph: 'reluctance (n), reluctantly (adv)' },
      { k: 'forms', label: 'Irregular forms', ph: 'went, gone' },
      { k: 'countable', label: 'Countable or uncountable', options: COUNTABLE },
      { k: 'patterns', label: 'Common patterns', ph: 'be reluctant to do sth' },
    ],
  },
  {
    title: 'Pronunciation',
    fields: [
      { k: 'ipa', label: 'IPA', ph: '/rɪˈlʌktənt/' },
      { k: 'stress', label: 'Stressed syllable', ph: 're·LUC·tant' },
    ],
  },
  {
    title: 'Use',
    fields: [
      { k: 'register', label: 'Register', options: REGISTERS },
      { k: 'connotation', label: 'Connotation', options: CONNOTATIONS },
      { k: 'collocations', label: 'Collocations', ph: 'deeply reluctant, reluctant hero' },
      { k: 'synonyms', label: 'Synonyms', ph: 'unwilling, hesitant' },
      { k: 'antonyms', label: 'Antonyms', ph: 'eager, willing' },
    ],
  },
  {
    title: 'Learner help',
    fields: [
      { k: 'mistakes', label: 'Common mistakes', ph: 'Not “reluctant for doing”', long: true },
      { k: 'image', label: 'Image address', ph: 'https://…' },
      { k: 'cefr', label: 'CEFR level', options: CEFR },
      { k: 'tags', label: 'Topic tags', ph: 'feelings, work' },
    ],
  },
];

// Popover in the editor for adding or editing the definition on the selected text.
export function DefinitionPop({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<DefData>({});
  const [more, setMore] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [word, setWord] = useState('');
  const existing = editor.isActive('definition');

  useEffect(() => {
    if (!open) return;
    if (existing) editor.chain().extendMarkRange('definition').run();
    const d = (editor.getAttributes('definition').data ?? {}) as DefData;
    setData(d);
    setMore(Object.keys(d).some((k) => !['pos', 'meaning', 'example', 'translation', 'lang'].includes(k) && d[k as keyof DefData]));
    const { from, to } = editor.state.selection;
    setWord(editor.state.doc.textBetween(from, to, ' '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const c = editor.view.coordsAtPos(editor.state.selection.from);
    const room = window.innerHeight - c.bottom - 16;
    setPos({ top: room > 300 ? c.bottom + 8 : Math.max(8, c.top - 8 - Math.min(560, window.innerHeight * 0.7)), left: Math.max(8, Math.min(c.left - 20, window.innerWidth - 380 - 8)) });
  }, [open, editor]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) save();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  });

  if (!open) return null;

  function save() {
    const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === 'string' && v.trim())) as DefData;
    if (Object.keys(clean).length) editor.chain().focus().extendMarkRange('definition').setMark('definition', { data: clean }).run();
    else if (existing) editor.chain().focus().extendMarkRange('definition').unsetMark('definition').run();
    onClose();
  }
  function remove() {
    editor.chain().focus().extendMarkRange('definition').unsetMark('definition').run();
    onClose();
  }

  const field = (f: FieldDef) => <DefField key={f.k} f={f} data={data} setData={setData} word={word} />;
  return (
    <div ref={ref} className="def-pop" style={{ position: 'fixed', top: pos.top, left: pos.left }} role="dialog" aria-label="Definition">
      <div className="def-pop-head">
        <span className="pop-type">Definition</span>
        <strong className="def-pop-word">{word}</strong>
      </div>
      {CORE.map(field)}
      <div className="def-two">{TRANSLATION.map(field)}</div>
      <button type="button" className="btn link small def-more" onClick={() => setMore((m) => !m)}>
        {more ? 'Fewer details' : 'More details: form, pronunciation, use, learner help'}
      </button>
      {more &&
        GROUPS.map((g) => (
          <div key={g.title} className="def-group">
            <span className="def-group-title">{g.title}</span>
            {g.fields.map(field)}
          </div>
        ))}
      <div className="def-pop-foot">
        {existing && (
          <button type="button" className="btn link small" onClick={remove}>
            Remove definition
          </button>
        )}
        <button type="button" className="btn small-btn primary" style={{ marginLeft: 'auto' }} onClick={save}>
          Done
        </button>
      </div>
    </div>
  );
}

// One vocabulary field: chips, a long text or a short text. Shared with the notebook.
export function DefField({ f, data, setData, word }: { f: FieldDef; data: DefData; setData: (fn: (d: DefData) => DefData) => void; word?: string }) {
  if (f.k === 'ipa')
    return (
      <span className="def-field">
        <span>{f.label}</span>
        <IpaField value={data.ipa ?? ''} word={word} onChange={(v) => setData((d) => ({ ...d, ipa: v }))} />
      </span>
    );
  return (
    <label className={'def-field' + (f.long ? ' long' : '')}>
      <span>{f.label}</span>
      {f.options ? (
        <span className="def-chips" role="radiogroup" aria-label={f.label}>
          {f.options.map((o) => (
            <button key={o} type="button" role="radio" aria-checked={data[f.k] === o} className={data[f.k] === o ? 'on' : ''} onClick={() => setData((d) => ({ ...d, [f.k]: d[f.k] === o ? '' : o }))}>
              {o}
            </button>
          ))}
        </span>
      ) : f.long ? (
        <textarea rows={2} value={data[f.k] ?? ''} placeholder={f.ph} onChange={(e) => setData((d) => ({ ...d, [f.k]: e.target.value }))} onKeyDown={(e) => e.stopPropagation()} />
      ) : (
        <input value={data[f.k] ?? ''} placeholder={f.ph} onChange={(e) => setData((d) => ({ ...d, [f.k]: e.target.value }))} onKeyDown={(e) => e.stopPropagation()} />
      )}
    </label>
  );
}

// What learners see when they hover or tap a defined word.
export function DefCard({ word, d }: { word: string; d: DefData }) {
  const speak = () => {
    try {
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-GB';
      u.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      /* speech not available */
    }
  };
  const row = (label: string, v?: string) =>
    v ? (
      <span className="dc-row">
        <span className="dc-k">{label}</span>
        <span className="dc-v">{v}</span>
      </span>
    ) : null;
  const form = d.family || d.forms || d.countable || d.patterns;
  const use = d.register || d.connotation || d.collocations || d.synonyms || d.antonyms;
  return (
    <span className="dc">
      <span className="dc-head">
        <span className="dc-word">{word}</span>
        {typeof window !== 'undefined' && 'speechSynthesis' in window && (
          <button type="button" className="dc-say" onClick={speak} aria-label={`Hear “${word}”`} title="Listen">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
            </svg>
          </button>
        )}
        {d.cefr && <span className="dc-cefr">{d.cefr}</span>}
      </span>
      {(d.ipa || d.stress || d.pos) && (
        <span className="dc-sub">
          {d.pos && <em>{d.pos}</em>}
          {d.ipa && <span className="dc-ipa">{d.ipa}</span>}
          {d.stress && <span className="dc-stress">{d.stress}</span>}
        </span>
      )}
      {d.image && <img className="dc-img" src={d.image} alt="" />}
      {d.meaning && <span className="dc-meaning">{d.meaning}</span>}
      {d.example && <span className="dc-example">{d.example}</span>}
      {d.translation && (
        <span className="dc-trans">
          <span className="dc-k">{d.lang || 'Translation'}</span>
          <span className="dc-v">{d.translation}</span>
        </span>
      )}
      {form && (
        <span className="dc-sec">
          {row('Word family', d.family)}
          {row('Forms', d.forms)}
          {row('Grammar', d.countable)}
          {row('Patterns', d.patterns)}
        </span>
      )}
      {use && (
        <span className="dc-sec">
          {row('Register', d.register)}
          {row('Feeling', d.connotation)}
          {row('Goes with', d.collocations)}
          {row('Similar', d.synonyms)}
          {row('Opposite', d.antonyms)}
        </span>
      )}
      {d.mistakes && (
        <span className="dc-sec dc-mistake">
          <span className="dc-k">Watch out</span>
          <span className="dc-v">{d.mistakes}</span>
        </span>
      )}
    </span>
  );
}
