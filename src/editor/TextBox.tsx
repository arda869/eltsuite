import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { ReactNode } from 'react';

// A container for reading texts and model answers, shown in one of several styles.

export type BoxStyle = 'info' | 'box' | 'paper' | 'browser' | 'email' | 'notebook' | 'sticky' | 'speech' | 'message';
export type BoxTone = 'grey' | 'sand' | 'sage' | 'sky' | 'rose';

export const BOX_STYLES: { key: BoxStyle; label: string }[] = [
  { key: 'info', label: 'Information box' },
  { key: 'box', label: 'Box' },
  { key: 'paper', label: 'Page' },
  { key: 'browser', label: 'Web page' },
  { key: 'email', label: 'Email' },
  { key: 'notebook', label: 'Notebook' },
  { key: 'sticky', label: 'Sticky note' },
  { key: 'speech', label: 'Speech bubble' },
  { key: 'message', label: 'Text message' },
];
export const BOX_TONES: { key: BoxTone; label: string; bg: string }[] = [
  { key: 'grey', label: 'Grey', bg: '#f4f4f3' },
  { key: 'sand', label: 'Sand', bg: '#f6f1e8' },
  { key: 'sage', label: 'Sage', bg: '#eef3ef' },
  { key: 'sky', label: 'Sky', bg: '#eef2f6' },
  { key: 'rose', label: 'Rose', bg: '#f7eeec' },
];

export const SYMBOLS = ['!', '?', 'i', '✓', '★', '✎', '→', '≠', '＋'];

export type BoxAttrs = { style: BoxStyle; tone: BoxTone; label: string; meta: string; side: 'left' | 'right'; symbol: string };

// Shared frame used by both the editor and the learner view.
export function BoxFrame({ attrs, children, editable, onMeta }: { attrs: BoxAttrs; children: ReactNode; editable?: boolean; onMeta?: (patch: Partial<BoxAttrs>) => void }) {
  const ce = editable ? { contentEditable: false as const } : {};
  const field = (key: 'label' | 'meta', placeholder: string, className: string) =>
    editable ? (
      <input contentEditable={false} className={className + ' box-input'} value={attrs[key] ?? ''} placeholder={placeholder} onChange={(e) => onMeta?.({ [key]: e.target.value })} />
    ) : attrs[key] ? (
      <span className={className}>{attrs[key]}</span>
    ) : null;

  const cls = `tbox s-${attrs.style} t-${attrs.tone ?? 'grey'} side-${attrs.side ?? 'left'}`;
  switch (attrs.style) {
    case 'info':
      return (
        <div className={cls}>
          {attrs.symbol && (
            <span className="tbox-symbol" aria-hidden="true" {...ce}>
              {attrs.symbol}
            </span>
          )}
          <div className="tbox-main">
            {field('label', 'Title, for example: Grammar', 'tbox-title')}
            <div className="tbox-body">{children}</div>
          </div>
        </div>
      );
    case 'browser':
      return (
        <div className={cls}>
          <div className="tbox-chrome" {...ce}>
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {field('meta', 'www.example.com', 'url')}
          </div>
          {field('label', 'Page title (optional)', 'tbox-title')}
          <div className="tbox-body">{children}</div>
        </div>
      );
    case 'email':
      return (
        <div className={cls}>
          <div className="tbox-mailhead" {...ce}>
            <span className="k">From</span>
            {field('meta', 'Sara', 'v')}
            <span className="k">Subject</span>
            {field('label', 'Greetings from Lisbon', 'v')}
          </div>
          <div className="tbox-body">{children}</div>
        </div>
      );
    case 'speech':
    case 'message':
      return (
        <div className={cls}>
          {field('label', 'Speaker’s name (optional)', 'speaker')}
          <div className="tbox-body bubble">{children}</div>
          {attrs.style === 'message' && field('meta', '19:42', 'time')}
        </div>
      );
    case 'paper':
      return (
        <div className="paper-wrap">
          <div className={cls}>
            {field('label', 'Title (optional)', 'tbox-title')}
            <div className="tbox-body">{children}</div>
          </div>
        </div>
      );
    default:
      return (
        <div className={cls}>
          {field('label', 'Label (optional)', 'tbox-title')}
          <div className="tbox-body">{children}</div>
        </div>
      );
  }
}

function TextBoxView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const attrs = node.attrs as BoxAttrs;
  return (
    <NodeViewWrapper className={'tbox-node' + (selected ? ' is-selected' : '')}>
      <div className="tbox-tools" contentEditable={false}>
        <span className="drag-handle" data-drag-handle title="Drag to move" aria-hidden="true">
          ⋮⋮
        </span>
        <span className="pop-type">{attrs.style === 'info' ? 'Information box' : 'Text box'}</span>
        <select value={attrs.style} onChange={(e) => updateAttributes({ style: e.target.value })} aria-label="Style">
          {BOX_STYLES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        {attrs.style === 'info' && (
          <span className="symbols" role="radiogroup" aria-label="Symbol">
            {['', ...SYMBOLS].map((sy) => (
              <button key={sy || 'none'} type="button" role="radio" aria-checked={(attrs.symbol ?? '') === sy} className={(attrs.symbol ?? '') === sy ? 'on' : ''} onClick={() => updateAttributes({ symbol: sy })} title={sy ? `Symbol ${sy}` : 'No symbol'}>
                {sy || '–'}
              </button>
            ))}
          </span>
        )}
        {(
          <span className="tone-label">Colour</span>
        )}
        {(
          <span className="tones" role="radiogroup" aria-label="Colour">
            {BOX_TONES.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={attrs.tone === t.key} title={t.label} className={attrs.tone === t.key ? 'on' : ''} style={{ background: t.bg }} onClick={() => updateAttributes({ tone: t.key })} />
            ))}
          </span>
        )}
        {(attrs.style === 'speech' || attrs.style === 'message') && (
          <span className="seg small-seg" role="radiogroup" aria-label="Bubble side">
            {(['left', 'right'] as const).map((sd) => (
              <button key={sd} type="button" role="radio" aria-checked={(attrs.side ?? 'left') === sd} className={(attrs.side ?? 'left') === sd ? 'on' : ''} onClick={() => updateAttributes({ side: sd })}>
                {sd === 'left' ? 'From the left' : 'From the right'}
              </button>
            ))}
          </span>
        )}
        <button type="button" className="remove" onClick={deleteNode}>
          Remove
        </button>
      </div>
      <BoxFrame attrs={attrs} editable onMeta={(p) => updateAttributes(p)}>
        <NodeViewContent className="tbox-content" />
      </BoxFrame>
    </NodeViewWrapper>
  );
}

export const TextBox = Node.create({
  name: 'textBox',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  draggable: true,
  addAttributes: () => ({
    style: { default: 'box' },
    tone: { default: 'grey' },
    label: { default: '' },
    meta: { default: '' },
    side: { default: 'left' },
    symbol: { default: '!' },
  }),
  parseHTML: () => [{ tag: 'div[data-text-box]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-text-box': '' }), 0],
  addNodeView: () => ReactNodeViewRenderer(TextBoxView),
});

export const newTextBox = (style: BoxStyle = 'box', tone: BoxTone = 'grey', label = '', symbol = '!') => ({
  type: 'textBox',
  attrs: { style, tone, label, meta: '', side: 'left', symbol },
  content: [{ type: 'paragraph' }],
});
