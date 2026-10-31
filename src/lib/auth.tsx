import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ensureProfile, NotInvited, setupErrorMessage, withSetupTimeout, type Profile, type TextSize, type Reading } from './teacherProfile';
export type { Profile, TextSize, Reading } from './teacherProfile';
export { inviteFields } from './teacherProfile';

type AuthState = { user: User | null; profile: Profile | null; ready: boolean; notInvited: string; signOutNow: () => Promise<void>; setTextSize: (t: TextSize) => void; setReading: (r: Reading) => void; setOnboardingLocal: (goal: string) => void; setAvatarLocal: (k: string) => void };

const Ctx = createContext<AuthState>({ user: null, profile: null, ready: false, notInvited: '', signOutNow: async () => {}, setTextSize: () => {}, setReading: () => {}, setOnboardingLocal: () => {}, setAvatarLocal: () => {} });
export const TEXT_SCALE: Record<TextSize, number> = { S: 0.9, M: 1, L: 1.15, XL: 1.32 };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  // The email of someone whose teacher profile could not be created with an invitation.
  const [notInvited, setNotInvited] = useState('');
  const [profileError, setProfileError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let generation = 0;
    let disposed = false;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
        if (disposed) return;
        const current = ++generation;
        const active = () => !disposed && current === generation && auth.currentUser?.uid === u?.uid;
        setUser(u);
        setProfileError('');
        setProfile(null);
        setReady(!u);
        let p: Profile | null = null;
        if (u) {
          // Wait for a real profile before opening teacher tools. Slow setup gets a retry screen.
          const load = ensureProfile(u);
          try {
            p = await withSetupTimeout(load);
          } catch (e) {
            if (!active()) return;
            if (e instanceof NotInvited) {
              setNotInvited(u.email ?? '');
              // Keep the sign-in account intact so a corrected invitation can be retried.
              if (active()) await signOut(auth).catch(() => {});
              return;
            }
            p = null;
            setProfileError(setupErrorMessage(e));
            void load
              .then((late) => { if (active() && late) { setProfile(late); setProfileError(''); setReady(true); } })
              .catch((late) => {
                if (!active() || !(late instanceof NotInvited)) return;
                setNotInvited(u.email ?? '');
                void signOut(auth).catch(() => {});
              });
          }
        }
        if (!active()) return;
        if (u) setNotInvited('');
        setUser(u);
        setProfile(p);
        setReady(true);
      });
    return () => {
      disposed = true;
      ++generation;
      unsubscribe();
    };
  }, [attempt]);

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
  if (user && profileError) return <main className="signin"><section className="card" aria-labelledby="profile-setup-title"><h1 id="profile-setup-title">Let’s finish setting up your account</h1><p role="alert">{profileError}</p><button type="button" className="btn primary" onClick={() => { setProfileError(''); setReady(false); setAttempt((n) => n + 1); }}>Retry account setup</button><button type="button" className="btn" onClick={() => void signOut(auth)}>Sign out</button></section></main>;
  return <Ctx.Provider value={{ user, profile, ready, notInvited, signOutNow: () => signOut(auth), setTextSize, setReading, setOnboardingLocal: (goal: string) => setProfile(p => p ? { ...p, onboarding: 'done', teacherGoal: goal } : p), setAvatarLocal: (k: string) => setProfile((p) => (p ? { ...p, avatar: k } : p)) }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
