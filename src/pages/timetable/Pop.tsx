import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// A card that opens beside what was clicked, as in Google Calendar: to the right if there is
// room, else to the left, else below. On a phone it rises from the bottom.

export type Anchor = { left: number; top: number; right: number; bottom: number };
export const rectOf = (el: Element | null | undefined): Anchor | null => {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

// Moving a window by a handle, to see what is behind it: returns the offset and the handle's
// pointer handler. Phones keep their sheets where they are.
export function useMove() {
  const [off, setOff] = useState({ x: 0, y: 0 });
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || window.innerWidth < 640 || (e.target as HTMLElement).closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    const sx = e.clientX - off.x;
    const sy = e.clientY - off.y;
    const box = (e.currentTarget as HTMLElement).closest<HTMLElement>('[role="dialog"]');
    const r = box?.getBoundingClientRect();
    const move = (m: PointerEvent) => {
      let x = m.clientX - sx;
      let y = m.clientY - sy;
      // Keep a corner of it on the screen.
      if (r) {
        x = Math.max(-r.left - r.width + 80 + off.x, Math.min(window.innerWidth - r.left - 80 + off.x, x));
        y = Math.max(-r.top + 8 + off.y, Math.min(window.innerHeight - r.top - 40 + off.y, y));
      }
      setOff({ x, y });
    };
    const up = () => (window.removeEventListener('pointermove', move), window.removeEventListener('pointerup', up), document.body.classList.remove('ttb-moving'));
    document.body.classList.add('ttb-moving');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return { off, onPointerDown, style: off.x || off.y ? { transform: `translate(${off.x}px, ${off.y}px)` } : undefined };
}

// Clicks in these are not "outside": drop-down lists and tooltips open in their own layer.
const INSIDE = '.sel-list, .tip-float, .scrim';

export function Pop({ at, onClose, label, className = '', children, width = 360 }: { at: Anchor; onClose: () => void; label: string; className?: string; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const mv = useMove();
  const back = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 10;
    let left: number;
    let top: number;
    // Beside what was clicked; for something wide, like a row in the schedule, under it.
    if (at.right - at.left > 420) left = Math.max(8, Math.min(vw - w - 8, at.left + 120));
    else if (at.right + gap + w <= vw - 8) left = at.right + gap;
    else if (at.left - gap - w >= 8) left = at.left - gap - w;
    else left = Math.max(8, Math.min(vw - w - 8, (at.left + at.right) / 2 - w / 2));
    const beside = left >= at.right || left + w <= at.left;
    if (beside) top = Math.max(8, Math.min(vh - h - 8, at.top));
    else top = at.bottom + gap + h <= vh - 8 ? at.bottom + gap : Math.max(8, at.top - gap - h);
    setPos({ left, top });
  }, [at.left, at.top, at.right, at.bottom]);
  useEffect(() => {
    back.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') ?? el;
    first?.focus({ preventScroll: true });
    const down = (e: MouseEvent) => {
      const t = e.target as Element;
      if (el?.contains(t) || t.closest?.(INSIDE)) return;
      close.current();
    };
    const key = (e: KeyboardEvent) => {
      // Escape closes an open drop-down first, then the card.
      if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.scrim, .sel-list')) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
      if (back.current?.isConnected && document.activeElement && (document.activeElement === document.body || el?.contains(document.activeElement))) back.current.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} className={'ttb-pop ' + className + (pos ? ' in' : '')} style={{ width, left: (pos?.left ?? -9999) + mv.off.x, top: (pos?.top ?? 0) + mv.off.y }}>
      <span className="ttb-grip" onPointerDown={mv.onPointerDown} aria-hidden="true" title="Drag to move" />
      {children}
    </div>,
    document.body,
  );
}

// "This one, or every week?" for a weekly class or meeting.
export type ScopeReq = { verb: string; title: string; day: string; resolve: (v: 'one' | 'all' | null) => void };
export function ScopeAsk({ req, onDone }: { req: ScopeReq; onDone: () => void }) {
  const [v, setV] = useState<'one' | 'all'>('one');
  const done = (r: 'one' | 'all' | null) => (req.resolve(r), onDone());
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && (e.preventDefault(), done(null));
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });
  return createPortal(
    <div className="scrim ttb-scrim" onMouseDown={(e) => e.target === e.currentTarget && done(null)}>
      <form className="dialog ttb-scope" role="dialog" aria-label={`${req.verb} a repeating session`} onSubmit={(e) => (e.preventDefault(), done(v))}>
        <h2>
          {req.verb} “{req.title}”
        </h2>
        <div className="ttb-scope-opts" role="radiogroup" aria-label="Which">
          {(
            [
              ['one', `Only this one`, req.day],
              ['all', 'Every time', 'All the times it happens'],
            ] as const
          ).map(([k, l, h], i) => (
            <button key={k} type="button" role="radio" aria-checked={v === k} className={v === k ? 'on' : ''} onClick={() => setV(k)} data-autofocus={i === 0 || undefined} autoFocus={i === 0}>
              <i aria-hidden="true" />
              <span>
                <b>{l}</b>
                <span className="hint">{h}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="row-between" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={() => done(null)}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {req.verb}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

export const SHORTCUTS: [string[], string][] = [
  [['t'], 'Today'],
  [['j', 'n'], 'Next day, week or month'],
  [['k', 'p'], 'The one before'],
  [['d'], 'Day view'],
  [['3'], '3-day view'],
  [['w'], 'Week view'],
  [['m'], 'Month view'],
  [['a'], 'Schedule view'],
  [['c'], 'Add a class or meeting'],
  [['e'], 'Edit the open session'],
  [['Delete', 'Backspace'], 'Take out the open session'],
  [['Esc'], 'Close'],
  [['?'], 'These shortcuts'],
];
export function Shortcuts({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => (e.key === 'Escape' || e.key === '?') && (e.preventDefault(), onClose());
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  });
  return createPortal(
    <div className="scrim ttb-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog ttb-keys" role="dialog" aria-label="Keyboard shortcuts">
        <div className="row-between">
          <h2>Keyboard shortcuts</h2>
          <button type="button" className="btn small-btn" onClick={onClose} autoFocus>
            Close
          </button>
        </div>
        <dl>
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what}>
              <dt>
                {keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && <span className="ttb-or">or</span>}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
        <p className="hint">Drag across the hours to add a class over that time. Drag a session to move it, or its lower edge to change its length.</p>
      </div>
    </div>,
    document.body,
  );
}

// A short note at the bottom, with Undo.
export type Toast = { id: number; text: string; undo?: () => Promise<unknown> | void };
export function ToastBar({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 7000);
    return () => window.clearTimeout(t);
  }, [toast.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return createPortal(
    <div className="ttb-toast" role="status" key={toast.id}>
      <span>{toast.text}</span>
      {toast.undo && (
        <button type="button" onClick={() => (void toast.undo?.(), onDone())}>
          Undo
        </button>
      )}
      <button type="button" className="ttb-toast-x" aria-label="Close" onClick={onDone}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
