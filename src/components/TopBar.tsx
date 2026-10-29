import { OrgLogo } from './OrgLook';
import { currentOrg, libName } from '../lib/admin';
import { AppGrid, AppLogo, HOME_COLOR } from './AppGrid';
import { ThemeChoice } from '../lib/theme';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Mark } from './Wordmark';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Avatar } from './avatars';
import { AvatarPicker } from './AvatarPicker';
import { PhoneMessagesLink } from './ChatDock';
import { UiIcon } from './UiIcon';
import { AppSetupDialog } from './AppSetup';
import { isStandalone } from '../lib/push';
import { STATUS_SETS, setMyStatus, statusOf, useMySet, useStatus } from '../lib/status';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function TopBar({ children }: { children?: ReactNode }) {
  const { user, profile, signOutNow } = useAuth();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [classIds, setClassIds] = useState<string[]>([]);
  useEffect(() => {
    if (!user || profile?.role !== 'teacher') return;
    const u1 = onSnapshot(query(collection(db, 'classes'), where('teacherId', '==', user.uid)), (s) => setClassIds((cur) => [...new Set([...cur, ...s.docs.map((d) => d.id)])]), () => {});
    const u2 = onSnapshot(query(collection(db, 'classes'), where('teacherIds', 'array-contains', user.uid)), (s) => setClassIds((cur) => [...new Set([...cur, ...s.docs.map((d) => d.id)])]), () => {});
    return () => (u1(), u2());
  }, [user, profile?.role]);
  const ref = useRef<HTMLDivElement>(null);
  const isTeacher = profile?.role === 'teacher';
  const mine = useStatus(isTeacher && user ? [user.uid] : [])[user?.uid ?? ''];
  const set = useMySet();
  const dot = statusOf(mine ? { ...mine, set } : undefined).dot;
  const name = user?.displayName || user?.email?.split('@')[0] || '';

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <header className="topbar">
      <AppMark />
      <OrgLogo />
      {children}
      <div className="right" ref={ref}>
        <PhoneMessagesLink />
        <AppGrid />
        <button className="avatar" aria-label="Account" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {profile?.avatar ? <Avatar k={profile.avatar} size={32} /> : user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initials(name)}
          {isTeacher && mine && <span className={'pz pz-' + dot} aria-hidden="true" />}
        </button>
        {open && (
          <div className="menu" role="menu">
            <div className="who">
              <strong>{name}</strong>
              <span className="hint">{user?.email}</span>
            </div>
            {isTeacher && (
              <div className="menu-status" role="group" aria-label="Your status">
                {STATUS_SETS.map((o) => (
                  <button key={o.k} type="button" role="menuitemradio" aria-checked={set === o.k} className={'menu-link' + (set === o.k ? ' on' : '')} onClick={() => setMyStatus(o.k)} data-tip={o.hint}>
                    <span className={'pz-i pz-' + (o.k === 'auto' ? 'online' : o.k === 'hidden' ? 'off' : o.k === 'teaching' ? 'class' : o.k)} aria-hidden="true" />
                    {o.label}
                  </button>
                ))}
              </div>
            )}
            <span className="menu-apps show-phone">
              <Link role="menuitem" className="menu-link" to="/" onClick={() => setOpen(false)}>
                <UiIcon name="classes" size={15} />
                Classes
              </Link>
              <Link role="menuitem" className="menu-link" to="/messages" onClick={() => setOpen(false)}>
                <UiIcon name="message" size={15} />
                Messages
              </Link>
              {profile?.role === 'teacher' && (
                <Link role="menuitem" className="menu-link" to="/archive" onClick={() => setOpen(false)}>
                  <UiIcon name="archive" size={15} />
                  Files
                </Link>
              )}
            </span>
            <Link role="menuitem" className="menu-link" to="/settings" onClick={() => setOpen(false)}>
              <UiIcon name="settings" size={15} />
              Settings
            </Link>
            {/* On a phone: put the app on the home screen, so it opens like any other app. */}
            {!isStandalone() && (
              <span className="show-phone">
                <button role="menuitem" className="menu-link" onClick={() => (setInstalling(true), setOpen(false))}>
                  <UiIcon name="import" size={15} />
                  Add to your home screen
                </button>
              </span>
            )}
            <ThemeChoice />
            <button role="menuitem" onClick={signOutNow}>
              Sign out
            </button>
            <span className="menu-legal">
              <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link>
            </span>
          </div>
        )}
      </div>
      {picking && <AvatarPicker classIds={classIds} onClose={() => setPicking(false)} />}
      {installing && <AppSetupDialog onClose={() => setInstalling(false)} />}
    </header>
  );
}

// Top left: the app you are in, within ELT Suite. It always goes home.
function AppMark() {
  const { pathname } = useLocation();
  // Every app shows its name under ELT Suite, in its own colour.
  const own = pathname.startsWith('/collab') ? { k: 'collab', name: 'Collab', color: '#2f6f9f' } : pathname.startsWith('/reading') ? { k: 'reading', name: 'Reading Journal', color: '#6b5a8a' } : pathname.startsWith('/pdf') ? { k: 'pdf', name: 'PDF', color: '#a6463a' } : pathname.startsWith('/recordings') ? { k: 'recordings', name: 'Recordings', color: '#a8473a' } : null;
  const app = own ??
    (pathname.startsWith('/archive') || pathname.startsWith('/doc')
      ? { name: 'Files', color: '#3667a6' }
      : pathname.startsWith('/messages')
        ? { name: 'Messages', color: '#7a4fa3' }
        : pathname.startsWith('/colleague')
          ? { name: 'Colleagues', color: '#4f6b7a' }
          : pathname.startsWith('/admin')
            ? { name: 'Super Admin', color: '#2f2e2d' }
          : pathname.startsWith('/library')
            ? { name: libName(currentOrg()), color: '#7a5a3a' }
          : pathname.startsWith('/org-admin')
            ? { name: 'Organisation admin', color: '#5d6f80' }
          : pathname.startsWith('/timetable')
            ? { name: 'Timetable', color: '#8a6a4a' }
          : pathname.startsWith('/guide')
            ? { name: 'Guide', color: '#4a7a4f' }
          : pathname.startsWith('/rooms')
            ? { name: 'Rooms', color: '#3b7f7a' }
          : pathname.startsWith('/settings')
            ? { name: 'Settings', color: '#6b6560' }
            : pathname.startsWith('/notebook')
              ? { name: 'Notebook', color: '#a8701f' }
              : pathname === '/'
                ? { name: 'Home', color: HOME_COLOR }
                : { name: 'Classes', color: '#c8764a' });
  return (
    <Link to="/" className="suite-mark" style={{ ['--app' as string]: app.color }} aria-label={`ELT Suite ${app.name}: Home`} data-tip="Home">
      {own ? <AppLogo k={own.k} size={28} /> : <Mark size={26} />}
      <span>
        <span className="suite-k">ELT Suite</span>
        <b>{app.name}</b>
      </span>
    </Link>
  );
}
