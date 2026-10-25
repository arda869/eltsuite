import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

type AuthState = { user: User | null; ready: boolean; signOutNow: () => Promise<void> };

const Ctx = createContext<AuthState>({ user: null, ready: false, signOutNow: async () => {} });

// Make sure every signed-in teacher has a profile document.
async function ensureTeacherProfile(user: User) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      role: 'teacher',
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      createdAt: serverTimestamp(),
    });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        if (u) {
          try {
            await ensureTeacherProfile(u);
          } catch (e) {
            console.error('Could not create teacher profile', e);
          }
        }
        setUser(u);
        setReady(true);
      }),
    [],
  );

  return (
    <Ctx.Provider value={{ user, ready, signOutNow: () => signOut(auth) }}>{children}</Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
