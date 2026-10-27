import { useRef, useState } from 'react';
import { addAnnotation, removeAnnotation, type Annotation, type Code } from '../lib/annotations';

// A learner's long answer as text, with the teacher's codes, highlights and comments on it.
// The teacher selects words and picks a code; the learner sees the same marks.

export function segments(text: string, anns: Annotation[]) {
  const cuts = new Set<number>([0, text.length]);
  anns.forEach((a) => (cuts.add(Math.max(0, Math.min(text.length, a.start))), cuts.add(Math.max(0, Math.min(text.length, a.end)))));
  const pts = [...cuts].sort((a, b) => a - b);
  return pts.slice(0, -1).map((s, i) => ({ s, e: pts[i + 1], text: text.slice(s, pts[i + 1]), anns: anns.filter((a) => a.start <= s && a.end >= pts[i + 1] && a.end > a.start) }));
}

export function AnswerMarkup({ text, anns, codes, editable, onAdd, onRemove }: { text: string; anns: Annotation[]; codes: Code[]; editable?: boolean; onAdd?: (a: { start: number; end: number; quote: string; kind: Annotation['kind']; code?: string; comment?: string }) => void; onRemove?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState<{ start: number; end: number; quote: string } | null>(null);
  const [note, setNote] = useState('');
  const parts = segments(text, anns);
  const endsHere = (e: number) => anns.filter((a) => a.end === e && (a.kind === 'code' || a.kind === 'comment'));

  const onUp = () => {
    if (!editable) return;
    const s = window.getSelection();
    const root = ref.current;
    if (!s || s.isCollapsed || !root || !s.rangeCount) return setSel(null);
    const r = s.getRangeAt(0);
    if (!root.contains(r.commonAncestorContainer)) return setSel(null);
    const pre = document.createRange();
    pre.setStart(root, 0);
    pre.setEnd(r.startContainer, r.startOffset);
    const start = pre.toString().length;
    const end = start + r.toString().length;
    if (end > start) setSel({ start, end, quote: r.toString() });
  };

  return (
    <div className="am">
      <div className="am-text" ref={ref} onMouseUp={onUp}>
        {parts.map((p, i) => {
          const code = p.anns.find((a) => a.kind === 'code');
          const hl = p.anns.find((a) => a.kind === 'highlight');
          const cm = p.anns.find((a) => a.kind === 'comment');
          return (
            <span key={i}>
              <span className={(code ? 'am-coded' + (code.code === '✓' ? ' good' : '') : '') + (hl ? ' am-hl' : '') + (cm ? ' am-cm' : '')}>{p.text}</span>
              {endsHere(p.e).map((a) => (
                <sup key={a.id} className={'am-code' + (a.code === '✓' ? ' good' : '')} title={a.kind === 'comment' ? a.replies[0]?.text : codes.find((c) => c.code === a.code)?.meaning}>
                  {a.kind === 'comment' ? '💬' : a.code}
                  {editable && onRemove && (
                    <button type="button" className="am-x" onMouseDown={(e) => e.preventDefault()} onClick={() => onRemove(a.id)} aria-label="Remove">
                      ×
                    </button>
                  )}
                </sup>
              ))}
            </span>
          );
        })}
        {!text && <span className="hint">No answer yet.</span>}
      </div>
      {anns.filter((a) => a.kind === 'comment').length > 0 && (
        <ul className="am-comments">
          {anns
            .filter((a) => a.kind === 'comment')
            .map((a) => (
              <li key={a.id}>
                <span className="am-quote">“{a.quote.slice(0, 40)}”</span> {a.replies[0]?.text}
              </li>
            ))}
        </ul>
      )}
      {editable && sel && (
        <div className="am-tools" onMouseDown={(e) => e.target instanceof HTMLInputElement || e.preventDefault()}>
          <span className="hint">“{sel.quote.slice(0, 30)}”</span>
          {codes.map((c) => (
            <button key={c.code} type="button" className="am-code-btn" title={c.meaning} onClick={() => (onAdd?.({ ...sel, kind: 'code', code: c.code }), setSel(null))}>
              {c.code}
            </button>
          ))}
          <button type="button" className="am-code-btn hl" title="Highlight" onClick={() => (onAdd?.({ ...sel, kind: 'highlight' }), setSel(null))}>
            Highlight
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (note.trim()) onAdd?.({ ...sel, kind: 'comment', comment: note.trim() });
              setNote('');
              setSel(null);
            }}
          >
            <input aria-label="Comment" value={note} placeholder="or write a comment" onChange={(e) => setNote(e.target.value)} />
          </form>
        </div>
      )}
    </div>
  );
}

// The code key learners can open.
export function CodeKey({ codes }: { codes: Code[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="code-key">
      <button type="button" className="btn link small" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide the code key' : 'What do the codes mean?'}
      </button>
      {open && (
        <span className="code-key-list">
          {codes.map((c) => (
            <span key={c.code}>
              <strong>{c.code}</strong> {c.meaning}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export { addAnnotation, removeAnnotation };
