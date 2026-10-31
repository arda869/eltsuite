import type { User } from 'firebase/auth';
import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isLearnerEmail } from './learners';
import { AFTER_SIGN_IN } from './afterSignIn';
import { cleanCode, codeProblem, forgetCode, keptCode, keptName, spendCode, type InviteCode } from './codes';
import { TEACHER_PATHS } from './teacherPaths';

export type TextSize = 'S' | 'M' | 'L' | 'XL';
export type Reading = { font?: 'default' | 'clear'; focus?: boolean; letter?: 0 | 1 | 2; line?: 0 | 1 | 2; contrast?: boolean };
export type Profile = (
  | { role: 'teacher'; displayName?: string }
  | { role: 'learner'; classId: string; learnerId: string; displayName: string }
) & { onboarding?: 'new' | 'done'; teacherGoal?: string; textSize?: TextSize; avatar?: string; reading?: Reading; showRecent?: boolean };
export class NotInvited extends Error {}
export function inviteFields(): { invite?: string } {
  try { const m = /^\/invite\/([^/?#]+)/.exec(sessionStorage.getItem(AFTER_SIGN_IN) || ''); return m ? { invite: m[1] } : {}; }
  catch { return {}; }
}
const loads = new Map<string, Promise<Profile | null>>();
function profileOf(data: unknown): Profile {
  const p = data as Profile;
  if (p?.role !== 'teacher' && p?.role !== 'learner') throw new Error('Your account profile is incomplete. Please contact support.');
  return p;
}
async function provision(user: User): Promise<Profile | null> {
  const ref = doc(db, 'users', user.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) return profileOf(existing.data());
  if (isLearnerEmail(user.email)) return null;
  const displayName = user.displayName || keptName();
  const typed = cleanCode(keptCode());
  try {
    const result = await runTransaction(db, async (tx) => {
      // Recheck inside the transaction: another tab may already have completed setup.
      const current = await tx.get(ref);
      if (current.exists()) return profileOf(current.data());
      const p = { role: 'teacher' as const, displayName, email: user.email || '', onboarding: 'new' as const, createdAt: serverTimestamp(), ...inviteFields() };
      if (typed) {
        const code = await tx.get(doc(db, 'inviteCodes', typed));
        if (!code.exists()) throw new NotInvited('This invitation code is no longer available.');
        const c = { ...code.data(), code: code.id } as InviteCode;
        const problem = codeProblem(c, user.email || '');
        if (problem) throw new NotInvited(problem);
        tx.set(ref, { ...p, code: c.code });
        spendCode(tx, c, { uid: user.uid, name: displayName, email: user.email || '' });
      } else tx.set(ref, p);
      return { role: 'teacher' as const, displayName, onboarding: 'new' as const };
    });
    forgetCode();
    return result;
  } catch (e) {
    // A concurrent setup may have succeeded while this request was refused. Keep that account.
    if ((e as { code?: string }).code === 'permission-denied') {
      const current = await getDoc(ref);
      if (current.exists()) return profileOf(current.data());
      throw new NotInvited('This email needs a valid invitation before the account can be set up.');
    }
    throw e;
  }
}
// Strict Mode, repeated auth events and retries share one setup operation per account.
export function ensureProfile(user: User): Promise<Profile | null> {
  const pending = loads.get(user.uid);
  if (pending) return pending;
  const promise = provision(user);
  loads.set(user.uid, promise);
  void promise.finally(() => { if (loads.get(user.uid) === promise) loads.delete(user.uid); }).catch(() => {});
  return promise;
}
export function withSetupTimeout<T>(promise: Promise<T>, ms = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('Account setup timed out'), { code: 'deadline-exceeded' })), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}
export async function saveTeacherGoal(user: User, goal: string) {
  if (goal && !TEACHER_PATHS.some((p) => p.id === goal)) throw new Error('Choose one of the starting points shown.');
  const p = await withSetupTimeout(ensureProfile(user));
  if (p?.role !== 'teacher' || auth.currentUser?.uid !== user.uid) throw new Error('Please sign in again to finish setting up your teacher account.');
  await withSetupTimeout(updateDoc(doc(db, 'users', user.uid), { onboarding: 'done', teacherGoal: goal }));
}
export function setupErrorMessage(e: unknown) {
  switch ((e as { code?: string })?.code) {
    case 'deadline-exceeded': case 'unavailable': case 'network-request-failed':
      return 'We couldn’t connect to finish your account setup. Your choice is kept. Check your connection, then try again.';
    case 'permission-denied': case 'unauthenticated':
      return 'We couldn’t confirm your account access. Sign in again, then retry your saved choice.';
    default: return 'Your account setup hasn’t finished. Your choice is kept; please retry in a moment.';
  }
}
