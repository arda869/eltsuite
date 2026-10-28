import type { ReactNode } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { useAccount, useSuper } from '../lib/admin';
import { Wordmark } from './Wordmark';

// A paused account opens nothing until a super admin of ELT Suite turns it back on. Nothing is deleted.
export function PausedGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const acc = useAccount(user?.uid);
  const isSuper = useSuper();
  if (!user || !acc?.suspended || isSuper) return <>{children}</>;
  return (
    <div className="inv">
      <div className="inv-card">
        <span className="inv-brand">
          <Wordmark />
        </span>
        <h1>Your account is paused</h1>
        <p className="hint">Your classes, lessons and files are kept. To use ELT Suite again, write to the person who runs your account or your organisation.</p>
        <button type="button" className="btn" onClick={() => void signOut(auth)}>
          Sign out
        </button>
      </div>
    </div>
  );
}
