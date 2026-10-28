import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Worksheet view of a lesson: the same tasks, on A4 pages, one column. A task never splits across two
// pages: when it would, it moves to the top of the next page. The task being edited is edited right
// there on the page; the others show as they will print. Nothing here is a copy: every change is a
// change to the lesson itself, so the digital lesson is always the same.

// A4 at 96 pixels to the inch, as the browser prints.
export const A4 = { w: 794, h: 1123, m: 64, gap: 28 };

export type SheetBlock = { id: string; node: ReactNode; on?: boolean; onClick?: () => void; heading?: boolean };

export function SheetView({ title, blocks, footer }: { title: string; blocks: SheetBlock[]; footer?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [pushes, setPushes] = useState<number[]>([]);
  const [pages, setPages] = useState(1);
  const P = A4.h + A4.gap;
  const inner = A4.h - 2 * A4.m;
  // Lay the blocks out page by page from their own heights.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const lay = () => {
      const kids = [...el.querySelectorAll<HTMLElement>(':scope > .sh-block')];
      const next: number[] = [];
      let page = 0;
      let y = 0; // from the top of page 0's text area
      kids.forEach((k, i) => {
        const h = k.offsetHeight;
        const gapAbove = i === 0 ? 0 : 18;
        const top = page * P;
        let at = y + gapAbove;
        // A heading goes with the task after it, so look one ahead.
        const withNext = kids[i + 1] && k.classList.contains('is-heading') ? Math.min(kids[i + 1].offsetHeight, inner) + 18 : 0;
        const needs = Math.min(h, inner) + withNext;
        if (at > top && at + needs > top + inner) {
          page++;
          at = page * P;
        }
        next.push(at - y - gapAbove);
        y = at + h;
        while (y > page * P + inner) page++; // a task taller than a page runs on
      });
      setPages((n) => (n === page + 1 ? n : page + 1));
      setPushes((old) => (old.length === next.length && old.every((v, i) => Math.abs(v - next[i]) < 1) ? old : next));
    };
    lay();
    const ro = new ResizeObserver(lay);
    [...el.children].forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [blocks.length, P, inner, blocks.map((b) => b.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sh-desk">
      <div className="sh-paper" style={{ width: A4.w, height: pages * P - A4.gap }}>
        {Array.from({ length: pages }, (_, i) => (
          <div key={i} className="sh-sheet" style={{ top: i * P, height: A4.h }} aria-hidden="true">
            <span className="sh-foot">
              <span>{footer || title}</span>
              <span>{i + 1}</span>
            </span>
          </div>
        ))}
        <div className="sh-flow" ref={host} style={{ left: A4.m, right: A4.m, top: A4.m }}>
          {blocks.map((b, i) => (
            <div
              key={b.id}
              className={'sh-block' + (b.on ? ' on' : '') + (b.heading ? ' is-heading' : '') + (b.onClick ? ' pick' : '')}
              style={{ marginTop: (i === 0 ? 0 : 18) + (pushes[i] ?? 0) }}
              onClick={b.onClick}
              onKeyDown={b.onClick ? (e) => e.key === 'Enter' && e.target === e.currentTarget && b.onClick?.() : undefined}
              role={b.onClick ? 'button' : undefined}
              tabIndex={b.onClick ? 0 : undefined}
              aria-label={b.onClick ? 'Edit this task' : undefined}
            >
              {b.node}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// The top of the first page: the lesson's title and a line for the learner's name and the date.
export function SheetTop({ title }: { title: string }) {
  return (
    <div className="sh-top">
      <h1>{title}</h1>
      <span className="sh-name">
        <span>Name</span>
        <i />
        <span>Date</span>
        <i className="short" />
      </span>
    </div>
  );
}
