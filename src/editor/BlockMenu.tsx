import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor, JSONContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Node as PMNode } from '@tiptap/pm/model';
import { freshIds, writeClip } from '../lib/clip';
import { UiIcon } from '../components/UiIcon';

// What you can do with one part of a task, from its six-dot handle: turn a paragraph into a
// heading or a list, duplicate, copy, cut, move up or down, delete. Like Notion.

const TEXTY = new Set(['paragraph', 'heading', 'blockquote']);
export const HANDLED = new Set(['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'table', 'image', 'horizontalRule']);

export function BlockMenu({ editor, pos, anchor, space, onClose }: { editor: Editor; pos: number; anchor: DOMRect; space: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: anchor.left, top: anchor.bottom + 6 });
  const [note, setNote] = useState('');
  const node: PMNode | null = editor.state.doc.nodeAt(pos);
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const top = anchor.bottom + 6 + r.height > window.innerHeight - 8 ? Math.max(8, anchor.top - 6 - r.height) : anchor.bottom + 6;
    setAt({ left: Math.max(8, Math.min(anchor.left, window.innerWidth - r.width - 8)), top });
  }, [anchor]);
  useEffect(() => {
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    window.addEventListener('scroll', onClose, true);
    return () => (document.removeEventListener('mousedown', down), document.removeEventListener('keydown', key), window.removeEventListener('scroll', onClose, true));
  }, [onClose]);
  if (!node) return null;

  const $p = editor.state.doc.resolve(pos);
  const index = $p.index();
  const parent = $p.parent;
  const prev = index > 0 ? parent.child(index - 1) : null;
  const next = index < parent.childCount - 1 ? parent.child(index + 1) : null;
  const run = (f: () => void) => () => (f(), onClose());
  const select = () => editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
  const copy = async () => {
    const ok = await writeClip({ v: 1, space, content: [node.toJSON() as JSONContent] }, node.textContent);
    return ok;
  };
  const del = () => editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView());
  const dup = () => {
    const copyNode = editor.schema.nodeFromJSON(freshIds(node.toJSON() as JSONContent));
    editor.view.dispatch(editor.state.tr.insert(pos + node.nodeSize, copyNode).scrollIntoView());
  };
  const up = () => {
    if (!prev) return;
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize).insert(pos - prev.nodeSize, node);
    tr.setSelection(NodeSelection.create(tr.doc, pos - prev.nodeSize));
    editor.view.dispatch(tr.scrollIntoView());
  };
  const down = () => {
    if (!next) return;
    const after = pos + node.nodeSize;
    const tr = editor.state.tr.delete(after, after + next.nodeSize).insert(pos, next);
    tr.setSelection(NodeSelection.create(tr.doc, pos + next.nodeSize));
    editor.view.dispatch(tr.scrollIntoView());
  };
  const turn = (to: 'p' | 'h' | 'ul' | 'ol' | 'q') => {
    const c = editor.chain().focus().setTextSelection(pos + 1);
    if (node.type.name === 'blockquote' && to !== 'q') c.lift('blockquote');
    if (to === 'p') c.setParagraph();
    else if (to === 'h') c.setHeading({ level: 3 });
    else if (to === 'ul') c.setParagraph().toggleBulletList();
    else if (to === 'ol') c.setParagraph().toggleOrderedList();
    else if (to === 'q') c.setParagraph().toggleBlockquote();
    c.run();
  };
  const cur = node.type.name === 'heading' ? 'h' : node.type.name === 'blockquote' ? 'q' : 'p';
  const Item = ({ icon, label, onClick, disabled, keys }: { icon?: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; keys?: string }) => (
    <button type="button" role="menuitem" disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <span className="bm-ic">{icon}</span>
      {label}
      {keys && <span className="bm-keys">{keys}</span>}
    </button>
  );
  return createPortal(
    <div ref={ref} className="menu block-menu" role="menu" style={{ left: at.left, top: at.top }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {TEXTY.has(node.type.name) && (
        <>
          <span className="bm-h">Turn into</span>
          <span className="bm-turn">
            {(
              [
                ['p', 'Text'],
                ['h', 'Heading'],
                ['ul', 'List'],
                ['ol', 'Numbered'],
                ['q', 'Quote'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className={cur === k ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={run(() => turn(k))}>
                {l}
              </button>
            ))}
          </span>
          <span className="bm-sep" />
        </>
      )}
      <Item icon={<UiIcon name="copyall" size={15} />} label="Duplicate" onClick={run(dup)} />
      <Item
        icon={<UiIcon name="import" size={15} />}
        label={note || 'Copy'}
        onClick={() =>
          void copy().then((ok) => {
            setNote(ok ? 'Copied' : 'Could not copy');
            window.setTimeout(onClose, 600);
          })
        }
      />
      <Item icon={<span className="bm-cut">✂</span>} label="Cut" onClick={() => void copy().then(() => (del(), onClose()))} />
      <span className="bm-sep" />
      <Item icon={<span className="bm-arrow">↑</span>} label="Move up" disabled={!prev} onClick={run(up)} />
      <Item icon={<span className="bm-arrow">↓</span>} label="Move down" disabled={!next} onClick={run(down)} />
      <Item icon={<span className="bm-sel" />} label="Select" onClick={run(() => (select(), editor.view.focus()))} />
      <span className="bm-sep" />
      <Item icon={<UiIcon name="trash" size={15} />} label="Delete" keys="Del" onClick={run(del)} />
    </div>,
    document.body,
  );
}

// The Notion-style handle that appears beside each paragraph, heading, list or table: drag it
// to move the block, click it for the menu. Blocks with their own handle (questions, boxes…)
// keep that one.
export function BlockHandles({ editor, host, space }: { editor: Editor; host: HTMLElement | null; space: string }) {
  const [hover, setHover] = useState<{ pos: number; top: number; left: number } | null>(null);
  const [menu, setMenu] = useState<{ pos: number; anchor: DOMRect } | null>(null);
  const hide = useRef(0);
  useEffect(() => {
    const el = host;
    if (!el) return;
    const pm = editor.view.dom;
    const move = (e: MouseEvent) => {
      if (document.body.classList.contains('is-dragging-inline')) return;
      let t = e.target as HTMLElement | null;
      if (!editor.isEditable) return setHover(null);
      if (t?.closest('.block-handle, .block-menu, .line-add')) return;
      if (t?.closest('.gap-node, .choice-node, .drop-node, .grip')) return setHover(null);
      while (t && t.parentElement !== pm) t = t.parentElement;
      if (!t) return;
      let pos = -1;
      // Every top-level part gets a handle, except those with their own (questions, boards…).
      const own = !!(t.matches('.block-node') || t.querySelector(':scope > .block-node, :scope > * > .block-node'));
      editor.state.doc.forEach((n, off) => {
        if (pos < 0 && editor.view.nodeDOM(off) === t) pos = own && !HANDLED.has(n.type.name) ? -2 : off;
      });
      if (pos < 0) return pos === -2 ? setHover(null) : undefined;
      const isTable = editor.state.doc.nodeAt(pos)?.type.name === 'table';
      window.clearTimeout(hide.current);
      const r = t.getBoundingClientRect();
      const w = el.getBoundingClientRect();
      const lh = parseFloat(getComputedStyle(t).lineHeight) || 24;
      // A table's handle sits above its top-left corner, clear of the row handles.
      setHover({ pos, top: isTable ? r.top - w.top - 14 : r.top - w.top + Math.min(lh, r.height) / 2, left: r.left - w.left - 24 });
    };
    const leave = () => (window.clearTimeout(hide.current), (hide.current = window.setTimeout(() => setHover(null), 350)));
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => (el.removeEventListener('mousemove', move), el.removeEventListener('mouseleave', leave));
  }, [editor, host]);
  if (!hover && !menu) return null;
  const startDrag = (e: React.DragEvent) => {
    if (!hover) return;
    const view = editor.view;
    const sel = NodeSelection.create(view.state.doc, hover.pos);
    view.dispatch(view.state.tr.setSelection(sel));
    const slice = sel.content();
    const { dom, text } = view.serializeForClipboard(slice);
    e.dataTransfer.clearData();
    e.dataTransfer.setData('text/html', dom.innerHTML);
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copyMove';
    const blockDom = view.nodeDOM(hover.pos) as HTMLElement | null;
    if (blockDom) e.dataTransfer.setDragImage(blockDom, 0, 0);
    (view as unknown as { dragging: unknown }).dragging = { slice, move: true };
  };
  return (
    <>
      {hover && (
        <span
          className="block-handle"
          style={{ top: hover.top, left: hover.left }}
          draggable
          role="button"
          aria-label="Drag to move, click for options"
          data-tip="Drag to move · click for options"
          onMouseEnter={() => window.clearTimeout(hide.current)}
          onMouseLeave={() => (hide.current = window.setTimeout(() => !menu && setHover(null), 350))}
          onDragStart={startDrag}
          onDragEnd={() => setHover(null)}
          onClick={(e) => setMenu({ pos: hover.pos, anchor: e.currentTarget.getBoundingClientRect() })}
        >
          <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
            {[3, 8, 13].map((y) => [2.5, 7.5].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" fill="currentColor" />))}
          </svg>
        </span>
      )}
      {menu && <BlockMenu editor={editor} pos={menu.pos} anchor={menu.anchor} space={space} onClose={() => (setMenu(null), setHover(null))} />}
    </>
  );
}
