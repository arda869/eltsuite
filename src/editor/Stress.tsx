import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { Grip } from './nodes';

// A word with its stressed syllable marked: bold, a small box above it, or slightly bigger.

export type StressStyle = 'bold' | 'box' | 'big';
export const STRESS_STYLES: { key: StressStyle; label: string }[] = [
  { key: 'box', label: 'Box above' },
  { key: 'bold', label: 'Bold' },
  { key: 'big', label: 'Bigger' },
];

export const splitSyllables = (s: string) => s.split(/[·.\-|/]/).filter((x) => x.length);

export function StressedWord({ syllables, stressed, style }: { syllables: string[]; stressed: number; style: StressStyle }) {
  return (
    <span className={'stress-word st-' + style} aria-label={syllables.map((s, i) => (i === stressed ? s.toUpperCase() : s)).join('')}>
      {syllables.map((s, i) => (
        <span key={i} className={'syl' + (i === stressed ? ' stressed' : '')} aria-hidden="true">
          {s}
        </span>
      ))}
    </span>
  );
}

function StressView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const syllables: string[] = node.attrs.syllables ?? [];
  const [open, setOpen] = useState(syllables.length === 0);
  const [text, setText] = useState(syllables.join('·'));
  const ref = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const style = (node.attrs.style ?? 'box') as StressStyle;
  const stressed = Number(node.attrs.stressed ?? 0);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  });

  const setWord = (v: string) => {
    setText(v);
    const parts = splitSyllables(v);
    updateAttributes({ syllables: parts, stressed: Math.min(stressed, Math.max(0, parts.length - 1)) });
  };

  return (
    <NodeViewWrapper as="span" className={'stress-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <Grip editor={editor} getPos={getPos} />
      <span className="stress-chip" contentEditable={false} onClick={() => setOpen(true)} title="Edit word stress">
        {syllables.length ? <StressedWord syllables={syllables} stressed={stressed} style={style} /> : <span className="stress-empty">word stress</span>}
      </span>
      {open && (
        <span className="gap-pop stress-pop" contentEditable={false}>
          <span className="pop-type">Word stress</span>
          <label className="pop-field">
            <span>Word, with a dot between syllables</span>
            <input ref={inputRef} value={text} placeholder="pho·to·graph" onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setOpen(false))} />
          </label>
          <span className="hint">Type . or - between syllables. Then tap the stressed syllable.</span>
          {syllables.length > 0 && (
            <span className="stress-pick" role="radiogroup" aria-label="Stressed syllable">
              {syllables.map((s, i) => (
                <button key={i} type="button" role="radio" aria-checked={i === stressed} className={i === stressed ? 'on' : ''} onClick={() => updateAttributes({ stressed: i })}>
                  {s}
                </button>
              ))}
            </span>
          )}
          <span className="seg small-seg" role="radiogroup" aria-label="How to show the stress">
            {STRESS_STYLES.map((st) => (
              <button key={st.key} type="button" role="radio" aria-checked={style === st.key} className={style === st.key ? 'on' : ''} onClick={() => updateAttributes({ style: st.key })}>
                {st.label}
              </button>
            ))}
          </span>
          <span className="hint">The same style is used every time, so learners always read it the same way.</span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Stress = Node.create({
  name: 'stress',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({
    syllables: {
      default: [],
      parseHTML: (el: HTMLElement) => splitSyllables(el.getAttribute('data-syllables') ?? ''),
      renderHTML: (a: { syllables: string[] }) => ({ 'data-syllables': (a.syllables ?? []).join('·') }),
    },
    stressed: { default: 0 },
    style: { default: 'box' },
  }),
  parseHTML: () => [{ tag: 'span[data-stress]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-stress': '' })],
  addNodeView: () => ReactNodeViewRenderer(StressView),
});

// New word stress items use the style the teacher used last in this task, so it stays consistent.
export const newStress = (style: StressStyle = 'box') => ({ type: 'stress', attrs: { syllables: [], stressed: 0, style } });
