import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isLearnerEmail } from './learners';
import { AFTER_SIGN_IN } from './afterSignIn';
import { codeProblem, forgetCode, keptCode, keptName, readCode, spendCode } from './codes';

export type TextSize = 'S' | 'M' | 'L' | 'XL';
export type Profile = (
  | { role: 'teacher'; displayName?: string }
  | { role: 'learner'; classId: string; learnerId: string; displayName: string }
) & { onboarding?: 'new' | 'done'; teacherGoal?: string; textSize?: TextSize; avatar?: string; reading?: Reading; showRecent?: boolean };

// Reading comfort settings: a clearer font, line focus, spacing and high contrast.
export type Reading = { font?: 'default' | 'clear'; focus?: boolean; letter?: 0 | 1 | 2; line?: 0 | 1 | 2; contrast?: boolean };

type AuthState = { user: User | null; profile: Profile | null; ready: boolean; notInvited: string; signOutNow: () => Promise<void>; setTextSize: (t: TextSize) => void; setReading: (r: Reading) => void; setOnboardingLocal: (goal: string) => void; setAvatarLocal: (k: string) => void };

const Ctx = createContext<AuthState>({ user: null, profile: null, ready: false, notInvited: '', signOutNow: async () => {}, setTextSize: () => {}, setReading: () => {}, setOnboardingLocal: () => {}, setAvatarLocal: () => {} });
export const TEXT_SCALE: Record<TextSize, number> = { S: 0.9, M: 1, L: 1.15, XL: 1.32 };

// Teachers join by invitation for now (see firestore.rules, users). An organisation's invitation
// travels with the new profile, from the link the teacher opened before signing in.
export function inviteFields(): { invite?: string } {
  try {
    const after = sessionStorage.getItem(AFTER_SIGN_IN) ?? '';
    const m = /^\/invite\/([^/?#]+)/.exec(after);
    return m ? { invite: m[1] } : {};
  } catch {
    return {};
  }
}

// Thrown when there is no invitation for this email: the account is not made.
class NotInvited extends Error {}

async function loadProfile(user: User): Promise<Profile | null> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data() as Profile;
  if (isLearnerEmail(user.email)) return null; // learner removed from class
  const displayName = user.displayName || keptName();
  // With an invitation code typed in on the sign-in page: the profile and one use of the code, together.
  const typed = keptCode();
  const code = typed ? await readCode(typed) : null;
  if (code && !codeProblem(code, user.email ?? '')) {
    const b = writeBatch(db);
    b.set(ref, { role: 'teacher', displayName, email: user.email ?? '', onboarding: 'new', createdAt: serverTimestamp(), code: code.code });
    spendCode(b, code, { uid: user.uid, name: displayName, email: user.email ?? '' });
    try {
      await b.commit();
      forgetCode();
      return { role: 'teacher', displayName, onboarding: 'new' };
    } catch (e) {
      if ((e as { code?: string })?.code === 'permission-denied') throw new NotInvited();
      throw e;
    }
  }
  const profile = { role: 'teacher' as const, displayName, email: user.email ?? '', onboarding: 'new', createdAt: serverTimestamp(), ...inviteFields() };
  try {
    await setDoc(ref, profile);
  } catch (e) {
    if ((e as { code?: string })?.code === 'permission-denied') throw new NotInvited();
    throw e;
  }
  return { role: 'teacher', displayName: profile.displayName, onboarding: 'new' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  // The email of someone who signed in without an invitation: their account is not kept.
  const [notInvited, setNotInvited] = useState('');

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        let p: Profile | null = null;
        if (u) {
          // A slow or stuck connection never leaves the app on its loading screen: after a few
          // seconds it opens with what it knows, and the profile follows when it arrives.
          const load = loadProfile(u);
          try {
            p = await Promise.race([load, new Promise<never>((_, no) => window.setTimeout(() => no(new Error('slow')), 9000))]);
          } catch (e) {
            if (e instanceof NotInvited) {
              setNotInvited(u.email ?? '');
              // Take back the sign-in account just made, so an invitation later starts afresh.
              await u.delete().catch(() => signOut(auth));
              await signOut(auth).catch(() => {});
              setUser(null);
              setProfile(null);
              setReady(true);
              return;
            }
            console.error('Could not load profile', e);
            p = isLearnerEmail(u.email) ? null : { role: 'teacher' };
            void load
              .then((late) => late && setProfile(late))
              .catch((late) => {
                if (!(late instanceof NotInvited)) return;
                setNotInvited(u.email ?? '');
                void u.delete().catch(() => {}).finally(() => void signOut(auth).catch(() => {}));
              });
          }
        }
        if (u) setNotInvited('');
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
  return <Ctx.Provider value={{ user, profile, ready, notInvited, signOutNow: () => signOut(auth), setTextSize, setReading, setOnboardingLocal: (goal: string) => setProfile(p => p ? { ...p, onboarding: 'done', teacherGoal: goal } : p), setAvatarLocal: (k: string) => setProfile((p) => (p ? { ...p, avatar: k } : p)) }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
