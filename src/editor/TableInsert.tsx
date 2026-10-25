import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';

type Spot = { kind: 'col' | 'row'; x: number; y: number; len: number; cell: HTMLElement; after: boolean };

// Hover near the line between two cells to get a + that inserts a column or a row there.
export function TableInsert({ editor, host }: { editor: Editor; host: HTMLElement | null }) {
  const [spot, setSpot] = useState<Spot | null>(null);

  useEffect(() => {
    if (!host) return;
    const near = 7;
    const move = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.tbl-insert')) return;
      const cell = t.closest('td, th') as HTMLElement | null;
      const table = cell?.closest('table') as HTMLElement | null;
      if (!cell || !table || !host.contains(table)) return setSpot(null);
      const h = host.getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      const tb = table.getBoundingClientRect();
      if (e.clientX - c.left < near || c.right - e.clientX < near) {
        const after = c.right - e.clientX < near;
        const x = (after ? c.right : c.left) - h.left;
        return setSpot({ kind: 'col', x, y: tb.top - h.top, len: tb.height, cell, after });
      }
      if (e.clientY - c.top < near || c.bottom - e.clientY < near) {
        const after = c.bottom - e.clientY < near;
        const y = (after ? c.bottom : c.top) - h.top;
        return setSpot({ kind: 'row', x: tb.left - h.left, y, len: tb.width, cell, after });
      }
      setSpot(null);
    };
    const leave = (e: MouseEvent) => {
      if (!(e.relatedTarget as HTMLElement | null)?.closest?.('.tbl-insert')) setSpot(null);
    };
    host.addEventListener('mousemove', move);
    host.addEventListener('mouseleave', leave);
    return () => {
      host.removeEventListener('mousemove', move);
      host.removeEventListener('mouseleave', leave);
    };
  }, [host]);

  if (!spot) return null;
  const insert = () => {
    const pos = editor.view.posAtDOM(spot.cell, 0);
    const chain = editor.chain().focus().setTextSelection(pos);
    if (spot.kind === 'col') (spot.after ? chain.addColumnAfter() : chain.addColumnBefore()).run();
    else (spot.after ? chain.addRowAfter() : chain.addRowBefore()).run();
    setSpot(null);
  };
  return (
    <>
      <span className="tbl-line" style={spot.kind === 'col' ? { left: spot.x - 1, top: spot.y, width: 2, height: spot.len } : { left: spot.x, top: spot.y - 1, height: 2, width: spot.len }} />
      <button
        type="button"
        className="tbl-insert"
        style={spot.kind === 'col' ? { left: spot.x, top: spot.y } : { left: spot.x, top: spot.y }}
        title={spot.kind === 'col' ? 'Add a column here' : 'Add a row here'}
        aria-label={spot.kind === 'col' ? 'Add a column here' : 'Add a row here'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={insert}
      >
        +
      </button>
    </>
  );
}
