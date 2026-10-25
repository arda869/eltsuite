import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState, type ReactNode } from 'react';
import { Grip } from './nodes';

// A box that stays closed until a learner opens it: hints, model answers, "Notice" answers.

function RevealView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className={'reveal-node' + (selected ? ' is-selected' : '')}>
      <div className="reveal-ed-head" contentEditable={false}>
        <Grip editor={editor} getPos={getPos} />
        <span className="pop-type">Reveal box</span>
        <input className="reveal-label-input" value={node.attrs.label ?? ''} placeholder="Button text, e.g. Show the answer" onChange={(e) => updateAttributes({ label: e.target.value })} />
        <button type="button" className="remove" onClick={deleteNode}>
          Remove
        </button>
      </div>
      <NodeViewContent className="reveal-ed-body" />
      <span className="hint" contentEditable={false}>
        Learners see a button. The text above appears when they open it.
      </span>
    </NodeViewWrapper>
  );
}

export const RevealBox = Node.create({
  name: 'reveal',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,
  addAttributes: () => ({ label: { default: 'Show the answer' } }),
  parseHTML: () => [{ tag: 'div[data-reveal]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-reveal': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(RevealView),
});

export const newReveal = (label = 'Show the answer', text = '') => ({ type: 'reveal', attrs: { label }, content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }] });

export function RevealBlock({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'reveal-box' + (open ? ' open' : '')}>
      <button type="button" className="reveal-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
        {open ? 'Hide' : label || 'Show'}
      </button>
      <div className="reveal-body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}
