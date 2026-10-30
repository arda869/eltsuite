import { Mark, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { usePopPos } from './usePopPos';
import { useEffect, useRef, useState } from 'react';

// Marker-pen highlighting in a few soft colours.

export const HIGHLIGHTS = [
  { key: 'yellow', label: 'Yellow', bg: '#fbefa0' },
  { key: 'green', label: 'Green', bg: '#d4eec9' },
  { key: 'blue', label: 'Blue', bg: '#d3e5fa' },
  { key: 'pink', label: 'Pink', bg: '#f9d5e1' },
  { key: 'lilac', label: 'Lilac', bg: '#e3d9f6' },
  { key: 'peach', label: 'Peach', bg: '#fbdcc4' },
  { key: 'mint', label: 'Mint', bg: '#bdece1' },
  { key: 'lavender', label: 'Lavender', bg: '#ccc6fc' },
  { key: 'orange', label: 'Orange', bg: '#ffd09d' },
  { key: 'grey', label: 'Grey', bg: '#dedede' },
];
export const highlightBg = (k?: string) => k && /^#[0-9a-f]{6}$/i.test(k) ? k : HIGHLIGHTS.find((h) => h.key === k)?.bg ?? HIGHLIGHTS[0].bg;

export const Highlight = Mark.create({
  name: 'highlight',
  addAttributes: () => ({
    color: {
      default: 'yellow',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-color') || 'yellow',
      renderHTML: (a: { color: string }) => ({ 'data-color': a.color, style: `background-color: ${highlightBg(a.color)}` }),
    },
  }),
  parseHTML: () => [{ tag: 'mark' }],
  renderHTML: ({ HTMLAttributes }) => ['mark', mergeAttributes(HTMLAttributes, { class: 'hl' }), 0],
});

const PEN = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9.5 2.5l4 4-6 6H3.5v-4z" />
    <path d="M2 14.5h12" />
  </svg>
);

export function Swatches({ editor, onDone }: { editor: Editor; onDone?: () => void }) {
  const cur = editor.isActive('highlight') ? (editor.getAttributes('highlight').color as string) : '';
  return (
    <span className="hl-swatches" role="radiogroup" aria-label="Highlight colour">
      {HIGHLIGHTS.map((h) => (
        <button
          key={h.key}
          type="button"
          role="radio"
          aria-checked={cur === h.key}
          title={h.label}
          className={'hl-sw' + (cur === h.key ? ' on' : '')}
          style={{ background: h.bg }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            editor.chain().focus().setMark('highlight', { color: h.key }).run();
            onDone?.();
          }}
        />
      ))}
      <label className="custom-colour">Custom<input type="color" aria-label="Custom highlight colour" value={/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#fbefa0'} onChange={(e) => editor.chain().focus().setMark('highlight', { color: e.target.value }).run()} /></label>
      <button
        type="button"
        className="hl-none"
        title="Remove highlight"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          editor.chain().focus().unsetMark('highlight').run();
          onDone?.();
        }}
      >
        ×
      </button>
    </span>
  );
}

// Toolbar button: applies the last colour; the small arrow opens the colours.
export function HighlightTool({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState('yellow');
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const active = editor.isActive('highlight');
  const popStyle = usePopPos(ref, open, 240);
  return (
    <span className="hl-tool" ref={ref}>
      <button
        type="button"
        className={'tool' + (active ? ' on' : '')}
        title="Highlight"
        aria-label="Highlight"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (active ? editor.chain().focus().unsetMark('highlight').run() : editor.chain().focus().setMark('highlight', { color: last }).run())}
      >
        <span className="ti-row">
          {PEN}
          <span className="hl-bar" style={{ background: highlightBg(last) }} />
        </span>
      </button>
      <button type="button" className="tool hl-more" aria-label="Highlight colours" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        ▾
      </button>
      {open && (
        <span className="hl-pop" style={popStyle} onClick={() => setLast(editor.getAttributes('highlight').color ?? last)}>
          <Swatches editor={editor} onDone={() => (setLast(editor.getAttributes('highlight').color || last), setOpen(false))} />
        </span>
      )}
    </span>
  );
}
