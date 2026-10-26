import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { addAnnotation, removeAnnotation, replyTo, updateAnnotation, type AnnColor, type Annotation, type Code } from '../lib/annotations';

// Highlights, underlines and comments drawn over the task text. They are stored as a block
// key plus character offsets, so they land on the same words at any text size or width.

const SKIP = '[data-qid], .q-num, .reveal-ans, .flag-icon, .grip, .ann-layer';
// Marker colours, and a deeper line of the same colour for highlights the class can see too.
const COLORS: { key: AnnColor; bg: string; line: string }[] = [
  { key: 'yellow', bg: 'rgba(250, 216, 80, 0.5)', line: '#d9a514' },
  { key: 'green', bg: 'rgba(140, 205, 140, 0.45)', line: '#4f9a5a' },
  { key: 'pink', bg: 'rgba(240, 150, 180, 0.45)', line: '#c9557d' },
];
const colorOf = (c?: AnnColor) => COLORS.find((x) => x.key === c) ?? COLORS[0];

function textNodes(el: HTMLElement) {
  const out: Text[] = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest(SKIP) && el.contains(n.parentElement.closest(SKIP))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n: Node | null;
  while ((n = w.nextNode())) out.push(n as Text);
  return out;
}

// Character offset of a point (node, offset) inside a block.
function offsetIn(block: HTMLElement, node: Node, off: number) {
  let total = 0;
  for (const t of textNodes(block)) {
    if (t === node) return total + off;
    if (node.contains(t) || (node.nodeType === 1 && (node as Element).contains(t))) {
      // A point given as an element and child index: count text before that child.
      const range = document.createRange();
      range.setStart(block, 0);
      range.setEnd(node, off);
      return range.toString().length;
    }
    total += t.length;
  }
  return total;
}

function rangeFor(block: HTMLElement, start: number, end: number) {
  const nodes = textNodes(block);
  let pos = 0;
  const r = document.createRange();
  let started = false;
  for (const t of nodes) {
    const next = pos + t.length;
    if (!started && start <= next) {
      r.setStart(t, Math.max(0, start - pos));
      started = true;
    }
    if (started && end <= next) {
      r.setEnd(t, Math.max(0, end - pos));
      return r;
    }
    pos = next;
  }
  return started ? r : null;
}

type Box = { id: string; rects: { x: number; y: number; w: number; h: number }[]; a: Annotation };

