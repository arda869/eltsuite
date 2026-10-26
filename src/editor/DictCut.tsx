import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';
import { Grip } from './nodes';
import { CORE, DefField, GROUPS, TransFields, type DefData } from './Definition';
import { translationsFor, useMyLangs } from '../lib/langs';
import '../lib/extras.css';

// A dictionary entry that looks cut out of a printed dictionary page and stuck into the task.
// The same fields as a definition; only the ones filled in are shown.

const TILTS = [-0.9, 0.6, -0.4, 0.8, -0.6];
export const tiltOf = (word: string) => TILTS[Array.from(word).reduce((s, c) => s + c.charCodeAt(0), 0) % TILTS.length];

export function DictCutout({ word, d, tilt = true }: { word: string; d: DefData; tilt?: boolean }) {
  const mine = useMyLangs();
  const has = (v?: string) => !!v && v.trim().length > 0;
  const gram = [d.countable === 'countable' ? '[C]' : d.countable === 'uncountable' ? '[U]' : d.countable === 'both' ? '[C, U]' : '', d.register ? d.register : ''].filter(Boolean).join('  ');
  const meanings = (d.meaning ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const examples = (d.example ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const line = (k: string, v?: string) =>
    has(v) ? (
      <span className="dcut-line">
        <span className="dcut-k">{k}</span>
        {v}
      </span>
    ) : null;
  return (
    <span className="dcut" style={{ ['--tilt' as string]: tilt ? `${tiltOf(word)}deg` : '0deg' }} role="figure" aria-label={`Dictionary entry: ${word}`}>
      <span className="dcut-paper" style={{ display: 'block' }}>
        <span className="dcut-cut" aria-hidden="true" />
        {has(d.image) && /^https:\/\//.test(d.image!) && <img className="dcut-img" src={d.image} alt="" />}
        <span className="dcut-head">
          <span className="dcut-word">{word || <span className="dcut-empty">headword</span>}</span>
          {has(d.stress) && <span className="dcut-gram">{d.stress}</span>}
          {has(d.ipa) && <span className="dcut-ipa">{d.ipa!.startsWith('/') ? d.ipa : `/${d.ipa}/`}</span>}
          {has(d.pos) && <span className="dcut-pos">{d.pos}</span>}
          {gram && <span className="dcut-gram">{gram}</span>}
          {has(d.cefr) && <span className="dcut-cefr">{d.cefr}</span>}
        </span>
        {has(d.forms) && <span className="dcut-line dcut-gram">({d.forms})</span>}
        <span className="dcut-body" style={{ display: 'block' }}>
          {meanings.length === 0 && examples.length === 0 && <span className="dcut-empty">Add a meaning</span>}
          {(meanings.length ? meanings : ['']).map((m, i) => (
            <span key={i} className="dcut-sense">
              {meanings.length > 1 && <span className="dcut-n">{i + 1}</span>}
              <span>
                {has(d.connotation) && i === 0 && d.connotation !== 'neutral' && <span className="dcut-tags">({d.connotation}) </span>}
                {m}
                {(meanings.length > 1 ? [examples[i]] : examples).filter(Boolean).map((ex, k) => (
                  <span key={k} className="dcut-ex">
                    {ex}
                  </span>
                ))}
              </span>
            </span>
          ))}
        </span>
        {line('patterns', d.patterns)}
        {line('collocations', d.collocations)}
        {line('syn', d.synonyms)}
        {line('opp', d.antonyms)}
        {line('word family', d.family)}
        {translationsFor(d, mine).map(([l, v]) => (
          <span key={l} className="dcut-trans">
            <span className="dcut-k">{l}</span>
            {v}
          </span>
        ))}
        {has(d.mistakes) && (
          <span className="dcut-note">
            <span className="dcut-k">common mistake</span>
            {d.mistakes}
          </span>
        )}
        {has(d.tags) && <span className="dcut-line dcut-tags">{d.tags}</span>}
        <span className="dcut-cut bottom" aria-hidden="true" />
      </span>
    </span>
  );
}

function EditView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const word: string = node.attrs.word ?? '';
  const data: DefData = node.attrs.data ?? {};
  const [open, setOpen] = useState(!word);
  const [more, setMore] = useState(false);
  const setData = (fn: (d: DefData) => DefData) => updateAttributes({ data: fn(data) });
  const field = (f: (typeof CORE)[number]) => <DefField key={f.k} f={f} data={data} setData={setData} word={word} />;
  return (
    <NodeViewWrapper className={'block-node dcut-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">Dictionary cutout</span>
        <button type="button" className="btn link small" style={{ marginLeft: 'auto' }} onClick={() => setOpen((o) => !o)}>
          {open ? 'Done' : 'Edit'}
        </button>
        <button type="button" className="remove" onClick={deleteNode}>
          Remove
        </button>
      </div>
      {open && (
        <div className="dcut-edit">
          <label className="def-field">
            <span>Headword</span>
            <input value={word} placeholder="reluctant" onChange={(e) => updateAttributes({ word: e.target.value })} onKeyDown={(e) => e.stopPropagation()} autoFocus={!word} />
          </label>
          {CORE.map(field)}
          <span className="hint">For more than one meaning, put each meaning and its example on a new line.</span>
          <TransFields data={data} setData={setData} />
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
        </div>
      )}
      <div className="dcut-wrap" onClick={() => setOpen(true)}>
        <DictCutout word={word} d={data} />
      </div>
    </NodeViewWrapper>
  );
}

export const DictCut = Node.create({
  name: 'dictCut',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    word: { default: '' },
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
  parseHTML: () => [{ tag: 'div[data-dict-cut]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-dict-cut': '' })],
  addNodeView: () => ReactNodeViewRenderer(EditView),
});
