import { Mark, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/react';
import { usePopPos } from './usePopPos';
import { useEffect, useRef, useState } from 'react';

// Text colour, from a short palette that sits well with the rest of the page.
export const TEXT_COLORS = [
  { key: 'grey', label: 'Grey', c: '#85847f' },
  { key: 'accent', label: 'Class colour', c: 'var(--accent-text)' },
  { key: 'blue', label: 'Blue', c: '#2f5fa8' },
  { key: 'green', label: 'Green', c: '#3f7a4f' },
  { key: 'plum', label: 'Plum', c: '#7a4a86' },
  { key: 'red', label: 'Red', c: '#a4473b' },
  { key: 'black', label: 'Black', c: '#111111' },
  { key: 'white', label: 'White', c: '#ffffff' },
  { key: 'teal', label: 'Teal', c: '#147d82' },
  { key: 'orange', label: 'Orange', c: '#b85c12' },
  { key: 'navy', label: 'Navy', c: '#253a72' },
  { key: 'rose', label: 'Rose', c: '#ac386a' },
];
export const textColor = (k?: string) => k && /^#[0-9a-f]{6}$/i.test(k) ? k : TEXT_COLORS.find((t) => t.key === k)?.c;

export const TextColor = Mark.create({
  name: 'textColor',
  addAttributes: () => ({
    color: {
      default: 'grey',
      parseHTML: (el: HTMLElement) => el.getAttribute('data-tc') || 'grey',
      renderHTML: (a: { color: string }) => ({ 'data-tc': a.color, style: `color: ${textColor(a.color)}` }),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-tc]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes), 0],
});

export function ColorSwatches({ editor, onDone }: { editor: Editor; onDone?: () => void }) {
  const cur = editor.isActive('textColor') ? (editor.getAttributes('textColor').color as string) : '';
  return (
    <span className="hl-swatches" role="radiogroup" aria-label="Text colour">
      {TEXT_COLORS.map((t) => (
        <button
          key={t.key}
          type="button"
          role="radio"
          aria-checked={cur === t.key}
          title={t.label}
          className={'tc-sw' + (cur === t.key ? ' on' : '')}
          style={{ color: t.c }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (editor.chain().focus().setMark('textColor', { color: t.key }).run(), onDone?.())}
        >
          A
        </button>
      ))}
      <label className="custom-colour">Custom<input type="color" aria-label="Custom text colour" value={/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#2f5fa8'} onChange={(e) => editor.chain().focus().setMark('textColor', { color: e.target.value }).run()} /></label>
      <button type="button" className="hl-none" title="Normal colour" onMouseDown={(e) => e.preventDefault()} onClick={() => (editor.chain().focus().unsetMark('textColor').run(), onDone?.())}>
        ×
      </button>
    </span>
  );
}

export function TextColorTool({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const cur = editor.isActive('textColor') ? textColor(editor.getAttributes('textColor').color) : undefined;
  const popStyle = usePopPos(ref, open, 260);
  return (
    <span className="hl-tool" ref={ref}>
      <button type="button" className={'tool' + (cur ? ' on' : '')} title="Text colour" aria-label="Text colour" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((o) => !o)}>
        <span className="tc-icon">
          A<span style={{ background: cur ?? 'var(--accent)' }} />
        </span>
      </button>
      {open && (
        <span className="hl-pop" style={popStyle}>
          <ColorSwatches editor={editor} onDone={() => setOpen(false)} />
        </span>
      )}
    </span>
  );
}
