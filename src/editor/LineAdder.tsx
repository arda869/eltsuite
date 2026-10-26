import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { UiIcon } from '../components/UiIcon';

// A "+" in the left margin beside the line under the pointer. Click it for a new, empty line below.
export function LineAdder({ editor, host }: { editor: Editor; host: HTMLElement | null }) {
  const [top, setTop] = useState<number | null>(null);
  const target = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!host) return;
    const dom = editor.view.dom as HTMLElement;
    const hide = () => {
      target.current = null;
      setTop(null);
    };
    const move = (e: MouseEvent) => {
      if (!editor.isEditable) return hide();
      if ((e.target as HTMLElement).closest('.line-add')) return;
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
      const t = r.top - host.getBoundingClientRect().top + Math.min(r.height, lh) / 2;
      target.current = best;
      setTop((old) => (old !== null && Math.abs(old - t) < 0.5 ? old : t));
    };
    const leave = (e: MouseEvent) => {
      if (!host.contains(e.relatedTarget as Node)) hide();
    };
    host.addEventListener('mousemove', move);
    host.addEventListener('mouseleave', leave);
    return () => {
      host.removeEventListener('mousemove', move);
      host.removeEventListener('mouseleave', leave);
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
    <button type="button" className="line-add" style={{ top }} aria-label="Add a line below" data-tip="Add a line below" onMouseDown={(e) => e.preventDefault()} onClick={add}>
      <UiIcon name="plus" />
    </button>
  );
}
