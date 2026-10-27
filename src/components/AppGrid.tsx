import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { isOwnerEmail, useAppOn, useOrgs } from '../lib/admin';

// The apps in the suite, from the nine-dot button: one account, every app.

type App = { k: string; name: string; about: string; to?: string; soon?: boolean; teacher?: boolean; color: string; icon: JSX.Element };
const I = (d: string) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const APPS: App[] = [
  { k: 'classes', name: 'Classes', about: 'Classes, lessons and live teaching', to: '/', color: '#c8764a', icon: I('M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z') },
  { k: 'files', name: 'Files', about: 'Your library, lessons, documents, flashcards and reading', to: '/archive', teacher: true, color: '#3667a6', icon: I('M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z') },
  { k: 'messages', name: 'Messages', about: 'Chats with learners and colleagues', to: '/messages', color: '#7a4fa3', icon: I('M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z') },
  { k: 'colleagues', name: 'Colleagues', about: 'The teachers you work with, and what you share', to: '/colleagues', teacher: true, color: '#4f6b7a', icon: I('M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2') },
  { k: 'superadmin', name: 'Super Admin', about: 'Every teacher, organisation and app switch', to: '/admin', teacher: true, color: '#2f2e2d', icon: I('M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3zM9 12l2 2 4-4') },
  { k: 'orgadmin', name: 'Organisation admin', about: 'Your organisation’s teachers, rules, branding and drives', to: '/org-admin', teacher: true, color: '#5d6f80', icon: I('M4 20V8l8-4.5L20 8v12M9 20v-5h6v5M4 20h16M9 10.5h.01M15 10.5h.01') },
  { k: 'live', name: 'Live', about: 'Video lessons and meetings', soon: true, color: '#3c7c8c', icon: I('M4 7.5A1.5 1.5 0 0 1 5.5 6h9A1.5 1.5 0 0 1 16 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 16.5zM16 10.5l4-2.5v8l-4-2.5') },
  { k: 'cards', name: 'Cards', about: 'Flashcards and vocabulary games', soon: true, color: '#a8701f', icon: I('M8 3.5h10a1.5 1.5 0 0 1 1.5 1.5v12M5.5 7h9A1.5 1.5 0 0 1 16 8.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 19.5v-11A1.5 1.5 0 0 1 5.5 7z') },
  { k: 'tests', name: 'Tests', about: 'Exams, marking and results', soon: true, color: '#5b5f97', icon: I('M8 4h8M9 4v2h6V4M6.5 5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-12A1.5 1.5 0 0 0 18 5h-.5M8 11l2 2 4-4M8 16h8') },
  { k: 'planner', name: 'Planner', about: 'Timetable and lesson bookings', soon: true, color: '#8a6a4a', icon: I('M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4') },
  { k: 'observe', name: 'Observe', about: 'Teacher training and observation', soon: true, color: '#4f6b7a', icon: I('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z') },
  { k: 'portfolio', name: 'Portfolio', about: 'Learners’ progress over time', soon: true, color: '#b8508f', icon: I('M4 19V9M10 19V5M16 19v-7M22 19H2') },
];

export function AppGrid() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc));
  }, [open]);
  const { user } = useAuth();
  const teacher = profile?.role === 'teacher';
  const on = useAppOn();
  // Super Admin is the owner's alone; Organisation admin, for the admins of an organisation.
  const owner = isOwnerEmail(user?.email);
  const adminOf = useOrgs(false, teacher ? user?.email : null);
  const show = (k: string) => (k === 'superadmin' ? owner : k === 'orgadmin' ? !!adminOf?.length : on(k));
  const apps = APPS.filter((a) => (teacher || (!a.teacher && !a.soon)) && show(a.k));
  return (
    <div className="apps" ref={ref}>
      <button type="button" className="apps-btn" aria-label="Apps" aria-expanded={open} data-tip="Apps" onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          {[3, 10, 17].flatMap((y) => [3, 10, 17].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" fill="currentColor" />))}
        </svg>
      </button>
      {open && (
        <div className="apps-pop" role="menu" aria-label="Apps">
          <span className="apps-h">ELT Suite</span>
          {apps.map((a) =>
            a.to ? (
              <Link key={a.k} to={a.to} role="menuitem" className="app-tile" style={{ ['--app' as string]: a.color }} onClick={() => setOpen(false)}>
                <span className="app-ico">{a.icon}</span>
                <b>{a.name}</b>
                <span className="hint">{a.about}</span>
              </Link>
            ) : (
              <span key={a.k} className="app-tile soon" style={{ ['--app' as string]: a.color }} aria-disabled="true">
                <span className="app-ico">{a.icon}</span>
                <b>{a.name}</b>
                <span className="hint">Coming soon</span>
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