export function AnnotationLayer({
  container,
  annotations,
  classId,
  taskId,
  canAnnotate,
  me,
  forceVisibility,
  learnerUidFor,
  codes,
}: {
  container: RefObject<HTMLElement>;
  annotations: Annotation[];
  classId: string;
  taskId: string;
  canAnnotate: boolean;
  me: { uid: string; name: string; teacher: boolean };
  forceVisibility?: 'private'; // discussion feedback: always private to one learner
  learnerUidFor?: (bk: string) => string | undefined; // which learner a block belongs to
  codes?: Code[]; // correction codes offered in the toolbar
}) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [sel, setSel] = useState<{ bk: string; start: number; end: number; quote: string; x: number; y: number; sx: number; sy: number } | null>(null);
  // The highlight under the pointer: its small menu (colour, who sees it, remove).
  const [hover, setHover] = useState<string | null>(null);
  const hoverOff = useRef(0);
  const [vis, setVis] = useState<'class' | 'private'>(forceVisibility ?? 'class');
  const [commenting, setCommenting] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const layer = useRef<HTMLDivElement>(null);
  const list = annotations.filter((a) => a.target === 'task' && a.taskId === taskId);

  const measure = useCallback(() => {
    const root = container.current;
    if (!root) return;
    const base = root.getBoundingClientRect();
    const out: Box[] = [];
    for (const a of list) {
      const block = root.querySelector(`[data-bk="${CSS.escape(a.bk ?? '')}"]`) as HTMLElement | null;
      if (!block) continue;
      const r = rangeFor(block, a.start, a.end);
      if (!r) continue;
      const rects = [...r.getClientRects()].filter((x) => x.width > 1).map((x) => ({ x: x.left - base.left + root.scrollLeft, y: x.top - base.top + root.scrollTop, w: x.width, h: x.height }));
      if (rects.length) out.push({ id: a.id, rects, a });
    }
    setBoxes(out);
  }, [container, list.map((a) => a.id + a.start + a.end).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    // The container's ref is set after this layer mounts, so measure on the next frame too.
    const raf = requestAnimationFrame(measure);
    const t = window.setInterval(measure, 800); // content can change (answers, reveals)
    let ro: ResizeObserver | null = null;
    const attach = window.setTimeout(() => {
      if (container.current) {
        ro = new ResizeObserver(() => measure());
        ro.observe(container.current);
        container.current.addEventListener('scroll', measure, true);
      }
    }, 0);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(t);
      window.clearTimeout(attach);
      ro?.disconnect();
      container.current?.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [measure, container]);

  // Teacher selects text: show the annotation toolbar.
  useEffect(() => {
    if (!canAnnotate) return;
    const root = container.current;
    if (!root) return;
    const up = (e: MouseEvent) => {
      // Clicks in the annotation menus are not new selections.
      if ((e.target as HTMLElement).closest?.('.ann-tools, .ann-thread, .ann-hov')) return;
      window.setTimeout(() => {
        const s = window.getSelection();
        if (!s || s.isCollapsed || !s.rangeCount) return setSel(null);
        const r = s.getRangeAt(0);
        const a = (r.startContainer.nodeType === 1 ? (r.startContainer as Element) : r.startContainer.parentElement)?.closest('[data-bk]') as HTMLElement | null;
        const b = (r.endContainer.nodeType === 1 ? (r.endContainer as Element) : r.endContainer.parentElement)?.closest('[data-bk]') as HTMLElement | null;
        if (!a || a !== b || !root.contains(a)) return setSel(null);
        const start = offsetIn(a, r.startContainer, r.startOffset);
        const end = offsetIn(a, r.endContainer, r.endOffset);
        if (end <= start) return setSel(null);
        const rect = r.getBoundingClientRect();
        const base = root.getBoundingClientRect();
        setSel({ bk: a.dataset.bk!, start, end, quote: r.toString().slice(0, 200), x: rect.left - base.left + root.scrollLeft + rect.width / 2, y: rect.top - base.top + root.scrollTop, sx: rect.left + rect.width / 2, sy: rect.top });
        setCommenting('');
      }, 0);
    };
    root.addEventListener('mouseup', up);
    return () => root.removeEventListener('mouseup', up);
  }, [canAnnotate, container]);

  // Which highlight the pointer is on (the layer itself lets clicks through to the text).
  useEffect(() => {
    if (!canAnnotate) return;
    const root = container.current;
    if (!root) return;
    const mv = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('.ann-hov')) return window.clearTimeout(hoverOff.current);
      const base = root.getBoundingClientRect();
      const x = e.clientX - base.left + root.scrollLeft;
      const y = e.clientY - base.top + root.scrollTop;
      const hit = boxes.find((b) => b.a.kind !== 'comment' && b.rects.some((r) => x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2));
      window.clearTimeout(hoverOff.current);
      if (hit) setHover(hit.id);
      else hoverOff.current = window.setTimeout(() => setHover(null), 350);
    };
    root.addEventListener('mousemove', mv);
    return () => root.removeEventListener('mousemove', mv);
  }, [canAnnotate, container, boxes]);

  async function make(kind: Annotation['kind'], color?: AnnColor, comment?: string, code?: string) {
    if (!sel) return;
    await addAnnotation(classId, {
      taskId,
      target: 'task',
      bk: sel.bk,
      start: sel.start,
      end: sel.end,
      quote: sel.quote,
      kind,
      ...(color ? { color } : {}),
      ...(code ? { code } : {}),
      visibility: forceVisibility ?? vis,
      ...(learnerUidFor?.(sel.bk) ? { learnerUid: learnerUidFor(sel.bk) } : {}),
      replies: comment ? [{ by: me.uid, name: me.name, text: comment, at: Date.now(), teacher: true }] : [],
    });
    setSel(null);
    window.getSelection()?.removeAllRanges();
  }

  const openAnn = boxes.find((b) => b.id === open);
  return (
    <div className="ann-layer" ref={layer} aria-hidden={false}>
      {boxes.map((b) =>
        b.rects.map((r, i) => {
          const c = colorOf(b.a.color);
          const marker = b.a.kind === 'highlight';
          // Marker style: a little lower and shorter than the line, with soft uneven ends.
          const st = marker ? { left: r.x - 1.5, top: r.y + r.h * 0.3, width: r.w + 3, height: r.h * 0.62, background: c.bg, ...(b.a.visibility !== 'private' ? { boxShadow: `inset 0 -2px 0 ${c.line}` } : {}) } : b.a.kind === 'comment' ? { left: r.x, top: r.y, width: r.w, height: r.h, background: 'rgba(217, 143, 99, 0.16)' } : { left: r.x, top: r.y, width: r.w, height: r.h };
          return <span key={b.id + i} className={'ann-mark k-' + b.a.kind + (b.a.visibility === 'private' ? ' private' : ' shared') + (hover === b.id ? ' hov' : '')} style={st} />;
        }),
      )}
      {boxes
        .filter((b) => b.a.kind === 'code' && b.a.code)
        .map((b) => (
          <i key={'k' + b.id} className="ann-code-tag" style={{ left: b.rects[b.rects.length - 1].x + b.rects[b.rects.length - 1].w, top: b.rects[b.rects.length - 1].y - 10 }} title={b.a.replies[0]?.text}>
            {b.a.code}
          </i>
        ))}
      {boxes
        .filter((b) => b.a.kind === 'comment' || b.a.replies.length > 0)
        .map((b) => (
          <button key={'c' + b.id} type="button" className={'ann-pin' + (open === b.id ? ' on' : '')} style={{ top: b.rects[0].y }} onClick={() => setOpen(open === b.id ? null : b.id)} title="Open the comment">
            {b.a.replies.length || '+'}
          </button>
        ))}
      {canAnnotate &&
        (() => {
          const b = boxes.find((x) => x.id === hover);
          if (!b) return null;
          const last = b.rects[b.rects.length - 1];
          const shared = b.a.visibility !== 'private';
          return (
            <span className="ann-hov" style={{ left: last.x + last.w + 4, top: last.y - 30 }} onMouseEnter={() => window.clearTimeout(hoverOff.current)} onMouseLeave={() => (hoverOff.current = window.setTimeout(() => setHover(null), 300))} onMouseDown={(e) => e.preventDefault()}>
              {b.a.kind === 'highlight' &&
                COLORS.map((c) => (
                  <button key={c.key} type="button" className={'ann-sw sm' + ((b.a.color ?? 'yellow') === c.key ? ' on' : '')} style={{ background: c.bg }} aria-label={'Colour ' + c.key} onClick={() => updateAnnotation(classId, b.id, { color: c.key })} />
                ))}
              {!forceVisibility && (
                <button type="button" className={'ann-btn vis' + (shared ? ' on' : '')} title={shared ? 'The class sees this. Click to keep it to yourself.' : 'Only you see this. Click to show the class.'} onClick={() => updateAnnotation(classId, b.id, { visibility: shared ? 'private' : 'class' })}>
                  {shared ? 'Class sees it' : 'Only me'}
                </button>
              )}
              <button type="button" className="ann-btn del" aria-label="Remove" title="Remove" onClick={() => (removeAnnotation(classId, b.id), setHover(null))}>
                ×
              </button>
            </span>
          );
        })()}
      {openAnn && (
        <div className="ann-thread" style={{ top: openAnn.rects[0].y }}>
          <span className="eyebrow">
            {openAnn.a.visibility === 'private' ? 'Private' : 'Class'} · “{openAnn.a.quote.slice(0, 40)}
            {openAnn.a.quote.length > 40 ? '…' : ''}”
          </span>
          {openAnn.a.replies.map((r, i) => (
            <span key={i} className={'ann-reply' + (r.teacher ? ' t' : '')}>
              <strong>{r.name.split(' ')[0]}</strong> {r.text}
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!reply.trim()) return;
              replyTo(classId, openAnn.id, { by: me.uid, name: me.name, text: reply.trim(), at: Date.now(), ...(me.teacher ? { teacher: true } : {}) });
              setReply('');
            }}
          >
            <input value={reply} placeholder="Reply" onChange={(e) => setReply(e.target.value)} />
          </form>
          {canAnnotate && (
            <button type="button" className="btn link small" onClick={() => (removeAnnotation(classId, openAnn.id), setOpen(null))}>
              Delete
            </button>
          )}
        </div>
      )}
      {sel && canAnnotate && (
        createPortal(
        <div className="ann-tools" style={{ position: 'fixed', left: Math.max(150, Math.min(window.innerWidth - 150, sel.sx)), top: Math.max(56, sel.sy) }} onMouseDown={(e) => (e.target as HTMLElement).tagName !== 'INPUT' && e.preventDefault()}>
          {commenting !== '' || false ? null : null}
          {COLORS.map((c) => (
            <button key={c.key} type="button" className="ann-sw" style={{ background: c.bg }} title={'Highlight ' + c.key} onClick={() => make('highlight', c.key)} />
          ))}
          <button type="button" className="ann-btn" title="Underline" onClick={() => make('underline')}>
            <u>U</u>
          </button>
          <button type="button" className="ann-btn" title="Comment" onClick={() => setCommenting(' ')}>
            Comment
          </button>
          {codes?.map((c) => (
            <button key={c.code} type="button" className="ann-btn ann-code-btn" title={c.meaning} onClick={() => make('code', undefined, c.meaning, c.code)}>
              {c.code}
            </button>
          ))}
          <button type="button" className={'ann-btn vis'} title="Who sees it" disabled={!!forceVisibility} onClick={() => setVis((v) => (v === 'class' ? 'private' : 'class'))}>
            {forceVisibility ? 'Private' : vis === 'class' ? 'Class sees it' : 'Only me'}
          </button>
          {commenting !== '' && (
            <form
              className="ann-comment-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (commenting.trim()) make('comment', undefined, commenting.trim());
              }}
            >
              <input autoFocus value={commenting.trimStart()} placeholder="Write a comment, then press Enter" onChange={(e) => setCommenting(e.target.value || ' ')} />
              <button type="submit" className="ann-btn">
                Add
              </button>
            </form>
          )}
        </div>,
        document.body,
        )
      )}
    </div>
  );
}
