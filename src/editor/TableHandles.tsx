import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { Fragment, type Node as PMNode } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { UiIcon } from '../components/UiIcon';

// Drag handles for the rows and columns of a table: drag one to move the row or column,
// click it for more (add before or after, duplicate, move, delete).

type Spot = { tablePos: number; row: number; col: number; rowTop: number; rowH: number; colLeft: number; colW: number; top: number; left: number };
const DOTS_V = (
  <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
    {[3, 8, 13].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />))}
  </svg>
);
const DOTS_H = (
  <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
    {[3, 8, 13].map((x) => [2.5, 7.5].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />))}
  </svg>
);

function tableAt(editor: Editor, cell: HTMLElement) {
  const inside = editor.view.posAtDOM(cell, 0);
  const $p = editor.state.doc.resolve(inside);
  for (let d = $p.depth; d > 0; d--) if ($p.node(d).type.name === 'table') return { tablePos: $p.before(d), row: $p.index(d), col: $p.index(d + 1), node: $p.node(d) };
  return null;
}
const rowsOf = (t: PMNode) => Array.from({ length: t.childCount }, (_, i) => t.child(i));
const cellsOf = (r: PMNode) => Array.from({ length: r.childCount }, (_, i) => r.child(i));
const move = <T,>(a: T[], from: number, to: number) => {
  const b = [...a];
  const [x] = b.splice(from, 1);
  b.splice(to, 0, x);
  return b;
};

