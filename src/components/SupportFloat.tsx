import { Suspense, lazy, useCallback, useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useOrgs, useSuper } from '../lib/admin';
import { isLearnerEmail } from '../lib/learners';
import { PortalHost } from '../pages/admin/ui';
import { Loader } from './Loader';
import { UiIcon } from './UiIcon';

// Support tickets, from any page: a tab on the right edge for super admins and organisations'
// admins opens a window with the tickets in it. The window can be moved by its title bar and
// made bigger or smaller from its corner; where it sits and its size are kept for next time.
// On a phone it fills the screen. Tickets and new-ticket forms open inside it.

const SupportTickets = lazy(() => import('../pages/SupportPage').then((m) => ({ default: m.SupportTickets })));

type Rect = { x: number; y: number; w: number; h: number };
const KEY = 'll.supportWin';
const OPEN = 'll.supportOpen';
const MIN_W = 360;
const MIN_H = 320;
const STEPS: Record<string, [number, number]> = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] };

const fit = (r: Rect): Rect => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(r.w, MIN_W), vw - 16);
  const h = Math.min(Math.max(r.h, MIN_H), vh - 16);
  return { w, h, x: Math.min(Math.max(r.x, 8), vw - w - 8), y: Math.min(Math.max(r.y, 8), vh - h - 8) };
};
const startRect = (): Rect => {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Rect | null;
    if (kept && [kept.x, kept.y, kept.w, kept.h].every((n) => typeof n === 'number')) return fit(kept);
  } catch {
    /* fine */
  }
  const w = Math.min(760, window.innerWidth - 32);
  const h = Math.min(640, window.innerHeight - 64);
  return fit({ w, h, x: window.innerWidth - w - 56, y: Math.max(24, (window.innerHeight - h) / 2) });
};
const keep = (k: string, v: string) => {
  try {
    if (v) localStorage.setItem(k, v);
    else localStorage.removeItem(k);
  } catch {
    /* fine */
  }
};

export function SupportFloat() {
  const { user, profile } = useAuth();
  const { pathname } = useLocation();
  const teacher = !!user && profile?.role === 'teacher' && !isLearnerEmail(user.email);
  const isSuper = useSuper();
  const adminOf = useOrgs(false, teacher && isSuper === false ? user?.email : null);
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN) === '1';
    } catch {
      return false;
    }
  });
  const toggle = (v: boolean) => {
    setOpen(v);
    keep(OPEN, v ? '1' : '');
  };
  const allowed = teacher && (isSuper === true || !!adminOf?.length);
  // The Support page itself, and full-screen places (calls, studios, a shared page), have no tab.
  const away = pathname === '/support' || /^\/(call|studio|play|s|r)\//.test(pathname);
  if (!allowed || away) return null;
  return (
    <>
      {!open && (
        <button type="button" className="sf-tab" onClick={() => toggle(true)} aria-label="Support tickets" data-tip="Support tickets">
          <UiIcon name="help" size={18} />
          <span>Support</span>
        </button>
      )}
      {open && <SupportWindow owner={isSuper === true} onClose={() => toggle(false)} />}
    </>
  );
}

function SupportWindow({ owner, onClose }: { owner: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const orgs = useOrgs(owner, user?.email);
  const [rect, setRect] = useState<Rect>(startRect);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [phone, setPhone] = useState(() => window.innerWidth < 640);
  const winRef = useRef<HTMLDivElement>(null);

  // Kept inside the screen when the window of the browser changes size.
  useEffect(() => {
    const on = () => {
      setPhone(window.innerWidth < 640);
      setRect((r) => fit(r));
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useEffect(() => keep(KEY, JSON.stringify(rect)), [rect]);
  useEffect(() => winRef.current?.querySelector<HTMLElement>('.sf-x')?.focus(), []);

  // Moving by the title bar, or resizing from the corner: follows the pointer until it lets go.
  const drag = useCallback(
    (how: 'move' | 'size') => (e: RPointerEvent) => {
      if (phone || e.button !== 0 || (how === 'move' && (e.target as HTMLElement).closest('button, a'))) return;
      e.preventDefault();
      const from = { px: e.clientX, py: e.clientY, r: rect };
      const move = (m: PointerEvent) => {
        const dx = m.clientX - from.px;
        const dy = m.clientY - from.py;
        setRect(fit(how === 'move' ? { ...from.r, x: from.r.x + dx, y: from.r.y + dy } : { ...from.r, w: from.r.w + dx, h: from.r.h + dy }));
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        document.body.classList.remove('sf-dragging');
      };
      document.body.classList.add('sf-dragging');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [phone, rect],
  );
  // The keyboard moves it too: arrows on the title bar, with Shift to resize.
  const keys = (e: RKeyboardEvent) => {
    const d = STEPS[e.key];
    if (!d || phone) return;
    e.preventDefault();
    setRect((r) => fit(e.shiftKey ? { ...r, w: r.w + d[0], h: r.h + d[1] } : { ...r, x: r.x + d[0], y: r.y + d[1] }));
  };

  const style = phone ? undefined : { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
  return (
    <div ref={winRef} className={'sf-win' + (phone ? ' phone' : '')} style={style} role="dialog" aria-label="Support tickets">
      <div className="sf-head" role="group" onPointerDown={drag('move')} onKeyDown={keys} tabIndex={phone ? undefined : 0} aria-label={phone ? undefined : 'Support tickets window: drag, or use the arrow keys to move it and Shift with the arrow keys to resize it'}>
        <UiIcon name="help" size={16} />
        <b>Support tickets</b>
        <span className="sf-grow" />
        <Link className="sf-btn" to={owner ? '/admin?tab=tickets' : '/support'} onClick={onClose} aria-label="Open Support tickets as a page" data-tip="Open as a page">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
          </svg>
        </Link>
        <button type="button" className="sf-btn sf-x" onClick={onClose} aria-label="Close Support tickets" data-tip="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      {/* The body holds the ticket list (which scrolls) and, over it, any ticket or form opened from it. */}
      <div className="sf-body" ref={setHost}>
        <div className="sf-scroll hq hq-solo">
        <div className="hq-main">
          {orgs === null || !host ? (
            <Loader label="Opening Support tickets" />
          ) : (
            <PortalHost.Provider value={host}>
              <Suspense fallback={<Loader label="Opening Support tickets" />}>
                <SupportTickets owner={owner} orgs={orgs} local />
              </Suspense>
            </PortalHost.Provider>
          )}
        </div>
        </div>
      </div>
      {!phone && <span className="sf-size" onPointerDown={drag('size')} aria-hidden="true" title="Drag to resize" />}
    </div>
  );
}
