import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { newId } from '../lib/tasks';
import { usePopPos } from './usePopPos';
import { NoteFields } from './NoteFields';
import { Grip } from './nodes';

const LETTERS = 'abcdefghijklmnop';

function useOutside(open: boolean, ref: React.RefObject<HTMLElement>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && onClose();
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  });
}

function BlockHead({ label, onRemove, p }: { label: string; onRemove: () => void; p: NodeViewProps }) {
  return (
    <div className="mcq-tools">
      <Grip editor={p.editor} getPos={p.getPos} />
      <span
        className="block-label"
        onMouseDown={() => {
          const pos = typeof p.getPos === 'function' ? p.getPos() : undefined;
          if (typeof pos === 'number') {
            p.editor.chain().setNodeSelection(pos).run();
            p.editor.view.focus();
          }
        }}
      >
        {label}
      </span>
      <button type="button" onClick={onRemove}>
        Remove
      </button>
    </div>
  );
}

// Drag-and-drop gap (word from the word bank) -----------------------------------------

function DropGapView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const [open, setOpen] = useState(!node.attrs.answer);
  const [value, setValue] = useState<string>(node.attrs.answer ?? '');
  const ref = useRef<HTMLSpanElement>(null);
  const popStyle = usePopPos(ref, open, 270);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) window.setTimeout(() => input.current?.focus(), 30);
  }, [open]);
  const save = () => {
    updateAttributes({ answer: value.trim() });
    setOpen(false);
  };
  useOutside(open, ref, save);
  return (
    <NodeViewWrapper as="span" className={'gap-node drop-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <Grip editor={editor} getPos={getPos} />
      <span className={'drop-chip' + (node.attrs.answer ? '' : ' empty')} contentEditable={false} onClick={() => setOpen(true)} title="Word from the word bank">
        {node.attrs.answer || 'word'}
      </span>
      {open && (
        <span className="gap-pop" contentEditable={false} style={popStyle} onKeyDown={(e) => e.stopPropagation()}>
          <span className="pop-type">Drag-and-drop gap</span>
          <input
            ref={input}
            value={value}
            placeholder="The word that goes here"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          <span className="hint">This word goes into the word bank automatically. Add wrong words to the word bank’s “Extra words”.</span>
          <NoteFields hint={node.attrs.hint ?? ''} feedback={node.attrs.feedback ?? ''} onSave={(p) => updateAttributes(p)} />
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const DropGap = Node.create({
  name: 'dropgap',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null }, answer: { default: '' }, hint: { default: '' }, feedback: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-dropgap]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-dropgap': '' })],
  addNodeView: () => ReactNodeViewRenderer(DropGapView),
});

// Word bank -------------------------------------------------------------------------

function WordBankView(props: NodeViewProps) {
  const { node, updateAttributes, editor, deleteNode } = props;
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    editor.on('update', f);
    return () => {
      editor.off('update', f);
    };
  }, [editor]);
  const answers: string[] = [];
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'dropgap' && n.attrs.answer) answers.push(n.attrs.answer);
  });
  const extras: string[] = node.attrs.extras ?? [];
  const [extraText, setExtraText] = useState(extras.join(', '));
  return (
    <NodeViewWrapper className="block-node" contentEditable={false}>
      <BlockHead label="Word bank" onRemove={deleteNode} p={props} />
      <div className="bank-preview">
        {answers.map((w, i) => (
          <span key={'a' + i} className="bank-chip">
            {w}
          </span>
        ))}
        {extras.map((w, i) => (
          <span key={'e' + i} className="bank-chip extra">
            {w}
          </span>
        ))}
        {answers.length === 0 && <span className="hint">Add drag-and-drop gaps to the text; their words appear here.</span>}
      </div>
      <label className="inline-field">
        Extra words
        <input
          value={extraText}
          placeholder="Words that don’t belong, separated by commas"
          onChange={(e) => setExtraText(e.target.value)}
          onBlur={() => updateAttributes({ extras: extraText.split(',').map((x) => x.trim()).filter(Boolean) })}
        />
      </label>
      <span className="hint">Learners see these words shuffled.</span>
    </NodeViewWrapper>
  );
}

