import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { newId } from '../lib/tasks';
import { NoteFields } from './NoteFields';

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
          <NoteFields hint={node.attrs.hint ?? ''} feedback={node.attrs.feedback ?? ''} onSave={(p) => updateAttributes(p)} />
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
      hint: { default: '' },
      feedback: { default: '' },
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

// Inline choice (multiple choice inside the sentence) -------------------------------

export type ChoiceDisplay = 'letters' | 'radio' | 'dropdown';
const DISPLAYS: { key: ChoiceDisplay; label: string }[] = [
  { key: 'letters', label: 'Letters' },
  { key: 'radio', label: 'Circles' },
  { key: 'dropdown', label: 'List' },
];

function ChoiceView({ node, updateAttributes, selected }: NodeViewProps) {
  const options: string[] = node.attrs.options ?? [];
  const multi: boolean = !!node.attrs.multi;
  const correctList: number[] = multi ? (Array.isArray(node.attrs.correct) ? node.attrs.correct : []) : typeof node.attrs.correct === 'number' && node.attrs.correct >= 0 ? [node.attrs.correct] : [];
  const correct: number = correctList[0] ?? -1;
  const isRight = (i: number) => correctList.includes(i);
  const mark = (i: number) =>
    multi ? updateAttributes({ correct: isRight(i) ? correctList.filter((x) => x !== i) : [...correctList, i] }) : updateAttributes({ correct: i });
  const display: ChoiceDisplay = node.attrs.display ?? 'letters';
  const filled = options.filter((o) => o.trim());
  const [open, setOpen] = useState(filled.length === 0);
  const ref = useRef<HTMLSpanElement>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputs.current[0]?.focus(), 30);
  }, [open]);

  useEffect(() => {
    if (focusIndex !== null) {
      inputs.current[focusIndex]?.focus();
      setFocusIndex(null);
    }
  }, [focusIndex, options.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const setOption = (i: number, v: string) => updateAttributes({ options: options.map((o, k) => (k === i ? v : o)) });

  const summary = filled.length ? (
    filled.map((o, i) => (
      <span key={i} className={isRight(i) ? 'c-opt right' : 'c-opt'}>
        {display === 'letters' && <span className="c-letter">{LETTERS[i]}</span>}
        {display === 'radio' && <span className="c-radio" />}
        {o}
        {display === 'dropdown' && i < filled.length - 1 && <span className="c-sep">/</span>}
      </span>
    ))
  ) : (
    <span className="c-empty">choices</span>
  );

  return (
    <NodeViewWrapper as="span" className={'choice-node' + (selected ? ' is-selected' : '') + ' d-' + display} ref={ref}>
      <span className="choice-chip" contentEditable={false} onClick={() => setOpen(true)} title="Edit choices">
        {display === 'dropdown' ? <span className="c-drop">{summary}<span className="c-caret">▾</span></span> : summary}
      </span>
      {open && (
        <span className="choice-pop" contentEditable={false} onKeyDown={(e) => e.stopPropagation()}>
          <span className="seg" role="radiogroup" aria-label="Show as">
            {DISPLAYS.map((d) => (
              <button key={d.key} type="button" role="radio" aria-checked={display === d.key} className={display === d.key ? 'on' : ''} onClick={() => updateAttributes({ display: d.key })}>
                {d.label}
              </button>
            ))}
          </span>
          {options.map((o, i) => (
            <span key={i} className="mcq-option">
              <button
                type="button"
                className={'letter' + (isRight(i) ? ' right' : '')}
                title={isRight(i) ? 'Correct answer' : 'Mark as correct'}
                aria-label={isRight(i) ? 'Correct answer' : 'Mark as correct'}
                onClick={() => mark(i)}
              >
                {LETTERS[i]}
              </button>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={o}
                placeholder={`Option ${LETTERS[i]}`}
                onChange={(e) => setOption(i, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (i === options.length - 1 && options.length < 8) {
                      updateAttributes({ options: [...options, ''] });
                      setFocusIndex(i + 1);
                    } else if (i < options.length - 1) setFocusIndex(i + 1);
                  }
                  if (e.key === 'Backspace' && !o && options.length > 2) {
                    e.preventDefault();
                    updateAttributes({
                      options: options.filter((_, k) => k !== i),
                      correct: multi ? correctList.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)) : correct === i ? -1 : correct > i ? correct - 1 : correct,
                    });
                    setFocusIndex(Math.max(0, i - 1));
                  }
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
              {isRight(i) && <span className="right-note">correct</span>}
            </span>
          ))}
          <label className="check-row">
            <input
              type="checkbox"
              checked={multi}
              onChange={() => updateAttributes(multi ? { multi: false, correct: correctList[0] ?? -1 } : { multi: true, correct: correctList })}
            />
            More than one correct answer
          </label>
          <span className="hint">Enter for the next option · click a letter to mark it correct</span>
          <NoteFields hint={node.attrs.hint ?? ''} feedback={node.attrs.feedback ?? ''} onSave={(p) => updateAttributes(p)} />
          {correctList.length === 0 && filled.length > 0 && <span className="error small">Mark the correct option.</span>}
          <button type="button" className="btn small-btn" style={{ alignSelf: 'flex-end' }} onClick={() => setOpen(false)}>
            Done
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Choice = Node.create({
  name: 'choice',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      id: { default: null },
      options: { default: ['', '', ''] },
      correct: { default: -1 },
      multi: { default: false },
      display: { default: 'letters' },
      hint: { default: '' },
      feedback: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-choice]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-choice': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ChoiceView);
  },
});

export const newChoice = (display: ChoiceDisplay = 'letters', options: string[] = ['', '', '']) => ({
  type: 'choice',
  attrs: { id: newId(), options, correct: -1, multi: false, display },
});
