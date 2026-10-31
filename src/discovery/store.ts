import { useEffect, useState } from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { isProxyTab } from '../lib/proxy';
import { canDeliver, completed, defaults, FEATURES, recommendations, type DiscoveryState, type FeatureId } from './catalog';

let session: { uid: string; state: DiscoveryState } | null = null;
const ref = (uid: string) => doc(db, 'featureDiscovery', uid);
const stateOf = (data: Record<string, unknown> | undefined): DiscoveryState => {
  const base = defaults();
  return { ...base, ...data, settings: { ...base.settings, ...(data?.settings as object) } };
};
export async function changeDiscovery(uid: string, change: (s: DiscoveryState) => DiscoveryState) {
  if (auth.currentUser?.uid !== uid || isProxyTab()) throw Error('Sign in with your own teacher account.');
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(ref(uid));
    if (auth.currentUser?.uid !== uid) throw Error('Your account changed.');
    const previous = stateOf(snapshot.data()), next = change(previous);
    if (next !== previous) tx.set(ref(uid), next);
  });
}
// Called after successful writes only. No text, names, answers or class context is collected.
// Hash tokens let retries/autosaves count once without keeping resource identifiers.
export function noteFeature(id: FeatureId, eventKey: string) {
  const current = session;
  if (!current?.state.settings.tracking || auth.currentUser?.uid !== current.uid || isProxyTab()) return;
  void (async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(eventKey));
    const token = Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join('');
    if (session?.uid !== current.uid || !session.state.settings.tracking || session.state.usage[id]?.events.includes(token)) return;
    await changeDiscovery(current.uid, s => completed(s, id, token, Date.now()));
  })().catch(() => { /* Discovery never blocks the teaching workflow. */ });
}
export function useDiscovery(uid: string) {
  const [value, setValue] = useState<{ uid: string; state: DiscoveryState } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setValue(null); setError('');
    return onSnapshot(ref(uid), snap => {
      const state = stateOf(snap.data());
      session = { uid, state };
      setValue({ uid, state }); setError('');
    }, () => { session = null; setValue(null); setError('Feature discovery is unavailable. Please try again later.'); });
  }, [uid]);
  useEffect(() => () => { if (session?.uid === uid) session = null; }, [uid]);
  return { state: value?.uid === uid ? value.state : null, error };
}

// Wait for all permissions and fail closed. Re-evaluate immediately on account/org switches.
// Same switch order as useAppOn; only shipped, non-pilot workflows are in the catalog.
export function useDiscoveryAccess(uid: string) {
  const [access, setAccess] = useState<{ uid: string; allowed: FeatureId[] } | null>(null);
  useEffect(() => {
    let active = true, account: Record<string, any> | null = null, global: Record<string, boolean> | null = null, org: Record<string, any> | null = null, tokenOK = false;
    let stopOrg = () => {};
    const refresh = () => {
      if (!active) return;
      if (!tokenOK || !account || !global || (account.org && !org)) { setAccess(null); return; }
      const allowed = account.suspended || account.over ? [] : FEATURES.filter(f => {
        const k = f.app;
        if (account!.features?.[k] !== undefined) return account!.features[k] === true;
        if (org?.allow?.apps?.[k] === false || org?.policy?.apps?.[k] === false) return false;
        return org?.allow?.apps?.[k] === true || global![k] !== false;
      }).map(f => f.id);
      setAccess({ uid, allowed });
    };
    const fail = () => { if (active) { setAccess(null); tokenOK = false; } };
    void auth.currentUser?.getIdTokenResult().then(t => { tokenOK = !t.claims.proxyBy && !isProxyTab(); refresh(); }).catch(fail);
    const stopAccount = onSnapshot(doc(db, 'accounts', uid), s => {
      account = s.data() ?? {}; org = null; stopOrg();
      if (account.org) stopOrg = onSnapshot(doc(db, 'orgs', account.org), o => { org = o.data() ?? {}; refresh(); }, fail);
      refresh();
    }, fail);
    const stopGlobal = onSnapshot(doc(db, 'admin', 'features'), s => { global = s.data()?.apps ?? {}; refresh(); }, fail);
    return () => { active = false; stopAccount(); stopGlobal(); stopOrg(); };
  }, [uid]);
  return access?.uid === uid ? access.allowed : [];
}
export async function offerDiscovery(uid: string, allowed: FeatureId[], path: string, goal: string) {
  await changeDiscovery(uid, s => {
    const now = Date.now();
    if (!canDeliver(s, now, new Date(now).getHours())) return s;
    const next = recommendations(s, allowed, path, goal, now)[0]?.feature;
    if (!next) return s;
    return { ...s, feedback: { ...s.feedback, [next.id]: { ...s.feedback[next.id], offeredAt: now } }, delivery: { feature: next.id, at: now, read: false } };
  });
}
