import { zoomOf } from '../lib/zoom';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { UiIcon } from '../components/UiIcon';

// A "+" in the left margin, level with the space under the line the pointer is on: where the new,
// empty line will go when it is clicked.
export function LineAdder({ editor, host }: { editor: Editor; host: HTMLElement | null }) {
  const [top, setTop] = useState<number | null>(null);
  const [below, setBelow] = useState(0); // where the new line goes: under the block
  const target = useRef<HTMLElement | null>(null);
  const insertAt = useRef<number | null>(null);
  // The + sits in the margin outside the editor, so leaving the editor waits a moment: long enough
  // to reach the + without it vanishing.
  const later = useRef(0);
  const keep = () => window.clearTimeout(later.current);

  useEffect(() => {
    if (!host) return;
    const dom = editor.view.dom as HTMLElement;
    const hide = () => {
      keep();
      target.current = null;
      insertAt.current = null;
      setTop(null);
    };
    const move = (e: MouseEvent) => {
      keep();
      if (!editor.isEditable) return hide();
      if ((e.target as HTMLElement).closest('.line-add')) return;
      // Keep the selected line while the pointer crosses the margin to the button.
      if (target.current && e.clientX < dom.getBoundingClientRect().left) return;
      // A gap or choice shows its own drag handle at the start of the line; keep out of its way.
      if ((e.target as HTMLElement).closest('.grip')) return;
      // The top-level block level with the pointer, or the nearest one when the pointer is in a gap.
      let best: HTMLElement | null = null;
      let dist = Infinity;
      for (const k of Array.from(dom.children) as HTMLElement[]) {
        const r = k.getBoundingClientRect();
        if (!r.height) continue;
        const d = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
        if (d < dist) {
          dist = d;
          best = k;
        }
        if (d === 0) break;
      }
      if (!best || dist > 28) return hide();
      const r = best.getBoundingClientRect();
      target.current = best;
      const at = editor.view.posAtDOM(best, 0);
      const resolved = editor.state.doc.resolve(at);
      insertAt.current = resolved.depth ? resolved.after(1) : at;
      // Place the button and guide on the same line, between this block and the next.
      const next = best.nextElementSibling as HTMLElement | null;
      const gapBelow = next ? Math.max(0, next.getBoundingClientRect().top - r.bottom) / 2 : 4;
      const between = (r.bottom + gapBelow - host.getBoundingClientRect().top) / zoomOf(host);
      setBelow(between);
      setTop((old) => (old !== null && Math.abs(old - between) < 0.5 ? old : between));
    };
    const leave = (e: MouseEvent) => {
      if (host.contains(e.relatedTarget as Node)) return;
      keep();
      later.current = window.setTimeout(hide, 1000);
    };
    host.addEventListener('mousemove', move);
    host.addEventListener('mouseleave', leave);
    return () => {
      host.removeEventListener('mousemove', move);
      host.removeEventListener('mouseleave', leave);
      keep();
    };
  }, [editor, host]);

  if (top === null) return null;
  const add = () => {
    const after = insertAt.current;
    if (after === null) return;
    if (after < 0 || after > editor.state.doc.content.size) return;
    const tr = editor.state.tr.insert(after, editor.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
    editor.view.dispatch(tr);
    editor.commands.focus();
    setTop(null);
  };
  return (
    <>
    <button type="button" className="line-add" style={{ top }} aria-label="Add a line below" data-tip="Add a line below" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); add(); }} onClick={(e) => { if (e.detail === 0) add(); }} onMouseEnter={keep} onMouseLeave={(e) => !host?.contains(e.relatedTarget as Node) && (later.current = window.setTimeout(() => setTop(null), 1000))}>
      <UiIcon name="plus" />
    </button>
    <span className="line-add-guide" style={{ top: below }} aria-hidden="true" />
    </>
  );
}
