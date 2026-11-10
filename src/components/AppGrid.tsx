import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useSuper, useAppOn, useOrgs } from '../lib/admin';

// The apps in the suite, from the nine-dot button: one account, every app.
// Glyphs are SVG markup shared by the launcher, top-bar logo, tab favicon, sign-in orbit and Guide.

type App = { k: string; glyph: string; name: string; short?: string; group: 'teach' | 'make' | 'share' | 'develop' | 'help' | 'run'; about: string; to?: string; soon?: boolean; teacher?: boolean; color: string; icon: JSX.Element };

export function AppGlyph({ glyph, size = 26, strokeWidth = 1.75 }: { glyph: string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: glyph }} />
  );
}

const I = (glyph: string) => <AppGlyph glyph={glyph} size={26} />;

// Shared app symbols from the app icon design reference.
export const APP_MARKS = {
  home: "<path d=\"M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z\"></path><path d=\"M12 17.3c-2.1-1.3-3.1-2.4-3.1-3.6a1.55 1.55 0 0 1 3.1-.5 1.55 1.55 0 0 1 3.1.5c0 1.2-1 2.3-3.1 3.6z\"></path>",
  classes: "<rect x=\"3.5\" y=\"4\" width=\"17\" height=\"11.5\" rx=\"1.5\"></rect><path d=\"M8.5 15.5 6.8 20.5M15.5 15.5l1.7 5M12 2.5V4\"></path><path d=\"M7 10.3c1.1-1.6 2.3-1.6 3.4 0s2.3 1.6 3.4 0 2.3-1.6 3.2 0\"></path>",
  timetable: "<path d=\"M12.5 19.5h-7A1.5 1.5 0 0 1 4 18V7a1.5 1.5 0 0 1 1.5-1.5h12A1.5 1.5 0 0 1 19 7v3.5\"></path><path d=\"M4 9.5h15M8 3.5V7M15 3.5V7\"></path><circle cx=\"17\" cy=\"17\" r=\"4\"></circle><path d=\"M17 15v2l1.3 1.1\"></path>",
  rooms: "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"15\" rx=\"2.2\"></rect><circle cx=\"8.8\" cy=\"10.6\" r=\"2\"></circle><circle cx=\"15.2\" cy=\"10.6\" r=\"2\"></circle><path d=\"M5.6 16.6a3.2 3.2 0 0 1 6.4 0M12 16.6a3.2 3.2 0 0 1 6.4 0\"></path><circle cx=\"18\" cy=\"7.3\" r=\".9\" fill=\"currentColor\" stroke=\"none\"></circle>",
  collab: "<rect x=\"4.5\" y=\"3.5\" width=\"15\" height=\"17\" rx=\"2\"></rect><path d=\"M8 8h8M8 11.5h4M8 15.5h2.5\"></path><path d=\"M14.5 10v3.2M12.8 14v3.2\"></path><circle cx=\"14.5\" cy=\"9.4\" r=\"1\" fill=\"currentColor\" stroke=\"none\"></circle><circle cx=\"12.8\" cy=\"13.4\" r=\"1\" fill=\"currentColor\" stroke=\"none\"></circle>",
  design: "<rect x=\"3.5\" y=\"7\" width=\"13\" height=\"13\" rx=\"2\"></rect><circle cx=\"8\" cy=\"11.3\" r=\"1.4\"></circle><path d=\"M4 18l3.8-3.4 2.8 2.4 1.8-1.5 3.6 3.2\"></path><path d=\"M19 2.6c.3 1.6 1 2.3 2.4 2.5-1.4.2-2.1.9-2.4 2.5-.3-1.6-1-2.3-2.4-2.5 1.4-.2 2.1-.9 2.4-2.5z\"></path>",
  pdf: "<path d=\"M6.5 3.5h8L19 8v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z\"></path><path d=\"M14.5 3.5V8H19\"></path><path d=\"M8.5 11.5h5\"></path><rect x=\"7.8\" y=\"14\" width=\"8.4\" height=\"3\" rx=\".8\" fill=\"currentColor\" fill-opacity=\".35\"></rect>",
  recordings: "<path d=\"M4 10.5v3M8 7.5v9M12 4v16M16 8.5v7M20 10.5v3\"></path>",
  video: "<path d=\"M3.5 10h17v8.5A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5z\"></path><path d=\"M3.5 10V7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V10\"></path><path d=\"M8.5 6 6.5 10M13.5 6l-2 4M18.5 6l-2 4\"></path><path d=\"M10.6 12.8v4.4l3.6-2.2z\"></path>",
  games: "<path d=\"M7.5 7.5h9a4.5 4.5 0 0 1 4.4 5.5l-.8 3.9a2.3 2.3 0 0 1-3.9 1.1l-1.7-1.8h-5l-1.7 1.8a2.3 2.3 0 0 1-3.9-1.1L3.1 13A4.5 4.5 0 0 1 7.5 7.5z\"></path><path d=\"M8 10.8v3.4M6.3 12.5h3.4\"></path><circle cx=\"15.6\" cy=\"11.4\" r=\"1\" fill=\"currentColor\" stroke=\"none\"></circle><circle cx=\"17.4\" cy=\"13.6\" r=\"1\" fill=\"currentColor\" stroke=\"none\"></circle>",
  files: "<rect x=\"4\" y=\"4.5\" width=\"3.6\" height=\"15\" rx=\".8\"></rect><rect x=\"7.6\" y=\"7\" width=\"3.6\" height=\"12.5\" rx=\".8\"></rect><path d=\"M13.2 7.6l3.1-.8 3.3 12.3-3.1.8z\"></path><path d=\"M3 19.5h18\"></path><path d=\"M4 8.2h3.6M7.6 10.6h3.6\"></path>",
  messages: "<path d=\"M12 4.5c4.7 0 8.5 3 8.5 6.8s-3.8 6.8-8.5 6.8c-1 0-2-.1-2.9-.4L5 19.5l1.2-3.4c-1.6-1.3-2.7-3-2.7-4.8 0-3.8 3.8-6.8 8.5-6.8z\"></path><circle cx=\"8.3\" cy=\"11.3\" r=\"1.05\" fill=\"currentColor\" stroke=\"none\"></circle><circle cx=\"12\" cy=\"11.3\" r=\"1.05\" fill=\"currentColor\" stroke=\"none\"></circle><circle cx=\"15.7\" cy=\"11.3\" r=\"1.05\" fill=\"currentColor\" stroke=\"none\"></circle>",
  colleagues: "<circle cx=\"8.8\" cy=\"8.5\" r=\"3\"></circle><path d=\"M3.3 19.5a5.5 5.5 0 0 1 11 0\"></path><circle cx=\"16.6\" cy=\"7.6\" r=\"2.4\"></circle><path d=\"M15.4 12.4a4.8 4.8 0 0 1 5.4 5.6\"></path><path d=\"M16.8 20.3c-1.5-.9-2.2-1.7-2.2-2.5a1.1 1.1 0 0 1 2.2-.3 1.1 1.1 0 0 1 2.2.3c0 .8-.7 1.6-2.2 2.5z\" fill=\"currentColor\" stroke=\"none\"></path>",
  development: "<path d=\"M12 20.5v-8\"></path><path d=\"M12 14c0-3.6-2.4-6-6.5-6 0 3.7 2.6 6 6.5 6z\"></path><path d=\"M12 11.5c0-3.4 2.3-5.7 6.5-5.7 0 3.5-2.5 5.7-6.5 5.7z\"></path><path d=\"M7.5 20.5h9\"></path>",
  linguistics: "<path d=\"M4 5.2h11.5A1.8 1.8 0 0 1 17.3 7v7.2a1.8 1.8 0 0 1-1.8 1.8H10L6 19.2v-3.8H5.8A1.8 1.8 0 0 1 4 13.6z\"/><path d=\"M8.2 9.6c0-1.6 1.3-2.4 2.7-2.4 1.5 0 2.6.9 2.6 2.1 0 1.4-1.5 1.8-2.5 2.3-.4.2-.6.5-.6.9\"/>",
  guide: "<circle cx=\"12\" cy=\"12\" r=\"8.5\"></circle><path d=\"M15.2 8.8 13.2 13.2 8.8 15.2 10.8 10.8z\"></path><path d=\"M12 3.5v1.5M12 19v1.5M3.5 12H5M19 12h1.5\"></path>",
  superadmin: "<path d=\"M12 3.2 19 6v5.4c0 4.3-3 7.6-7 8.8-4-1.2-7-4.5-7-8.8V6z\"></path><circle cx=\"12\" cy=\"10.6\" r=\"1.7\"></circle><path d=\"M12 12.3v3.2\"></path>",
  orgadmin: "<path d=\"M5 20.5v-9.3L12 7.5l7 3.7v9.3M3.5 20.5h17M10 20.5v-4h4v4\"></path><path d=\"M12 7.5V3\"></path><path d=\"M12 3.2h3.8l-1 1.3 1 1.3H12\"></path><path d=\"M7.8 13.5h1.4M14.8 13.5h1.4\"></path>",
  reading: "<path d=\"M12 6.5C10 5.2 7.5 4.5 4 4.5v13c3.5 0 6 .7 8 2 2-1.3 4.5-2 8-2v-13c-3.5 0-6 .7-8 2zM12 6.5v13\"></path><path d=\"M15 5.4v5.1l1.4-1.1 1.4 1.1V4.8\"></path>",
  money: "<path d=\"M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z\"/>",
} as const;

