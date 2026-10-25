import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { newId } from '../lib/tasks';
import { Grip } from './nodes';

// Self-reflection or feedback for a classmate: a short set of rating questions.
// Not marked; the teacher reads the answers.

export type RItemType = 'stars' | 'scale' | 'faces' | 'choice' | 'checklist' | 'text';
export type RItem = { id: string; type: RItemType; prompt: string; options?: string[]; points?: number; low?: string; high?: string };
export type ReflectAnswer = { peer?: string; peerName?: string; ratings: Record<string, number | number[] | string> };

export const R_TYPES: { key: RItemType; label: string; hint: string }[] = [
  { key: 'stars', label: 'Stars', hint: '1 to 5 stars' },
  { key: 'faces', label: 'Faces', hint: 'From unhappy to happy' },
  { key: 'scale', label: 'Scale', hint: 'Numbers with a label at each end' },
  { key: 'choice', label: 'Choose one', hint: 'Pick one option' },
  { key: 'checklist', label: 'Checklist', hint: 'Tick everything that is true' },
  { key: 'text', label: 'Comment', hint: 'A short written answer' },
];

const newItem = (type: RItemType, prompt = ''): RItem => ({
  id: newId(),
  type,
  prompt,
  ...(type === 'scale' ? { points: 5, low: 'Not at all', high: 'Very' } : {}),
  ...(type === 'choice' ? { options: ['Yes', 'Partly', 'Not yet'] } : {}),
  ...(type === 'checklist' ? { options: ['', ''] } : {}),
});

const STARTERS: Record<'self' | 'peer', RItem[]> = {
  self: [
    newItem('stars', 'How well did you do in this activity?'),
    newItem('faces', 'How do you feel about this topic now?'),
    { ...newItem('checklist', 'I can…'), options: ['use the new words in a sentence', 'ask and answer questions about the topic'] },
    newItem('text', 'One thing I want to practise more'),
  ],
  peer: [
    newItem('stars', 'How clearly did {name} speak?'),
    { ...newItem('scale', 'How easy was it to understand {name}?'), low: 'Hard', high: 'Easy' },
    newItem('text', 'One thing {name} did really well'),
    newItem('text', 'One tip for {name} for next time'),
  ],
};

function ReflectView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const about = (node.attrs.about ?? 'self') as 'self' | 'peer';
  const items: RItem[] = node.attrs.items ?? [];
  const set = (next: RItem[]) => updateAttributes({ items: next });
  const patch = (i: number, p: Partial<RItem>) => set(items.map((it, k) => (k === i ? { ...it, ...p } : it)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    set(next);
  };

  return (
    <NodeViewWrapper className={'block-node reflect-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">{about === 'self' ? 'Self-reflection' : 'Peer feedback'}</span>
        <span className="seg small-seg" role="radiogroup" aria-label="About">
          <button type="button" role="radio" aria-checked={about === 'self'} className={about === 'self' ? 'on' : ''} onClick={() => updateAttributes({ about: 'self' })}>
            About themselves
          </button>
          <button type="button" role="radio" aria-checked={about === 'peer'} className={about === 'peer' ? 'on' : ''} onClick={() => updateAttributes({ about: 'peer' })}>
            About a classmate
          </button>
        </span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <input className="r-title" value={node.attrs.title ?? ''} placeholder={about === 'self' ? 'Title, for example: Look back at the role play' : 'Title, for example: Feedback on your partner’s presentation'} onChange={(e) => updateAttributes({ title: e.target.value })} />
      {about === 'peer' && <span className="hint">Learners choose a classmate from the class list. Write {'{name}'} in a question to show the classmate’s name.</span>}

      <div className="r-items">
        {items.map((it, i) => (
          <div key={it.id} className="r-item">
            <div className="r-item-head">
              <span className="r-n">{i + 1}</span>
              <select value={it.type} onChange={(e) => patch(i, { ...newItem(e.target.value as RItemType, it.prompt), id: it.id })} aria-label="Question type">
                {R_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input className="r-prompt" value={it.prompt} placeholder="Question" onChange={(e) => patch(i, { prompt: e.target.value })} />
              <span className="r-move">
                <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button type="button" className="icon-btn" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </button>
                <button type="button" className="icon-btn" aria-label="Delete question" onClick={() => set(items.filter((_, k) => k !== i))}>
                  ×
                </button>
              </span>
            </div>
            {it.type === 'scale' && (
              <div className="r-opts">
                <label className="r-mini">
                  Points
                  <select value={it.points ?? 5} onChange={(e) => patch(i, { points: Number(e.target.value) })}>
                    {[3, 4, 5, 6, 7, 10].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <label className="r-mini">
                  Low end
                  <input value={it.low ?? ''} onChange={(e) => patch(i, { low: e.target.value })} />
                </label>
                <label className="r-mini">
                  High end
                  <input value={it.high ?? ''} onChange={(e) => patch(i, { high: e.target.value })} />
                </label>
              </div>
            )}
            {(it.type === 'choice' || it.type === 'checklist') && (
              <div className="r-opts col">
                {(it.options ?? []).map((o, k) => (
                  <span key={k} className="r-opt">
                    <span className={it.type === 'checklist' ? 'r-box' : 'r-dot'} aria-hidden="true" />
                    <input value={o} placeholder={it.type === 'checklist' ? 'A can-do statement' : 'Option'} onChange={(e) => patch(i, { options: (it.options ?? []).map((x, j) => (j === k ? e.target.value : x)) })} />
                    <button type="button" className="icon-btn" aria-label="Remove option" onClick={() => patch(i, { options: (it.options ?? []).filter((_, j) => j !== k) })}>
                      ×
                    </button>
                  </span>
                ))}
                <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => patch(i, { options: [...(it.options ?? []), ''] })}>
                  + Add option
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="r-add">
        <span className="hint">Add a question</span>
        {R_TYPES.map((t) => (
          <button key={t.key} type="button" className="btn small-btn" title={t.hint} onClick={() => set([...items, newItem(t.key)])}>
            + {t.label}
          </button>
        ))}
        {items.length === 0 && (
          <button type="button" className="btn small-btn primary" onClick={() => set(STARTERS[about].map((x) => ({ ...x, id: newId() })))}>
            Use a starter set
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const Reflect = Node.create({
  name: 'reflect',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: null },
    about: { default: 'self' },
    title: { default: '' },
    items: { default: [] },
  }),
  parseHTML: () => [{ tag: 'div[data-reflect]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-reflect': '' })],
  addNodeView: () => ReactNodeViewRenderer(ReflectView),
});

export const newReflect = (about: 'self' | 'peer' = 'self') => ({ type: 'reflect', attrs: { id: newId(), about, title: '', items: [] } });