export function TableHandles({ editor, host }: { editor: Editor; host: HTMLElement | null }) {
  const [spot, setSpot] = useState<Spot | null>(null);
  const [drag, setDrag] = useState<{ kind: 'row' | 'col'; to: number; line: number } | null>(null);
  const [menu, setMenu] = useState<{ kind: 'row' | 'col'; anchor: DOMRect; s: Spot } | null>(null);
  const hide = useRef(0);
  const dragging = useRef(false);

  useEffect(() => {
    if (!host) return;
    const mv = (e: MouseEvent) => {
      if (dragging.current || !editor.isEditable) return;
      const t = e.target as HTMLElement;
      if (t.closest('.tbl-handle, .block-menu')) return window.clearTimeout(hide.current);
      const cell = t.closest('td, th') as HTMLElement | null;
      if (!cell || !editor.view.dom.contains(cell)) {
        window.clearTimeout(hide.current);
        hide.current = window.setTimeout(() => setSpot(null), 250);
        return;
      }
      const info = tableAt(editor, cell);
      const table = cell.closest('table');
      if (!info || !table) return;
      window.clearTimeout(hide.current);
      const h = host.getBoundingClientRect();
      const tr = (cell.parentElement as HTMLElement).getBoundingClientRect();
      const c = cell.getBoundingClientRect();
      const tb = table.getBoundingClientRect();
      setSpot({ tablePos: info.tablePos, row: info.row, col: info.col, rowTop: tr.top - h.top, rowH: tr.height, colLeft: c.left - h.left, colW: c.width, top: tb.top - h.top, left: tb.left - h.left });
    };
    const lv = () => (window.clearTimeout(hide.current), (hide.current = window.setTimeout(() => setSpot(null), 300)));
    host.addEventListener('mousemove', mv);
    host.addEventListener('mouseleave', lv);
    return () => (host.removeEventListener('mousemove', mv), host.removeEventListener('mouseleave', lv));
  }, [editor, host]);

  const tableNode = (s: Spot) => editor.state.doc.nodeAt(s.tablePos);
  const replace = (s: Spot, t: PMNode) => {
    const old = tableNode(s);
    if (!old) return;
    editor.view.dispatch(editor.state.tr.replaceWith(s.tablePos, s.tablePos + old.nodeSize, t));
  };
  const reorder = (s: Spot, kind: 'row' | 'col', from: number, to: number) => {
    const t = tableNode(s);
    if (!t || from === to) return;
    if (kind === 'row') replace(s, t.type.create(t.attrs, Fragment.fromArray(move(rowsOf(t), from, to))));
    else replace(s, t.type.create(t.attrs, Fragment.fromArray(rowsOf(t).map((r) => (r.childCount > Math.max(from, to) ? r.type.create(r.attrs, Fragment.fromArray(move(cellsOf(r), from, to))) : r)))));
  };
  const cellPos = (s: Spot, row: number, col: number) => {
    const t = tableNode(s);
    if (!t) return s.tablePos + 1;
    let p = s.tablePos + 1;
    for (let r = 0; r < row; r++) p += t.child(r).nodeSize;
    p += 1;
    const rr = t.child(row);
    for (let c = 0; c < Math.min(col, rr.childCount - 1); c++) p += rr.child(c).nodeSize;
    return p;
  };
  const at = (s: Spot, row = s.row, col = s.col) => {
    const p = cellPos(s, row, col);
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(p + 1))));
    return editor.chain().focus();
  };
  const dupRow = (s: Spot) => {
    const t = tableNode(s);
    if (!t) return;
    const rows = rowsOf(t);
    rows.splice(s.row + 1, 0, rows[s.row].copy(rows[s.row].content));
    replace(s, t.type.create(t.attrs, Fragment.fromArray(rows)));
  };
  const dupCol = (s: Spot) => {
    const t = tableNode(s);
    if (!t) return;
    replace(s, t.type.create(t.attrs, Fragment.fromArray(rowsOf(t).map((r) => {
      const cs = cellsOf(r);
      if (!cs[s.col]) return r;
      cs.splice(s.col + 1, 0, cs[s.col].copy(cs[s.col].content));
      return r.type.create(r.attrs, Fragment.fromArray(cs));
    }))));
  };

  // Drag: follow the pointer, show where it will land, move on release; a click opens the menu.
  const start = (e: React.PointerEvent, kind: 'row' | 'col') => {
    if (!spot || e.button !== 0) return;
    e.preventDefault();
    const s = spot;
    const el = editor.view.nodeDOM(s.tablePos) as HTMLElement | null;
    const table = (el?.querySelector?.('table') ?? el) as HTMLTableElement | null;
    if (!table || !host) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const anchor = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let moved = false;
    let to = kind === 'row' ? s.row : s.col;
    const h = host.getBoundingClientRect();
    const mv = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      dragging.current = true;
      document.body.classList.add('is-dragging-table');
      if (kind === 'row') {
        const rows = Array.from(table.rows);
        let i = rows.findIndex((r) => ev.clientY < r.getBoundingClientRect().top + r.getBoundingClientRect().height / 2);
        if (i < 0) i = rows.length;
        to = i > s.row ? i - 1 : i;
        const ref = rows[Math.min(i, rows.length - 1)].getBoundingClientRect();
        setDrag({ kind, to, line: (i >= rows.length ? ref.bottom : ref.top) - h.top });
      } else {
        const cells = Array.from(table.rows[0]?.cells ?? []);
        let i = cells.findIndex((c) => ev.clientX < c.getBoundingClientRect().left + c.getBoundingClientRect().width / 2);
        if (i < 0) i = cells.length;
        to = i > s.col ? i - 1 : i;
        const ref = cells[Math.min(i, cells.length - 1)].getBoundingClientRect();
        setDrag({ kind, to, line: (i >= cells.length ? ref.right : ref.left) - h.left });
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-dragging-table');
      dragging.current = false;
      setDrag(null);
      if (!moved) return setMenu({ kind, anchor, s });
      reorder(s, kind, kind === 'row' ? s.row : s.col, to);
      setSpot(null);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  const t = spot && tableNode(spot);
  const tableBox = t && spot ? (editor.view.nodeDOM(spot.tablePos) as HTMLElement | null)?.getBoundingClientRect() : null;
  return (
    <>
      {spot && t && (
        <>
          <span className="tbl-handle row" style={{ top: spot.rowTop + spot.rowH / 2, left: spot.left - 26 }} onPointerDown={(e) => start(e, 'row')} role="button" aria-label="Row: drag to move, click for options" data-tip="Drag to move the row · click for options">
            {DOTS_V}
          </span>
          <span className="tbl-handle col" style={{ top: spot.top - 13, left: spot.colLeft + spot.colW / 2 }} onPointerDown={(e) => start(e, 'col')} role="button" aria-label="Column: drag to move, click for options" data-tip="Drag to move the column · click for options">
            {DOTS_H}
          </span>
        </>
      )}
      {drag && spot && host && tableBox && (
        <span
          className="tbl-drop"
          style={drag.kind === 'row' ? { top: drag.line - 1, left: tableBox.left - host.getBoundingClientRect().left, width: tableBox.width, height: 3 } : { left: drag.line - 1, top: tableBox.top - host.getBoundingClientRect().top, height: tableBox.height, width: 3 }}
        />
      )}
      {menu && <TableMenu kind={menu.kind} anchor={menu.anchor} onClose={() => setMenu(null)} s={menu.s} count={(() => { const n = tableNode(menu.s); return menu.kind === 'row' ? n?.childCount ?? 0 : n?.child(0).childCount ?? 0; })()} ops={{
        before: () => (menu.kind === 'row' ? at(menu.s).addRowBefore().run() : at(menu.s).addColumnBefore().run()),
        after: () => (menu.kind === 'row' ? at(menu.s).addRowAfter().run() : at(menu.s).addColumnAfter().run()),
        dup: () => (menu.kind === 'row' ? dupRow(menu.s) : dupCol(menu.s)),
        up: () => reorder(menu.s, menu.kind, menu.kind === 'row' ? menu.s.row : menu.s.col, (menu.kind === 'row' ? menu.s.row : menu.s.col) - 1),
        down: () => reorder(menu.s, menu.kind, menu.kind === 'row' ? menu.s.row : menu.s.col, (menu.kind === 'row' ? menu.s.row : menu.s.col) + 1),
        del: () => (menu.kind === 'row' ? at(menu.s).deleteRow().run() : at(menu.s).deleteColumn().run()),
      }} />}
    </>
  );
}

function TableMenu({ kind, anchor, s, count, ops, onClose }: { kind: 'row' | 'col'; anchor: DOMRect; s: Spot; count: number; ops: Record<'before' | 'after' | 'dup' | 'up' | 'down' | 'del', () => void>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', key));
  }, [onClose]);
  const i = kind === 'row' ? s.row : s.col;
  const go = (f: () => void) => () => (f(), onClose());
  const B = (label: string, f: () => void, icon: React.ReactNode, disabled = false) => (
    <button type="button" role="menuitem" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={go(f)}>
      <span className="bm-ic">{icon}</span>
      {label}
    </button>
  );
  const row = kind === 'row';
  return createPortal(
    <div ref={ref} className="menu block-menu" role="menu" style={{ left: Math.min(anchor.left, window.innerWidth - 230), top: Math.min(anchor.bottom + 6, window.innerHeight - 300) }} onMouseDown={(e) => e.stopPropagation()}>
      <span className="bm-h">{row ? `Row ${i + 1}` : `Column ${i + 1}`}</span>
      {B(row ? 'Add a row above' : 'Add a column to the left', ops.before, '+')}
      {B(row ? 'Add a row below' : 'Add a column to the right', ops.after, '+')}
      {B(row ? 'Duplicate the row' : 'Duplicate the column', ops.dup, <UiIcon name="copyall" size={15} />)}
      <span className="bm-sep" />
      {B(row ? 'Move up' : 'Move left', ops.up, row ? '↑' : '←', i === 0)}
      {B(row ? 'Move down' : 'Move right', ops.down, row ? '↓' : '→', i >= count - 1)}
      <span className="bm-sep" />
      {B(row ? 'Delete the row' : 'Delete the column', ops.del, <UiIcon name="trash" size={15} />)}
    </div>,
    document.body,
  );
}
