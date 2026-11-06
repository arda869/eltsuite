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

// Proposal A marks. Collab = live dots; Development Studio = journal + sprout.
export const APP_MARKS = {
  home: '<path d="M4 11 12 4l8 7v8.5a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z"/>',
  classes: '<rect x="3.5" y="4.5" width="17" height="12" rx="1.6"/><path d="M8 20.5 12 17l4 3.5M7 14.5h10"/>',
  timetable: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8 3.5v4M16 3.5v4"/><rect x="8" y="13" width="3.2" height="3.2" rx=".6"/>',
  rooms: '<rect x="3" y="6.5" width="12.5" height="11" rx="2"/><path d="M15.5 10.2 21 7v10l-5.5-3.2z"/>',
  collab: '<rect x="4.5" y="3.8" width="15" height="16.4" rx="2"/><path d="M7.5 8h9M7.5 11.5h6"/><path d="M13.5 14.5v3.5"/><circle cx="8.2" cy="16.2" r="1.3" fill="currentColor"/><circle cx="11.2" cy="16.2" r="1.3" fill="currentColor"/>',
  design: '<path d="M12 3.2a8.8 8.8 0 1 0 0 17.6c1.1 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2.1a3.9 3.9 0 0 0 3.9-3.9c0-4.3-3.9-7.9-8.6-7.9z"/><circle cx="7.6" cy="11.4" r="1.15"/><circle cx="10.2" cy="7.6" r="1.15"/><circle cx="14.8" cy="7.6" r="1.15"/>',
  pdf: '<rect x="7" y="4" width="12" height="15" rx="1.6"/><rect x="4.5" y="6.5" width="12" height="15" rx="1.6"/><path d="M7.5 12.5h6M7.5 16h4"/>',
  recordings: '<rect x="9.2" y="3.5" width="5.6" height="10" rx="2.8"/><path d="M6 12a6 6 0 0 0 12 0M12 18v2.5"/><path d="M18.5 7.5v4M20.5 8.5v2"/>',
  video: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.2"/><path d="M10 9.2v5.6l5.2-2.8z"/>',
  games: '<rect x="4.5" y="4.5" width="15" height="15" rx="3"/><circle cx="9" cy="9" r="1.15" fill="currentColor"/><circle cx="15" cy="15" r="1.15" fill="currentColor"/><circle cx="12" cy="12" r="1.15" fill="currentColor"/>',
  files: '<path d="M3.5 8A1.5 1.5 0 0 1 5 6.5h4l1.8 1.8H19A1.5 1.5 0 0 1 20.5 9.8v8.2A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/><rect x="8" y="11" width="8" height="5.5" rx="1"/>',
  messages: '<path d="M4 6.2A2.2 2.2 0 0 1 6.2 4h11.6A2.2 2.2 0 0 1 20 6.2v7.1A2.2 2.2 0 0 1 17.8 15.5H10L5.5 19v-3.5A2.2 2.2 0 0 1 4 13.3z"/><path d="M8 8.6h8M8 11.6h5"/>',
  colleagues: '<circle cx="9" cy="8" r="3.1"/><circle cx="16.4" cy="9" r="2.4"/><path d="M3.4 20a5.6 5.6 0 0 1 11.2 0M14.2 14.4a4.6 4.6 0 0 1 6.4 5.6"/>',
  development: '<path d="M6 4.2h9.5A1.8 1.8 0 0 1 17.3 6v12.8H7.8A1.8 1.8 0 0 1 6 17z"/><path d="M6 17a1.8 1.8 0 0 1 1.8-1.8H17.3"/><path d="M9 8.2h5"/><path d="M18.2 12.5c0-2.4 1.5-3.8 3.3-4.2-.2 2.6-1.4 4.2-3.3 4.8"/><path d="M18.2 13.1v4.2"/>',
  linguistics: '<path d="M4 5.2h11.5A1.8 1.8 0 0 1 17.3 7v7.2a1.8 1.8 0 0 1-1.8 1.8H10L6 19.2v-3.8H5.8A1.8 1.8 0 0 1 4 13.6z"/><path d="M8.2 9.6c0-1.6 1.3-2.4 2.7-2.4 1.5 0 2.6.9 2.6 2.1 0 1.4-1.5 1.8-2.5 2.3-.4.2-.6.5-.6.9"/>',
  guide: '<path d="M12 6.4C10.3 5.2 8 4.4 4.6 4.4v13c3.4 0 5.7.8 7.4 2 1.7-1.2 4-2 7.4-2v-13c-3.4 0-5.7.8-7.4 2zM12 6.4v13"/>',
  superadmin: '<path d="M12 3.2 19 6v5.4c0 4.3-3 7.6-7 8.8-4-1.2-7-4.5-7-8.8V6z"/><path d="M8.8 12.2 11 14.4l4.4-4.6"/>',
  orgadmin: '<path d="M4 20.5V8.2L12 4l8 4.2v12.3M9 20.5v-5h6v5M4 20.5h16"/><path d="M8.5 10.5h1.8M13.7 10.5h1.8M8.5 13.4h1.8M13.7 13.4h1.8"/>',
  reading: '<path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H7.5A2.5 2.5 0 0 1 5 17.5zM5 17.5A2.5 2.5 0 0 1 7.5 15H18M9 8.5h5"/>',
  money: '<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>',
} as const;

export function appMark(k: string) {
  if (k === 'storyboard') return APP_MARKS.design;
  if (k === 'reading') return APP_MARKS.reading;
  return APP_MARKS[k as keyof typeof APP_MARKS];
}

// Home has its own colour, used by the top bar's mark on the home page too.
export const HOME_COLOR = '#8b3d6b';
const APPS: App[] = [
  { k: 'games', group: 'make', name: 'Games', about: 'Make reusable classroom games and play together', to: '/games', teacher: true, color: '#996525', glyph: APP_MARKS.games, icon: I(APP_MARKS.games) },
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
      <AppGlyph glyph={a.glyph} size={size * 0.62} strokeWidth={1.9} />
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${a.color}"/><g transform="translate(4 4)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${a.glyph}</g></svg>`;
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
                    <Link role="menuitem" key={a.k} to={a.to!} draggable={false} onDragStart={(e) => e.preventDefault()} className="app-tile" style={{ ['--app' as string]: a.color }} aria-label={a.name} data-tip={a.about} onClick={() => setOpen(false)}>
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
                  <Link role="menuitem" key={a.k} to={a.to!} draggable={false} onDragStart={(e) => e.preventDefault()} className="apps-chip" style={{ ['--app' as string]: a.color }} aria-label={a.name} data-tip={a.about} onClick={() => setOpen(false)}>
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
