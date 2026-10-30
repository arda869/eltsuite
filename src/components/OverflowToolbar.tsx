import { Children, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '../lib/useDismiss';

// Keep one row at any width, with whole tool groups in a keyboard-accessible popover.
export function OverflowToolbar({ children }: { children: ReactNode }) {
  const groups = Children.toArray(children);
  const [count, setCount] = useState(groups.length);
  const [open, setOpen] = useState(false);
  const root = useDismiss<HTMLDivElement>(open, () => setOpen(false));
  const widths = useRef(new Map<number, number>());
  const refs = useRef(new Map<number, HTMLSpanElement>());
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      refs.current.forEach((node, i) => {
        const w = node.getBoundingClientRect().width;
        if (w) widths.current.set(i, w);
      });
      const available = el.clientWidth - 16;
      const total = groups.reduce<number>((n, _, i) => n + (widths.current.get(i) ?? 0), 0);
      let used = 0, next = groups.length;
      if (total > available) {
        next = 0;
        for (let i = 0; i < groups.length; i++) {
          const w = widths.current.get(i) ?? 0;
          if (used + w > available - 76) break;
          used += w;
          next++;
        }
      }
      setCount(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [groups.length, root]);
  const group = (node: ReactNode, i: number) => (
    <span className="overflow-group" key={i} ref={(el) => { if (el) refs.current.set(i, el); else refs.current.delete(i); }}>{node}</span>
  );
  return (
    <div className="ne-bar cd-bar cd-pagebar single-toolbar" role="toolbar" aria-label="Formatting" ref={root} onMouseDown={(e) => { if ((e.target as HTMLElement).closest('.sel-list')) e.stopPropagation(); }}>
      {groups.slice(0, count).map(group)}
      {count < groups.length && <button type="button" className="tool overflow-toggle" aria-expanded={open} aria-controls="document-more-tools" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen((v) => !v)}>••• More</button>}
      <div id="document-more-tools" className={'overflow-tools' + (open ? ' is-open' : '')} role="group" aria-label="More formatting tools" aria-hidden={!open}>
        {groups.slice(count).map((node, i) => group(node, count + i))}
      </div>
    </div>
  );
}
