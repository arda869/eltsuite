import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isLearnerEmail } from './learners';

export type TextSize = 'S' | 'M' | 'L' | 'XL';
export type Profile = (
  | { role: 'teacher'; displayName?: string }
  | { role: 'learner'; classId: string; learnerId: string; displayName: string }
) & { textSize?: TextSize; avatar?: string; reading?: Reading };

// Reading comfort settings: a clearer font, line focus, spacing and high contrast.
export type Reading = { font?: 'default' | 'clear'; focus?: boolean; letter?: 0 | 1 | 2; line?: 0 | 1 | 2; contrast?: boolean };

type AuthState = { user: User | null; profile: Profile | null; ready: boolean; signOutNow: () => Promise<void>; setTextSize: (t: TextSize) => void; setReading: (r: Reading) => void; setAvatarLocal: (k: string) => void };

const Ctx = createContext<AuthState>({ user: null, profile: null, ready: false, signOutNow: async () => {}, setTextSize: () => {}, setReading: () => {}, setAvatarLocal: () => {} });
export const TEXT_SCALE: Record<TextSize, number> = { S: 0.9, M: 1, L: 1.15, XL: 1.32 };

async function loadProfile(user: User): Promise<Profile | null> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as Profile;
  if (isLearnerEmail(user.email)) return null; // learner removed from class
  const profile = { role: 'teacher' as const, displayName: user.displayName ?? '', email: user.email ?? '', createdAt: serverTimestamp() };
  await setDoc(ref, profile);
  return { role: 'teacher', displayName: profile.displayName };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        let p: Profile | null = null;
        if (u) {
          try {
            p = await loadProfile(u);
          } catch (e) {
            console.error('Could not load profile', e);
            p = isLearnerEmail(u.email) ? null : { role: 'teacher' };
          }
        }
        setUser(u);
        setProfile(p);
        setReady(true);
      }),
    [],
  );

  const setTextSize = (t: TextSize) => {
    setProfile((p) => (p ? { ...p, textSize: t } : p));
    if (user) updateDoc(doc(db, 'users', user.uid), { textSize: t }).catch(() => {});
  };
  const setReading = (r: Reading) => {
    setProfile((p) => (p ? { ...p, reading: { ...(p.reading ?? {}), ...r } } : p));
    if (user) updateDoc(doc(db, 'users', user.uid), { reading: { ...(profile?.reading ?? {}), ...r } }).catch(() => {});
  };
  // Reading settings apply to the whole app through classes on <html>.
  useEffect(() => {
    const r = profile?.reading ?? {};
    const h = document.documentElement;
    h.classList.toggle('rd-clear', r.font === 'clear');
    h.classList.toggle('rd-focus', !!r.focus);
    h.classList.toggle('rd-contrast', !!r.contrast);
    h.style.setProperty('--rd-letter', ['0', '0.04em', '0.09em'][r.letter ?? 0]);
    h.style.setProperty('--rd-line', ['1', '1.25', '1.5'][r.line ?? 0]);
  }, [profile?.reading]);
  return <Ctx.Provider value={{ user, profile, ready, signOutNow: () => signOut(auth), setTextSize, setReading, setAvatarLocal: (k: string) => setProfile((p) => (p ? { ...p, avatar: k } : p)) }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
