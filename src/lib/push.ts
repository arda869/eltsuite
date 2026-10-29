import { getMessaging, getToken, deleteToken, isSupported } from 'firebase/messaging';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { app, db } from './firebase';

// Notifications on phones and computers (web push). On an iPhone or iPad they work once
// ELT Suite is on the home screen; elsewhere, in the browser too.
// The public key of the project's web push certificate (Firebase console › Cloud Messaging).
export const VAPID_KEY = 'BG4WQX_uXyVf6qWOCgViDjVnWgzIub0Ko31AL_FPy0kPO9sOXcq5yohlNV36fPqwkX1qe7KNydWm-ZEM7nQwpjc';

export type PushState = 'unsupported' | 'install-first' | 'not-ready' | 'denied' | 'off' | 'on';
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const ON = 'll.push';

export async function pushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'install-first';
  if (!('serviceWorker' in navigator) || !('Notification' in window) || !(await isSupported().catch(() => false))) return 'unsupported';
  if (!VAPID_KEY) return 'not-ready';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return Notification.permission === 'granted' && localStorage.getItem(ON) ? 'on' : 'off';
  } catch {
    return 'off';
  }
}

// The last try on each device, kept on the profile, so a device that quietly gets nothing can be
// looked into (step reached and error, no token).
const note = (uid: string, step: string, err = '') =>
  updateDoc(doc(db, 'users', uid), { [`pushLog.${(isIos() ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'computer') + (isStandalone() ? '-app' : '-browser')}`]: { step, err: err.slice(0, 300), at: Date.now() } }).catch(() => {});
export async function enablePush(uid: string, key: string, role: string, classId = '') {
  let step = 'permission';
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return void note(uid, step, perm), false;
    step = 'service worker';
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    step = 'token';
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if (!token) return void note(uid, step, 'no token'), false;
    step = 'save';
    await setDoc(doc(db, 'pushTokens', token), { token, uid, key, role, classId, at: serverTimestamp(), device: navigator.userAgent.slice(0, 160) });
    void note(uid, 'saved');
  } catch (e) {
    void note(uid, step, String((e as Error)?.message ?? e));
    throw e;
  }
  try {
    localStorage.setItem(ON, token);
  } catch {
    /* fine */
  }
  return true;
}

export async function disablePush() {
  let token = '';
  try {
    token = localStorage.getItem(ON) ?? '';
    localStorage.removeItem(ON);
  } catch {
    /* fine */
  }
  if (token) await deleteDoc(doc(db, 'pushTokens', token)).catch(() => {});
  await deleteToken(getMessaging(app)).catch(() => {});
}

// Keep the service worker registered for an installed app, so it opens fast and can be found again.
export function startServiceWorker() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
}
