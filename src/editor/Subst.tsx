import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import { usePopPos } from './usePopPos';
import '../lib/extras.css';

// A substitution slot: the words that can go in one place of a sentence, stacked between two
// vertical lines, as teachers write them on the board.
//   I want to go to | Lisbon    | this summer.
//                   | Istanbul  |
//                   | Hong Kong |

export function SubstSlot({ options }: { options: string[] }) {
  const list = options.filter((o) => o.trim());
  return (
    <span className="subs" role="group" aria-label={list.length ? `One of: ${list.join(', ')}` : 'Substitution slot'}>
      {list.length ? list.map((o, i) => <span key={i} className="subs-o">{o}</span>) : <span className="subs-o subs-empty">options</span>}
    </span>
  );
}

function SubstView({ node, updateAttributes, selected }: NodeViewProps) {
  const options: string[] = node.attrs.options ?? [];
  const [open, setOpen] = useState(options.length === 0);
  const [text, setText] = useState(options.join('\n'));
  const ref = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const popStyle = usePopPos(ref, open, 300);
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as globalThis.Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  });
  const set = (v: string) => {
    setText(v);
    updateAttributes({ options: v.split('\n').map((s) => s.trim()).filter(Boolean) });
  };
  return (
    <NodeViewWrapper as="span" className={'sub-node' + (selected ? ' is-selected' : '')} ref={ref}>
      <span contentEditable={false} onClick={() => setOpen(true)} title="Edit the options">
        <SubstSlot options={options} />
      </span>
      {open && (
        <span className="gap-pop sub-pop" contentEditable={false} style={popStyle}>
          <span className="pop-type">Substitution slot</span>
          <label className="pop-field">
            <span>The words that can go here, one on each line</span>
            <textarea ref={inputRef} rows={4} value={text} placeholder={'Lisbon\nIstanbul\nHong Kong'} onChange={(e) => set(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Escape' && setOpen(false))} />
          </label>
          <span className="hint">Learners see them stacked between two lines, in the middle of the sentence.</span>
        </span>
      )}
    </NodeViewWrapper>
  );
}

export const Subst = Node.create({
  name: 'subst',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  addAttributes: () => ({
    options: {
      default: [],
      parseHTML: (el: HTMLElement) => (el.getAttribute('data-options') ?? '').split('|').filter(Boolean),
      renderHTML: (a: { options: string[] }) => ({ 'data-options': (a.options ?? []).join('|') }),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-subst]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-subst': '' })],
  addNodeView: () => ReactNodeViewRenderer(SubstView),
});
