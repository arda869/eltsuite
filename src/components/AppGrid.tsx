import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useSuper, useAppOn, useOrgs } from '../lib/admin';

// The apps in the suite, from the nine-dot button: one account, every app.

type App = { k: string; d: string; name: string; short?: string; group: 'teach' | 'make' | 'share' | 'help' | 'run'; about: string; to?: string; soon?: boolean; teacher?: boolean; color: string; icon: JSX.Element };
const I = (d: string) => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
// Home has its own colour, used by the top bar's mark on the home page too.
export const HOME_COLOR = '#8b3d6b';
const APPS: App[] = [
  { k: 'development', group: 'teach', name: 'Development Studio', about: 'Reading, reflections, classroom research and your teaching coach', to: '/development', teacher: true, color: '#a56748', d: 'M12 20V6M12 9C9 4 4 5 4 5v11c4 0 6 1 8 4M12 9c3-5 8-4 8-4v11c-4 0-6 1-8 4M8 2v3M16 2v3', icon: I('M12 20V6M12 9C9 4 4 5 4 5v11c4 0 6 1 8 4M12 9c3-5 8-4 8-4v11c-4 0-6 1-8 4M8 2v3M16 2v3') },
  { k: 'home', group: 'teach', name: 'Home', about: 'Your day at a glance', to: '/', color: HOME_COLOR, d: 'M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z', icon: I('M4 10.6 12 4l8 6.6V19a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z') },
  { k: 'classes', group: 'teach', name: 'Classes', about: 'Classes, lessons and live teaching', to: '/classes', teacher: true, color: '#c8764a', d: 'M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z', icon: I('M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z') },
  { k: 'files', group: 'share', name: 'Resources', about: 'Your library, lessons, documents, flashcards and reading', to: '/archive', teacher: true, color: '#3667a6', d: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z', icon: I('M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z') },
  { k: 'collab', group: 'make', name: 'Collab', about: 'Documents and slides written together, live', to: '/collab', teacher: true, color: '#2f6f9f', d: 'M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5zM14 3.5V8h4.5M9 12.5h6M9 16h4', icon: I('M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5zM14 3.5V8h4.5M9 12.5h6M9 16h4') },
  { k: 'reading', group: 'make', short: 'Reading', name: 'Reading Journal', about: 'What you read, with notes and citations', to: '/reading', teacher: true, color: '#6b5a8a', d: 'M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5zM5 17.5A2.5 2.5 0 0 1 7.5 15H18M9 8.5h5', icon: I('M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5zM5 17.5A2.5 2.5 0 0 1 7.5 15H18M9 8.5h5') },
  { k: 'pdf', group: 'make', name: 'PDF', about: 'PDFs to write on, alone or together', to: '/pdf', teacher: true, color: '#a6463a', d: 'M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5zM14 3.5V8h4.5M9 16.5l2-5 2 5M9.6 15h2.8', icon: I('M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5zM14 3.5V8h4.5M9 16.5l2-5 2 5M9.6 15h2.8') },
  { k: 'storyboard', group: 'make', short: 'Storyboards', name: 'Storyboards', about: 'Scenes with people and speech bubbles, for stories and speaking', to: '/storyboard', teacher: true, color: '#4f7a55', d: 'M3.5 8h7.5v6.5H3.5zM13 8h7.5v6.5H13zM5 18h4M14.5 18h4M14 3.5h5.5a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1H16l-2 1.5z', icon: I('M3.5 8h7.5v6.5H3.5zM13 8h7.5v6.5H13zM5 18h4M14.5 18h4M14 3.5h5.5a1 1 0 0 1 1 1V6a1 1 0 0 1-1 1H16l-2 1.5z') },
  { k: 'design', group: 'make', name: 'Design', about: 'Posters, flashcards and labelled pictures for class', to: '/design', teacher: true, color: '#6d5bd0', d: 'M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01', icon: I('M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11.5h.01M10 7.5h.01M15 7.5h.01') },
  { k: 'recordings', group: 'make', short: 'Recordings', name: 'Recordings', about: 'Recordings with scripts, to use in any lesson', to: '/recordings', teacher: true, color: '#a8473a', d: 'M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3.5', icon: I('M12 3.5a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0v-5a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v3.5') },
  { k: 'messages', group: 'share', name: 'Messages', about: 'Chats with learners and colleagues', to: '/messages', color: '#7a4fa3', d: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z', icon: I('M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5z') },
  { k: 'colleagues', group: 'share', name: 'Colleagues', about: 'The teachers you work with, and what you share', to: '/colleagues', teacher: true, color: '#4f6b7a', d: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2', icon: I('M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2') },
  { k: 'superadmin', group: 'run', short: 'Super Admin', name: 'Super Admin', about: 'Every teacher, organisation and app switch', to: '/admin', teacher: true, color: '#2f2e2d', d: 'M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3zM9 12l2 2 4-4', icon: I('M12 3.5l7 2.8v5.2c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6.3zM9 12l2 2 4-4') },
  { k: 'orgadmin', group: 'run', short: 'Organisation', name: 'Organisation admin', about: 'Your organisation’s teachers, rules, branding and library', to: '/org-admin', teacher: true, color: '#5d6f80', d: 'M4 20V8l8-4.5L20 8v12M9 20v-5h6v5M4 20h16M9 10.5h.01M15 10.5h.01', icon: I('M4 20V8l8-4.5L20 8v12M9 20v-5h6v5M4 20h16M9 10.5h.01M15 10.5h.01') },
  { k: 'timetable', group: 'teach', name: 'Timetable', about: 'Your classes and meetings, week by week', to: '/timetable', teacher: true, color: '#8a6a4a', d: 'M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4', icon: I('M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4') },
  { k: 'guide', group: 'help', name: 'Guide', about: 'How ELT Suite works, with things to try', to: '/guide', teacher: true, color: '#4a7a4f', d: 'M12 6.5C10.4 5.3 8 4.5 4.5 4.5v13c3.5 0 5.9.8 7.5 2 1.6-1.2 4-2 7.5-2v-13c-3.5 0-5.9.8-7.5 2zM12 6.5v13', icon: I('M12 6.5C10.4 5.3 8 4.5 4.5 4.5v13c3.5 0 5.9.8 7.5 2 1.6-1.2 4-2 7.5-2v-13c-3.5 0-5.9.8-7.5 2zM12 6.5v13') },
  { k: 'rooms', group: 'teach', name: 'Rooms', about: 'Audio and video calls, and your classes’ video rooms', to: '/rooms', teacher: true, color: '#3b7f7a', d: 'M3.5 7A1.5 1.5 0 0 1 5 5.5h9A1.5 1.5 0 0 1 15.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17zM15.5 10.5l5-3v9l-5-3', icon: I('M3.5 7A1.5 1.5 0 0 1 5 5.5h9A1.5 1.5 0 0 1 15.5 7v10a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 17zM15.5 10.5l5-3v9l-5-3') },
];
// For the sign-in page's picture of the suite.
export const SUITE_APPS: readonly Pick<App, 'k' | 'name' | 'about' | 'color' | 'd'>[] = APPS.filter(a => a.k !== 'reading');


// An app's own logo: its symbol, white, on a square of its colour. Shown top left in the app.
export function AppLogo({ k, size = 30 }: { k: string; size?: number }) {
  const a = APPS.find((x) => x.k === (k === 'reading' ? 'development' : k));
  if (!a) return null;
  return (
    <span className="app-logo" style={{ width: size, height: size, ['--app' as string]: a.color }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d={a.d} />
      </svg>
    </span>
  );
}

// Teaching first, then the apps you make things in, then files and people. Help and running ELT Suite
// sit at the bottom, smaller.
const GROUPS: [App['group'], string][] = [
  ['teach', 'Teach'],
  ['make', 'Make'],
  ['share', 'Resources and people'],
];
const ORDER = ['home', 'classes', 'development', 'timetable', 'rooms', 'collab', 'design', 'pdf', 'storyboard', 'reading', 'recordings', 'files', 'messages', 'colleagues', 'guide', 'superadmin', 'orgadmin'];
const rank = (k: string) => (ORDER.indexOf(k) + 1 || 99);

// The app a page belongs to, for the tab's icon.
export function appAt(pathname: string) {
  return APPS.filter((a) => a.to && a.to !== '/' && (pathname === a.to || pathname.startsWith(a.to + '/'))).sort((a, b) => b.to!.length - a.to!.length)[0] ?? null;
}
// The tab's icon: the app's own symbol, white on its colour.
let firstIcon = '';
export function setAppFavicon(a: { color: string; d: string } | null) {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) return;
  if (!firstIcon) firstIcon = link.href;
  if (!a) return void (link.href = firstIcon);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${a.color}"/><g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${a.d}"/></g></svg>`;
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function AppGrid() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const ME = 'apps';
  // Only one menu at the top is open at a time: opening one closes the other.
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent('top-menu', { detail: ME }));
    const other = (e: Event) => (e as CustomEvent).detail !== ME && setOpen(false);
    window.addEventListener('top-menu', other);
    return () => window.removeEventListener('top-menu', other);
  }, [open]);
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
  const show = (k: string) => (k === 'home' ? true : k === 'superadmin' ? owner : k === 'orgadmin' ? !!adminOf?.length : on(k));
  const apps = APPS.filter((a) => a.k !== 'reading' && (teacher || (!a.teacher && !a.soon)) && show(a.k));
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
            const list = apps.filter((a) => a.group === g && a.to).sort((x, y) => rank(x.k) - rank(y.k));
            if (!list.length) return null;
            const head = g === 'teach' && !teacher ? 'Learning' : label;
            return (
              <section key={g} className="apps-g" aria-label={head}>
                <span className="apps-h">{head}</span>
                <div className="apps-row">
                  {list.map((a) => (
                    <Link key={a.k} to={a.to!} role="menuitem" draggable={false} onDragStart={(e) => e.preventDefault()} className="app-tile" style={{ ['--app' as string]: a.color }} aria-label={a.name} data-tip={a.about} onClick={() => setOpen(false)}>
                      <span className="app-ico">{a.icon}</span>
                      <b className={a.k === 'development' ? 'app-name-wrap' : undefined}>{a.short ?? a.name}</b>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
          {(() => {
            const foot = apps.filter((a) => (a.group === 'help' || a.group === 'run') && a.to).sort((x, y) => rank(x.k) - rank(y.k));
            return foot.length ? (
              <div className="apps-foot">
                {foot.map((a) => (
                  <Link key={a.k} to={a.to!} role="menuitem" draggable={false} onDragStart={(e) => e.preventDefault()} className="apps-chip" style={{ ['--app' as string]: a.color }} aria-label={a.name} data-tip={a.about} onClick={() => setOpen(false)}>
                    <span className="apps-chip-ic">{a.icon}</span>
                    {a.short ?? a.name}
                  </Link>
                ))}
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
