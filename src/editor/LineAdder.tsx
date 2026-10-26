import { zoomOf } from '../lib/zoom';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { UiIcon } from '../components/UiIcon';

// A "+" in the left margin, level with the space under the line the pointer is on: where the new,
// empty line will go when it is clicked.
export function LineAdder({ editor, host }: { editor: Editor; host: HTMLElement | null }) {
  const [top, setTop] = useState<number | null>(null);
  const [below, setBelow] = useState(0); // where the new line goes: under the block
  const target = useRef<HTMLElement | null>(null);
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
      setTop(null);
    };
    const move = (e: MouseEvent) => {
      keep();
      if (!editor.isEditable) return hide();
      if ((e.target as HTMLElement).closest('.line-add')) return;
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
      const lh = parseFloat(getComputedStyle(best).lineHeight) || 26;
      const t = (r.top - host.getBoundingClientRect().top) / zoomOf(host) + Math.min(r.height / zoomOf(best), lh) / 2;
      target.current = best;
      // Halfway into the space under the block, where the new line will appear.
      const next = best.nextElementSibling as HTMLElement | null;
      const gapBelow = next ? Math.max(0, next.getBoundingClientRect().top - r.bottom) / 2 : 4;
      setBelow((r.bottom + gapBelow - host.getBoundingClientRect().top) / zoomOf(host));
      setTop((old) => (old !== null && Math.abs(old - t) < 0.5 ? old : t));
    };
    const leave = (e: MouseEvent) => {
      if (host.contains(e.relatedTarget as Node)) return;
      keep();
      later.current = window.setTimeout(hide, 450);
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
    const el = target.current;
    if (!el) return;
    let after = -1;
    editor.state.doc.forEach((node, offset) => {
      if (editor.view.nodeDOM(offset) === el) after = offset + node.nodeSize;
    });
    if (after < 0) return;
    editor.chain().insertContentAt(after, { type: 'paragraph' }).setTextSelection(after + 1).focus().run();
    setTop(null);
  };
  return (
    <>
    <button type="button" className="line-add" style={{ top: below }} aria-label="Add a line below" data-tip="Add a line below" onMouseDown={(e) => e.preventDefault()} onMouseEnter={keep} onMouseLeave={(e) => !host?.contains(e.relatedTarget as Node) && (later.current = window.setTimeout(() => setTop(null), 300))} onClick={add}>
      <UiIcon name="plus" />
    </button>
    <span className="line-add-guide" style={{ top: below }} aria-hidden="true" />
    </>
  );
}
