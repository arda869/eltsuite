import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { learnerEmail, learnerPassword } from './learners';

// "View as a learner": the teacher opens a new tab that is signed in as one of their learners.
// The tab keeps its sign-in to itself (session persistence), so the teacher's own tab stays
// signed in as the teacher. The learner's sign-in details travel in sessionStorage, which the
// browser copies into a tab opened with window.open, and are wiped as soon as they are used.

const KEY = 'll.proxy';
export type ProxyInfo = { email?: string; password?: string; token?: string; name: string; classId: string; path: string; signedIn?: boolean };

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

// A super admin signs in as a teacher or a learner (functions/index.js makes a one-time pass).
// The tab is opened inside the click, so pop-up blockers allow it, and filled once the pass comes.
export async function openAsUser(opts: { uid: string; name: string; path?: string }): Promise<string> {
  const w = window.open('about:blank', '_blank');
  if (!w) return 'Your browser blocked the new tab. Allow pop-ups for this site.';
  try {
    w.document.title = 'One moment…';
    w.document.body.innerHTML = '<p style="font:16px system-ui;margin:40px;color:#555">Opening ' + opts.name.replace(/[<>&]/g, '') + '’s view…</p>';
  } catch {
    /* fine */
  }
  try {
    const [{ getFunctions, httpsCallable }, { app }] = await Promise.all([import('firebase/functions'), import('./firebase')]);
    const r = await httpsCallable<{ uid: string }, { token: string; name: string }>(getFunctions(app, 'us-central1'), 'signInAs')({ uid: opts.uid });
    w.sessionStorage.setItem(KEY, JSON.stringify({ token: r.data.token, name: r.data.name || opts.name, classId: '', path: opts.path ?? '/' } satisfies ProxyInfo));
    w.location.href = '/?as-user=1';
    return '';
  } catch (e) {
    w.close();
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('not-found') && !code.includes('functions/not-found')) return 'There is no account like that any more.';
    if (code.includes('permission-denied')) return (e as Error).message || 'Only super admins can do this.';
    const msg = (e as Error).message || '';
    if (code.includes('failed-precondition')) return msg;
    if (code.includes('functions/not-found')) return 'The ELT Suite server isn’t set up yet, so signing in as someone isn’t available. (functions/not-found)';
    return `We couldn’t sign you in as ${opts.name}. Send this to support: ${code || 'no code'}${msg && msg !== code ? ` · ${msg}` : ''}`;
  }
}
