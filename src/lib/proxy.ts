import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { learnerEmail, learnerPassword } from './learners';

// "View as a learner": the teacher opens a new tab that is signed in as one of their learners.
// The tab keeps its sign-in to itself (session persistence), so the teacher's own tab stays
// signed in as the teacher. The learner's sign-in details travel in sessionStorage, which the
// browser copies into a tab opened with window.open, and are wiped as soon as they are used.

const KEY = 'll.proxy';
export type ProxyInfo = { email?: string; password?: string; name: string; classId: string; path: string; signedIn?: boolean };

export const isProxyTab = () => {
  try {
    return !!sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
};
export function readProxy(): ProxyInfo | null {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function writeProxy(p: ProxyInfo | null) {
  try {
    if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private window */
  }
}

// Must run inside a click (pop-up blockers), so the PIN has to be known already.
export function openAsLearner(opts: { classId: string; classCode: string; learnerId: string; name: string; pin: string; path?: string }) {
  if (!opts.pin) return false;
  writeProxy({ email: learnerEmail(opts.learnerId), password: learnerPassword(opts.classCode, opts.pin), name: opts.name, classId: opts.classId, path: opts.path ?? '/' });
  const w = window.open('/?as-learner=1', '_blank');
  // The new tab has its own copy now; this tab must not keep the details.
  window.setTimeout(() => writeProxy(null), 0);
  return !!w;
}

export async function loadPins(classId: string, learnerIds: string[]) {
  const out: Record<string, string> = {};
  await Promise.all(
    learnerIds.map(async (id) => {
      const s = await getDoc(doc(db, 'classes', classId, 'secrets', id)).catch(() => null);
      if (s?.exists()) out[id] = (s.data().pin as string) ?? '';
    }),
  );
  return out;
}