export function appMark(k: string) {
  if (k === 'storyboard') return APP_MARKS.design;
  if (k === 'reading') return APP_MARKS.reading;
  return APP_MARKS[k as keyof typeof APP_MARKS];
}

// Home has its own colour, used by the top bar's mark on the home page too.
export const HOME_COLOR = '#8b3d6b';
const APPS: App[] = [
  { k: 'games', group: 'make', name: 'Games', about: 'Make games and play them live or at learners’ own pace, in class or with a code', to: '/games', teacher: true, color: '#996525', glyph: APP_MARKS.games, icon: I(APP_MARKS.games) },
  { k: 'home', group: 'teach', name: 'Home', about: 'Your day at a glance', to: '/', color: HOME_COLOR, glyph: APP_MARKS.home, icon: I(APP_MARKS.home) },
  { k: 'classes', group: 'teach', name: 'Classes', about: 'Classes, lessons and live teaching', to: '/classes', teacher: true, color: '#c8764a', glyph: APP_MARKS.classes, icon: I(APP_MARKS.classes) },
  { k: 'files', group: 'share', name: 'Resources', about: 'Your library, lessons, documents, flashcards and reading', to: '/archive', teacher: true, color: '#3667a6', glyph: APP_MARKS.files, icon: I(APP_MARKS.files) },
  { k: 'collab', group: 'make', name: 'Collab', about: 'Documents and slides written together, live', to: '/collab', teacher: true, color: '#2f6f9f', glyph: APP_MARKS.collab, icon: I(APP_MARKS.collab) },
  { k: 'reading', group: 'make', short: 'Reading Journal', name: 'Reading Journal', about: 'What you read, with notes and citations', to: '/reading', teacher: true, color: '#6b5a8a', glyph: APP_MARKS.reading, icon: I(APP_MARKS.reading) },
  { k: 'pdf', group: 'make', name: 'PDF', about: 'PDFs to write on, alone or together', to: '/pdf', teacher: true, color: '#a6463a', glyph: APP_MARKS.pdf, icon: I(APP_MARKS.pdf) },
  { k: 'design', group: 'make', name: 'Designer', about: 'Storyboards, AI images and image editing', to: '/design', teacher: true, color: '#6d5bd0', glyph: APP_MARKS.design, icon: I(APP_MARKS.design) },
  { k: 'video', group: 'make', name: 'Video editor', short: 'Video', about: 'Edit classroom videos and reuse characters', to: '/studio/video', teacher: true, color: '#487d87', glyph: APP_MARKS.video, icon: I(APP_MARKS.video) },
  { k: 'recordings', group: 'make', short: 'Recordings', name: 'Recordings', about: 'Recordings with scripts, to use in any lesson', to: '/recordings', teacher: true, color: '#a8473a', glyph: APP_MARKS.recordings, icon: I(APP_MARKS.recordings) },
  { k: 'messages', group: 'share', name: 'Messages', about: 'Chats with learners and colleagues', to: '/messages', color: '#7a4fa3', glyph: APP_MARKS.messages, icon: I(APP_MARKS.messages) },
  { k: 'colleagues', group: 'share', name: 'Colleagues', about: 'The teachers you work with, and what you share', to: '/colleagues', teacher: true, color: '#4f6b7a', glyph: APP_MARKS.colleagues, icon: I(APP_MARKS.colleagues) },
  { k: 'superadmin', group: 'run', short: 'Super Admin', name: 'Super Admin', about: 'Every teacher, organisation and app switch', to: '/admin', teacher: true, color: '#2f2e2d', glyph: APP_MARKS.superadmin, icon: I(APP_MARKS.superadmin) },
  { k: 'orgadmin', group: 'run', short: 'Organisation', name: 'Organisation admin', about: 'Your organisation’s teachers, rules, branding and library', to: '/org-admin', teacher: true, color: '#5d6f80', glyph: APP_MARKS.orgadmin, icon: I(APP_MARKS.orgadmin) },
  { k: 'timetable', group: 'teach', name: 'Timetable', about: 'Your classes and meetings, week by week', to: '/timetable', teacher: true, color: '#8a6a4a', glyph: APP_MARKS.timetable, icon: I(APP_MARKS.timetable) },
  { k: 'guide', group: 'help', name: 'Guide', about: 'How ELT Suite works, with things to try', to: '/guide', teacher: true, color: '#4a7a4f', glyph: APP_MARKS.guide, icon: I(APP_MARKS.guide) },
  { k: 'rooms', group: 'teach', name: 'Rooms', about: 'Audio and video calls, and your classes’ video rooms', to: '/rooms', teacher: true, color: '#3b7f7a', glyph: APP_MARKS.rooms, icon: I(APP_MARKS.rooms) },
];
// For the sign-in page's picture of the suite.
export const SUITE_APPS: readonly Pick<App, 'k' | 'name' | 'about' | 'color' | 'glyph'>[] = APPS;