export const WordBank = Node.create({
  name: 'wordbank',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ extras: { default: [] } }),
  parseHTML: () => [{ tag: 'div[data-wordbank]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-wordbank': '' })],
  addNodeView: () => ReactNodeViewRenderer(WordBankView),
});

// Matching ----------------------------------------------------------------------------

type Pair = { left: string; right: string };

function MatchView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode } = props;
  const pairs: Pair[] = node.attrs.pairs ?? [];
  const extras: string[] = node.attrs.extras ?? [];
  const [extraText, setExtraText] = useState(extras.join(', '));
  const setPair = (i: number, patch: Partial<Pair>) => updateAttributes({ pairs: pairs.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  return (
    <NodeViewWrapper className="block-node q-block" style={{ ['--rows' as string]: Math.max(1, pairs.length) }} contentEditable={false}>
      <BlockHead label="Matching" onRemove={deleteNode} p={props} />
      <div className="match-edit">
        {pairs.map((p, i) => (
          <div key={i} className="match-row">
            <span className="match-n">{i + 1}</span>
            <input value={p.left} placeholder="Left side" onChange={(e) => setPair(i, { left: e.target.value })} />
            <span className="match-arrow" aria-hidden="true">
              →
            </span>
            <input
              value={p.right}
              placeholder="Its match"
              onChange={(e) => setPair(i, { right: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  updateAttributes({ pairs: [...pairs.slice(0, i + 1), { left: '', right: '' }, ...pairs.slice(i + 1)] });
                }
              }}
            />
            <button type="button" className="icon-btn" aria-label="Remove pair" disabled={pairs.length <= 2} onClick={() => updateAttributes({ pairs: pairs.filter((_, k) => k !== i) })}>
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn link small" style={{ alignSelf: 'flex-start' }} onClick={() => updateAttributes({ pairs: [...pairs, { left: '', right: '' }] })}>
          + Add pair
        </button>
      </div>
      <label className="inline-field">
        Extra answers
        <input
          value={extraText}
          placeholder="Answers that match nothing, separated by commas"
          onChange={(e) => setExtraText(e.target.value)}
          onBlur={() => updateAttributes({ extras: extraText.split(',').map((x) => x.trim()).filter(Boolean) })}
        />
      </label>
      <span className="hint">Write the pairs in the right order. Learners see the right side shuffled.</span>
      <NoteFields hint={node.attrs.hint ?? ''} feedback={node.attrs.feedback ?? ''} onSave={(p) => updateAttributes(p)} />
    </NodeViewWrapper>
  );
}

export const Match = Node.create({
  name: 'match',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: null },
    pairs: { default: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }] },
    extras: { default: [] },
    hint: { default: '' },
    feedback: { default: '' },
  }),
  parseHTML: () => [{ tag: 'div[data-match]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-match': '' })],
  addNodeView: () => ReactNodeViewRenderer(MatchView),
});

// Word order -----------------------------------------------------------------------------

function OrderView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode } = props;
  const sentence: string = node.attrs.sentence ?? '';
  return (
    <NodeViewWrapper className="block-node q-block" contentEditable={false}>
      <BlockHead label="Word order" onRemove={deleteNode} p={props} />
      <input className="mcq-prompt" value={sentence} placeholder="Type the correct sentence, for example: I have never been to Japan." onChange={(e) => updateAttributes({ sentence: e.target.value })} />
      <span className="hint">Learners see the words shuffled and put them back in order.</span>
      <NoteFields hint={node.attrs.hint ?? ''} feedback={node.attrs.feedback ?? ''} onSave={(p) => updateAttributes(p)} />
    </NodeViewWrapper>
  );
}

