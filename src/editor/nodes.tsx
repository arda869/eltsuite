import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { newId } from '../lib/tasks';

const LETTERS = 'abcdefghij';

// Gap fill ---------------------------------------------------------------------

function GapView({ node, updateAttributes, selected }: NodeViewProps) {
  const answers: string[] = node.attrs.answers ?? [];
  const [open, setOpen] = useState(answers.length === 0);
  const [value, setValue] = useState(answers.join(' | '));
  const ref = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as globalThis.Node)) save();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  });

  function save() {
    const list = value.split('|').map((s) => s.trim()).filter(Boolean);
    updateAttributes({ answers: list });
    setOpen(false);
  }

  return (
    <NodeViewWrapper as="span" className={'gap-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <span className={'gap-chip' + (answers.length ? '' : ' empty')} contentEditable={false} onClick={() => setOpen(true)} title="Edit accepted answers">
        {answers.length ? answers.join(' / ') : 'answer'}
      </span>
      {open && (
        <span className="gap-pop" contentEditable={false}>
          <input
            ref={inputRef}
            value={value}
            placeholder="have been | 've been"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
              if (e.key === 'Escape') setOpen(false);
              e.stopPropagation();
            }}
          />
          <span className="hint">Separate other accepted answers with |</span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Gap = Node.create({
  name: 'gap',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null },
      answers: { default: [] },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-gap]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-gap': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(GapView);
  },
});

// Multiple choice ------------------------------------------------------------------

function McqView({ node, updateAttributes, selected, deleteNode }: NodeViewProps) {
  const options: string[] = node.attrs.options ?? [];
  const correct: number = node.attrs.correct ?? -1;
  const setOption = (i: number, v: string) => updateAttributes({ options: options.map((o, k) => (k === i ? v : o)) });

  return (
    <NodeViewWrapper className={'mcq-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <span>Multiple choice</span>
        <button type="button" onClick={deleteNode}>
          Remove
        </button>
      </div>
      <input className="mcq-prompt" value={node.attrs.prompt} placeholder="Question" onChange={(e) => updateAttributes({ prompt: e.target.value })} />
      <div className="mcq-options">
        {options.map((o, i) => (
          <div key={i} className="mcq-option">
            <button
              type="button"
              className={'letter' + (i === correct ? ' right' : '')}
              title={i === correct ? 'Correct answer' : 'Mark as correct'}
              aria-label={i === correct ? 'Correct answer' : 'Mark as correct'}
              onClick={() => updateAttributes({ correct: i })}
            >
              {LETTERS[i]}
            </button>
            <input
              value={o}
              style={{ width: `${Math.max(14, o.length + 2)}ch` }}
              placeholder={`Option ${LETTERS[i]}`}
              onChange={(e) => setOption(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && options.length < 8) {
                  e.preventDefault();
                  updateAttributes({ options: [...options.slice(0, i + 1), '', ...options.slice(i + 1)] });
                }
                if (e.key === 'Backspace' && !o && options.length > 2) {
                  e.preventDefault();
                  updateAttributes({
                    options: options.filter((_, k) => k !== i),
                    correct: correct === i ? -1 : correct > i ? correct - 1 : correct,
                  });
                }
              }}
            />
            {i === correct && <span className="right-note">correct</span>}
          </div>
        ))}
        <span className="hint">Enter adds an option · click a letter to mark it correct</span>
      </div>
    </NodeViewWrapper>
  );
}

export const Mcq = Node.create({
  name: 'mcq',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      id: { default: null },
      prompt: { default: '' },
      options: { default: ['', '', ''] },
      correct: { default: -1 },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-mcq]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-mcq': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(McqView);
  },
});

export const newGap = () => ({ type: 'gap', attrs: { id: newId(), answers: [] } });
export const newMcq = () => ({ type: 'mcq', attrs: { id: newId(), prompt: '', options: ['', '', ''], correct: -1 } });