// An app's own logo: its symbol, white, on a square of its colour. Shown top left in the app.
export function AppLogo({ k, size = 30 }: { k: string; size?: number }) {
  const a = APPS.find((x) => x.k === (k === 'storyboard' ? 'design' : k));
  if (!a) return null;
  return (
    <span className="app-logo" style={{ width: size, height: size, ['--app' as string]: a.color }} aria-hidden="true">
      <AppGlyph glyph={a.glyph} size={size * 0.5} strokeWidth={size <= 22 ? 2.3 : size <= 30 ? 2 : 1.75} />
    </span>
  );
}

// Teaching first, then the apps you make things in, then files and people. Help and running ELT Suite
// sit at the bottom, smaller.
const GROUPS: [App['group'], string][] = [
  ['teach', 'Teach and organise'],
  ['make', 'Create materials'],
  ['develop', 'Professional learning'],
  ['share', 'Resources and people'],
];
const ORDER = ['home', 'classes', 'timetable', 'rooms', 'collab', 'design', 'pdf', 'storyboard', 'reading', 'recordings', 'video', 'files', 'messages', 'colleagues', 'guide', 'superadmin', 'orgadmin'];
const rank = (k: string) => (ORDER.indexOf(k) + 1 || 99);

// Fetch an app's code as the pointer reaches its tile, before navigation starts.
// Route-level lazy loading still keeps apps out of the initial Home download.
const appModules: Record<string, () => Promise<unknown>> = {
  home: () => import('../pages/HomePage'),
  classes: () => import('../pages/TeacherHome'),
  timetable: () => import('../pages/TimetablePage'),
  rooms: () => import('../pages/RoomsPage'),
  collab: () => import('../pages/AppFiles'),
  design: () => import('../pages/AppFiles'),
  pdf: () => import('../pages/AppFiles'),
  reading: () => import('../pages/AppFiles'),
  recordings: () => import('../pages/AppFiles'),
  games: () => import('../pages/AppFiles'),
  files: () => import('../pages/MediaArchive'),
  messages: () => import('../pages/MessagesPage'),
  colleagues: () => import('../pages/ColleaguesPage'),
  superadmin: () => import('../pages/AdminPage'),
  orgadmin: () => import('../pages/AdminPage'),
  guide: () => import('../pages/GuidePage'),
  video: () => import('../video/VideoEditor'),
};
const warmedApps = new Set<string>();
const warmApp = (key: string) => {
  if (warmedApps.has(key)) return;
  const load = appModules[key];
  if (!load) return;
  warmedApps.add(key);
  void load().catch(() => warmedApps.delete(key));
};

