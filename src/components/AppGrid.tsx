import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { libName, useSuper, useAppOn, useMyOrg, useOrgs } from '../lib/admin';

// The apps in the suite, from the nine-dot button: one account, every app.

type App = { k: string; name: string; short?: string; group: 'teach' | 'work' | 'run'; about: string; to?: string; soon?: boolean; teacher?: boolean; color: string; icon: JSX.Element };
const I = (d: string) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
// Home has its own colour, used by the top bar's mark on the home page too.
export const HOME_COLOR = '#8b3d6b';
const APPS: App[] = [
  { k: 'home', group: 'teach', name: 'Home', about: 'Your day at a glance', to: '/', color: HOME_COLOR, icon: I('M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z') },
  { k: 'classes', group: 'teach', name: 'Classes', about: 'Classes, lessons and live teaching', to: '/classes', teacher: true, color: '#c8764a', icon: I('M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z') },
  { k: 'files', group: 'work', name: 'Files', about: 'Your library, lessons, documents, flashcards and reading', to: '/archive', teacher: true, color: '#3667a6', icon: I('M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z') },
  { k: 'messages', group: 'work', name: 'Messages', about: 'Chats with learners and colleagues', to: '/messages', color: '#7a4fa3', icon: I('M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z') },
  { k: 'colleagues', group: 'work', name: 'Colleagues', about: 'The teachers you work with, and what you share', to: '/colleagues', teacher: true, color: '#4f6b7a', icon: I('M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2') },
  { k: 'library', group: 'work', short: 'Library', name: 'Organisation library', about: 'Your organisation’s lessons and materials, to copy into your classes', to: '/library', teacher: true, color: '#7a5a3a', icon: I('M4 4.5h3.5v15H4zM9.5 4.5H13v15H9.5zM15 5.2l3.3-.9 3.2 14.5-3.3.8z') },
  { k: 'superadmin', group: 'run', short: 'Super Admin', name: 'Super Admin', about: 'Every teacher, organisation and app switch', to: '/admin', teacher: true, color: '#2f2e2d', icon: I('M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3zM9 12l2 2 4-4') },
  { k: 'orgadmin', group: 'run', short: 'Organisation', name: 'Organisation admin', about: 'Your organisation’s teachers, rules, branding and library', to: '/org-admin', teacher: true, color: '#5d6f80', icon: I('M4 20V8l8-4.5L20 8v12M9 20v-5h6v5M4 20h16M9 10.5h.01M15 10.5h.01') },
  { k: 'support', group: 'run', short: 'Support', name: 'Support tickets', about: 'Tell us what is wrong or what you would like, with screenshots', to: '/support', teacher: true, color: '#9a4f3c', icon: I('M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4zM14 6v12') },
  { k: 'timetable', group: 'teach', name: 'Timetable', about: 'Your classes and meetings, week by week', to: '/timetable', teacher: true, color: '#8a6a4a', icon: I('M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4') },
  { k: 'rooms', group: 'teach', name: 'Rooms', about: 'Audio and video calls, and your classes’ video rooms', to: '/rooms', teacher: true, color: '#3b7f7a', icon: I('M3.5 7A1.5 1.5 0 0 1 5 5.5h9A1.5 1.5 0 0 1 15.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17zM15.5 10.5l5-3v9l-5-3') },
];

const GROUPS: [App['group'], string][] = [
  ['teach', 'Teaching'],
  ['work', 'Your work'],
  ['run', 'Running ELT Suite'],
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
  // Super Admin is for super admins; Organisation admin, for the admins of an organisation.
  const owner = useSuper() === true;
  const adminOf = useOrgs(false, teacher ? user?.email : null);
  const myOrg = useMyOrg();
  const show = (k: string) => (k === 'home' ? true : k === 'superadmin' ? owner : k === 'orgadmin' ? !!adminOf?.length : k === 'support' ? owner || !!adminOf?.length : k === 'library' ? !!myOrg && on(k) : on(k));
  const apps = APPS.filter((a) => (teacher || (!a.teacher && !a.soon)) && show(a.k)).map((a) => (a.k === 'library' ? { ...a, name: libName(myOrg) } : a));
  return (
    <div className="apps" ref={ref}>
      <button type="button" className="apps-btn" aria-label="Apps" aria-expanded={open} data-tip="Apps" onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          {[3, 10, 17].flatMap((y) => [3, 10, 17].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" fill="currentColor" />))}
        </svg>
      </button>
      {open && (
        <div className="apps-pop" role="menu" aria-label="Apps">
          {GROUPS.map(([g, label]) => {
            const list = apps.filter((a) => a.group === g && a.to);
            if (!list.length) return null;
            const head = g === 'teach' && !teacher ? 'Learning' : label;
            return (
              <section key={g} className="apps-g" aria-label={head}>
                <span className="apps-h">{head}</span>
                <div className="apps-row">
                  {list.map((a) => (
                    <Link key={a.k} to={a.to!} role="menuitem" className="app-tile" style={{ ['--app' as string]: a.color }} aria-label={a.name} data-tip={a.short && a.short !== a.name ? a.name : undefined} onClick={() => setOpen(false)}>
                      <span className="app-ico">{a.icon}</span>
                      <b>{a.short ?? a.name}</b>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