export const Order = Node.create({
  name: 'order',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null }, sentence: { default: '' }, hint: { default: '' }, feedback: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-order]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-order': '' })],
  addNodeView: () => ReactNodeViewRenderer(OrderView),
});

// Long answer ------------------------------------------------------------------------------

function WritingView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode } = props;
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.min(2000, parseInt(v, 10) || 0)));
  return (
    <NodeViewWrapper className="block-node q-block" contentEditable={false}>
      <BlockHead label="Long answer" onRemove={deleteNode} p={props} />
      <div className="writing-edit">
        <label className="inline-field small-field">
          Minimum words
          <input inputMode="numeric" value={node.attrs.minWords ?? ''} placeholder="80" onChange={(e) => updateAttributes({ minWords: num(e.target.value) })} />
        </label>
        <label className="inline-field small-field">
          Maximum words
          <input inputMode="numeric" value={node.attrs.maxWords ?? ''} placeholder="120" onChange={(e) => updateAttributes({ maxWords: num(e.target.value) })} />
        </label>
      </div>
      <div className="writing-edit">
        <label className="check-row">
          <input type="checkbox" checked={!!node.attrs.rich} onChange={() => updateAttributes({ rich: !node.attrs.rich })} />
          Formatting (bold, italics, lists)
        </label>
        <label className="check-row">
          <input type="checkbox" checked={!!node.attrs.spellcheck} onChange={() => updateAttributes({ spellcheck: !node.attrs.spellcheck })} />
          Spell check
        </label>
        <label className="check-row">
          Marked out of
          <input inputMode="numeric" style={{ width: 44 }} value={node.attrs.points ?? 5} onChange={(e) => updateAttributes({ points: Math.max(1, Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 1)) })} />
        </label>
      </div>
      <label className="inline-field" style={{ alignItems: 'flex-start' }}>
        Model answer
        <textarea rows={3} value={node.attrs.model ?? ''} placeholder="Optional. Learners see it after you mark their writing." onChange={(e) => updateAttributes({ model: e.target.value })} />
      </label>
      <span className="hint">You mark long answers yourself. They don’t count towards the automatic score.</span>
    </NodeViewWrapper>
  );
}

export const Writing = Node.create({
  name: 'writing',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes: () => ({ id: { default: null }, minWords: { default: null }, maxWords: { default: null }, model: { default: '' }, rich: { default: false }, spellcheck: { default: false }, points: { default: 5 } }),
  parseHTML: () => [{ tag: 'div[data-writing]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-writing': '' })],
  addNodeView: () => ReactNodeViewRenderer(WritingView),
});

// Column break (for two-column layouts) ------------------------------------------------------

function ColumnBreakView({ deleteNode, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className={'column-break' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <span>Next column</span>
      <button type="button" onClick={deleteNode} aria-label="Remove column break">
        ×
      </button>
    </NodeViewWrapper>
  );
}

export const ColumnBreak = Node.create({
  name: 'columnBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML: () => [{ tag: 'div[data-column-break]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-column-break': '' })],
  addNodeView: () => ReactNodeViewRenderer(ColumnBreakView),
});

export const newDropGap = () => ({ type: 'dropgap', attrs: { id: newId(), answer: '' } });
export const newWordBank = () => ({ type: 'wordbank', attrs: { extras: [] } });
export const newMatch = () => ({ type: 'match', attrs: { id: newId(), pairs: [{ left: '', right: '' }, { left: '', right: '' }, { left: '', right: '' }], extras: [] } });
export const newOrder = () => ({ type: 'order', attrs: { id: newId(), sentence: '' } });
export const newWriting = () => ({ type: 'writing', attrs: { id: newId(), minWords: null, maxWords: null, model: '', rich: false, spellcheck: false } });
export const newColumnBreak = () => ({ type: 'columnBreak' });
export { LETTERS };
