import { NSelect } from '../components/Select';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useBankPages } from '../lib/notebookPages';
import { useEditorClass } from './context';
import { Grip } from './nodes';

// A card in the task that opens a grammar or vocabulary bank page in the notebook.
export const BOOK_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v15H6a2 2 0 0 0-2 2z" />
    <path d="M4 19a2 2 0 0 1 2-2h13M8 7h7" />
  </svg>
);

function BankLinkView({ node, updateAttributes, deleteNode, editor, getPos, selected }: NodeViewProps) {
  const { classId } = useEditorClass();
  const pages = useBankPages(classId);
  const bank = (node.attrs.bank ?? 'grammar') as 'grammar' | 'vocab';
  const list = pages.filter((p) => p.bank === bank);
  return (
    <NodeViewWrapper className={'block-node banklink-node' + (selected ? ' is-selected' : '')} contentEditable={false}>
      <div className="mcq-tools">
        <Grip editor={editor} getPos={getPos} />
        <span className="block-label">{bank === 'vocab' ? 'Vocabulary bank link' : 'Grammar bank link'}</span>
        <button type="button" className="remove" style={{ marginLeft: 'auto' }} onClick={deleteNode}>
          Remove
        </button>
      </div>
      <div className="bl-edit">
        <NSelect value={node.attrs.entryId ?? ''} onChange={(e) => updateAttributes({ entryId: e.target.value, title: list.find((p) => p.id === e.target.value)?.title ?? '' })}>
          <option value="">Choose a page…</option>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </NSelect>
        {list.length === 0 && <span className="hint">No pages in this bank yet. Add them in the class Notebook.</span>}
        <input value={node.attrs.label ?? ''} placeholder="Label (optional), for example: See the rule" onChange={(e) => updateAttributes({ label: e.target.value })} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <BankLinkCard bank={bank} title={node.attrs.title} label={node.attrs.label} />
    </NodeViewWrapper>
  );
}

export function BankLinkCard({ bank, title, label, onOpen }: { bank: 'grammar' | 'vocab'; title?: string; label?: string; onOpen?: () => void }) {
  return (
    <button type="button" className="bl-card" disabled={!onOpen} onClick={onOpen}>
      <span className="bl-icon">{BOOK_ICON}</span>
      <span className="bl-text">
        <span className="eyebrow">{bank === 'vocab' ? 'Vocabulary bank' : 'Grammar bank'}</span>
        <span className="bl-title">{title || 'Choose a page'}</span>
        {label && <span className="hint">{label}</span>}
      </span>
      <span className="bl-arrow" aria-hidden="true">
        →
      </span>
    </button>
  );
}

export const BankLinkNode = Node.create({
  name: 'bankLink',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({ bank: { default: 'grammar' }, entryId: { default: '' }, title: { default: '' }, label: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-banklink]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-banklink': '' })],
  addNodeView: () => ReactNodeViewRenderer(BankLinkView),
});
export const newBankLink = (bank: 'grammar' | 'vocab') => ({ type: 'bankLink', attrs: { bank, entryId: '', title: '', label: '' } });
