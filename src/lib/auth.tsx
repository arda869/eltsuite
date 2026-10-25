import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isLearnerEmail } from './learners';

export type Profile =
  | { role: 'teacher'; displayName?: string }
  | { role: 'learner'; classId: string; learnerId: string; displayName: string };

type AuthState = { user: User | null; profile: Profile | null; ready: boolean; signOutNow: () => Promise<void> };

const Ctx = createContext<AuthState>({ user: null, profile: null, ready: false, signOutNow: async () => {} });

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

  return <Ctx.Provider value={{ user, profile, ready, signOutNow: () => signOut(auth) }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
