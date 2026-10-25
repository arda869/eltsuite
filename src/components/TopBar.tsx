import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Wordmark } from './Wordmark';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Avatar } from './avatars';
import { AvatarPicker } from './AvatarPicker';

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function TopBar({ children }: { children?: ReactNode }) {
  const { user, profile, signOutNow } = useAuth();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [classIds, setClassIds] = useState<string[]>([]);
  useEffect(() => {
    if (!user || profile?.role !== 'teacher') return;
    return onSnapshot(query(collection(db, 'classes'), where('teacherId', '==', user.uid)), (s) => setClassIds(s.docs.map((d) => d.id)), () => {});
  }, [user, profile?.role]);
  const ref = useRef<HTMLDivElement>(null);
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
      <Link to="/" style={{ textDecoration: 'none' }}>
        <Wordmark />
      </Link>
      {children}
      <div className="right" ref={ref}>
        <button className="avatar" aria-label="Account" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {profile?.avatar ? <Avatar k={profile.avatar} size={32} /> : user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initials(name)}
        </button>
        {open && (
          <div className="menu" role="menu">
            <div className="who">
              <strong>{name}</strong>
              <span className="hint">{user?.email}</span>
            </div>
            <button role="menuitem" onClick={() => (setPicking(true), setOpen(false))}>
              Choose a profile picture
            </button>
            <button role="menuitem" onClick={signOutNow}>
              Sign out
            </button>
          </div>
        )}
      </div>
      {picking && <AvatarPicker classIds={classIds} onClose={() => setPicking(false)} />}
    </header>
  );
}