// The app a page belongs to, for the tab's icon.
export function appAt(pathname: string) {
  if (pathname === '/observations') return APPS.find(a => a.k === 'collab') ?? null;
  return APPS.filter((a) => a.to && a.to !== '/' && (pathname === a.to || pathname.startsWith(a.to + '/'))).sort((a, b) => b.to!.length - a.to!.length)[0] ?? null;
}
// The tab's icon: the app's own symbol, white on its colour.
let firstIcon = '';
export function setAppFavicon(a: { color: string; glyph: string } | null) {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (!link) return;
  if (!firstIcon) firstIcon = link.href;
  if (!a) return void (link.href = firstIcon);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${a.color}"/><g transform="translate(8 8) scale(.666667)" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${a.glyph}</g></svg>`;
  link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function AppGrid() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const ME = 'apps';
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const small = window.matchMedia('(max-width: 700px)').matches;
    if (!small) searchRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    if (small) document.body.style.overflow = 'hidden';
    return () => { if (small) document.body.style.overflow = previousOverflow; };
  }, [open]);
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
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc, true);
    return () => (document.removeEventListener('mousedown', close), document.removeEventListener('keydown', esc, true));
  }, [open]);
  const { user } = useAuth();
  const teacher = profile?.role === 'teacher';
  const on = useAppOn();
  // Super Admin is for super admins; Organisation admin, for the admins of an organisation.
  const owner = useSuper() === true;
  const adminOf = useOrgs(false, teacher ? user?.email : null);
  const show = (k: string) => (k === 'home' ? true : k === 'superadmin' ? owner : k === 'orgadmin' ? !!adminOf?.length : on(k));
  const apps = APPS.filter((a) => (teacher || (!a.teacher && !a.soon)) && show(a.k === 'reading' ? 'development' : a.k) && `${a.name} ${a.about}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="apps" ref={ref}>
      <button ref={buttonRef} type="button" className="apps-btn" aria-label="Apps" aria-expanded={open} aria-controls={open ? 'suite-apps-menu' : undefined} data-tip="Apps" onClick={() => {setOpen((o) => !o);setSearch('');}}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          {[3, 10, 17].flatMap((y) => [3, 10, 17].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" fill="currentColor" />))}
        </svg>
      </button>
      {open && (
        <>
        <button type="button" className="apps-scrim" aria-label="Close apps menu" onClick={() => setOpen(false)} />
        <div id="suite-apps-menu" className="apps-pop" aria-label="Apps">
          <div className="apps-pop-head">
            <div><span className="apps-eyebrow">ELT Suite</span><h2>Apps</h2></div>
            <button type="button" className="apps-close" aria-label="Close apps menu" onClick={() => {setOpen(false);buttonRef.current?.focus();}}>×</button>
          </div>
          <label className="apps-search"><span className="sr-only">Find an app</span><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.7"/><path d="m16 16 4.5 4.5"/></svg><input ref={searchRef} type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Find an app" /></label>
          <div className="apps-scroll">
          {!apps.length&&<p className="apps-empty">No apps match your search.</p>}
          <div role="menu" aria-label="Applications">
          {GROUPS.map(([g, label]) => {
            const list = apps.filter((a) => a.group === g && a.to).sort((x, y) => rank(x.k) - rank(y.k));
            if (!list.length) return null;
            const head = g === 'teach' && !teacher ? 'Learning' : label;
            return (
              <section role="group" key={g} className="apps-g" aria-label={head}>
                <span className="apps-h">{head}</span>
                <div className="apps-row">
                  {list.map((a) => (
                    <Link role="menuitem" key={a.k} to={a.to!} draggable={false} onDragStart={(e) => e.preventDefault()} className="app-tile" style={{ ['--app' as string]: a.color }} aria-label={a.name} data-tip={a.about} onMouseEnter={() => warmApp(a.k)} onFocus={() => warmApp(a.k)} onTouchStart={() => warmApp(a.k)} onClick={() => setOpen(false)}>
                      <span className="app-ico">{a.icon}</span>
                      <span className="app-tile-copy"><b className={a.k === 'development' ? 'app-name-wrap' : undefined}>{a.short ?? a.name}</b><small>{a.about}</small></span>
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
                  <Link role="menuitem" key={a.k} to={a.to!} draggable={false} onDragStart={(e) => e.preventDefault()} className="apps-chip" style={{ ['--app' as string]: a.color }} aria-label={a.name} data-tip={a.about} onMouseEnter={() => warmApp(a.k)} onFocus={() => warmApp(a.k)} onTouchStart={() => warmApp(a.k)} onClick={() => setOpen(false)}>
                    <span className="apps-chip-ic">{a.icon}</span>
                    {a.short ?? a.name}
                  </Link>
                ))}
              </div>
            ) : null;
          })()}
          </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
